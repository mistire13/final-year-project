"use strict";
/**
 * src/modules/store/store.service.js
 * Business logic for Products & E-Commerce Orders.
 * SRS Refs: FR-ECM-01–16, Architecture Plan §5.8, §6.2 Query 5
 */
const db = require("../../config/db");
const crypto = require("node:crypto");
const { auditedWrite, writeAudit } = require('../../utils/auditedWrite');

/**
 * List products catalog (Architecture Plan §6.2 Query 5).
 * Uses idx_prod_available partial index.
 */
/**
 * List products catalog (Architecture Plan §6.2 Query 5).
 * Uses idx_prod_available partial index.
 */
const listProducts = async (query = {}, user) => {
  const categoryId = query.category_id ? parseInt(query.category_id, 10) : null;
  const availableOnly = query.available_only !== "false";
  const isSuper = user && user.role === "super_admin";
  const daycareId = user?.daycare_id || null;

  let sql = `
    SELECT p.id, p.name, p.description, p.price, p.stock_qty, p.available, p.category_id, p.image_url, p.updated_at, p.daycare_id, p.version,
           pc.name AS category_name
    FROM products p
    LEFT JOIN product_categories pc ON pc.id = p.category_id
    WHERE 1=1
  `;

  const params = [];
  if (availableOnly) {
    sql += ` AND p.available = TRUE`;
  }
  if (categoryId) {
    params.push(categoryId);
    sql += ` AND p.category_id = $${params.length}`;
  }
  if (!isSuper) {
    params.push(daycareId);
    sql += ` AND (p.daycare_id = $${params.length})`;
  }

  sql += ` ORDER BY p.name ASC`;

  const { rows } = await db.query(sql, params);
  return { data: rows };
};

/**
 * Create a new product in the store (Admin only).
 */
const createProduct = async (body, user) => {
  await assertCategory(body.category_id, user);
  return auditedWrite(user,'PRODUCT_CREATED','products',async client=>{
  const daycareId =
    user.role === "super_admin" ? body.daycare_id || null : user.daycare_id;
  const { rows } = await client.query(
    `INSERT INTO products (name, description, price, category_id, stock_qty, available, created_by, daycare_id, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      body.name,
      body.description || null,
      body.price,
      body.category_id || null,
      body.stock_qty ?? 0,
      body.available ?? true,
      user.id,
      daycareId,
      body.image_url || null,
    ],
  );
  return rows[0];
  });
};

/**
 * Update product details or stock (Admin only).
 */
const updateProduct = async (productIdParam, body, user) => {
  await assertCategory(body.category_id, user);
  const productId = parseInt(productIdParam, 10);

  const { rows: existingRows } = await db.query(
    `SELECT id, daycare_id, version FROM products WHERE id = $1`,
    [productId],
  );
  if (existingRows.length === 0) {
    const err = new Error("Product not found");
    err.statusCode = 404;
    throw err;
  }
  const existing = existingRows[0];
  if (!user?.daycare_id || existing.daycare_id !== user.daycare_id) {
    const err = new Error("Product not found");
    err.statusCode = 404;
    throw err;
  }

  if (!Number.isSafeInteger(body.version) || body.version < 1)
    throw Object.assign(new Error("Reload the product before saving."), {
      statusCode: 422,
    });
  const fields = [];
  const vals = [];
  let idx = 1;

  if (body.name !== undefined) {
    fields.push(`name = $${idx++}`);
    vals.push(body.name);
  }
  if (body.description !== undefined) {
    fields.push(`description = $${idx++}`);
    vals.push(body.description || null);
  }
  if (body.price !== undefined) {
    fields.push(`price = $${idx++}`);
    vals.push(body.price);
  }
  if (body.category_id !== undefined) {
    fields.push(`category_id = $${idx++}`);
    vals.push(body.category_id || null);
  }
  if (body.stock_qty !== undefined) {
    fields.push(`stock_qty = $${idx++}`);
    vals.push(body.stock_qty);
  }
  if (body.available !== undefined) {
    fields.push(`available = $${idx++}`);
    vals.push(body.available);
  }
  if (body.image_url !== undefined) {
    fields.push(`image_url = $${idx++}`);
    vals.push(body.image_url || null);
  }

  if (fields.length === 0) {
    const err = new Error("No fields provided for update");
    err.statusCode = 422;
    throw err;
  }

  fields.push(`updated_at = NOW()`);
  vals.push(productId, body.version);

  const { rows } = await db.query(
    `UPDATE products SET ${fields.join(", ")} WHERE id = $${idx} AND version = $${idx + 1} RETURNING *`,
    vals,
  );

  if (!rows.length)
    throw Object.assign(new Error("Product changed. Reload before saving."), {
      statusCode: 409,
    });
  return rows[0];
};

/**
 * Place order with transactional inventory check & snapshot pricing.
 */
const placeOrder = async (body, user) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const items = [...body.items].sort(
      (a, b) => Number(a.product_id) - Number(b.product_id),
    );
    const note = typeof body.note === "string" ? body.note.trim() : "";
    const requestHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ items, note }))
      .digest("hex");
    if (body.idempotency_key) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`${user.daycare_id}:${user.id}:${body.idempotency_key}`],
      );
      const {
        rows: [existing],
      } = await client.query(
        "SELECT * FROM orders WHERE daycare_id=$1 AND parent_id=$2 AND idempotency_key=$3",
        [user.daycare_id, user.id, body.idempotency_key],
      );
      if (existing) {
        if (existing.request_hash !== requestHash)
          throw Object.assign(
            new Error(
              "This checkout was already submitted with different items. Start a new checkout.",
            ),
            { statusCode: 409 },
          );
        existing.items = (
          await client.query(
            "SELECT oi.*,p.name AS product_name FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE order_id=$1 ORDER BY oi.id",
            [existing.id],
          )
        ).rows;
        await client.query("COMMIT");
        return existing;
      }
    }
    let total = 0;
    const preparedItems = [];

    // 1. Verify stock and calculate total with price snapshot
    for (const item of items) {
      const prodId = parseInt(item.product_id, 10);
      const qty = parseInt(item.quantity, 10);

      const { rows: prodRows } = await client.query(
        `SELECT id, name, price, stock_qty, available, daycare_id FROM products WHERE id = $1 FOR UPDATE`,
        [prodId],
      );

      if (prodRows.length === 0 || !prodRows[0].available) {
        const err = new Error(`Product ID ${prodId} is not available`);
        err.statusCode = 404;
        throw err;
      }

      const prod = prodRows[0];
      if (!user.daycare_id || prod.daycare_id !== user.daycare_id) {
        const err = new Error(
          `Product ID ${prodId} is not available in your daycare`,
        );
        err.statusCode = 404;
        throw err;
      }

      if (prod.stock_qty < qty) {
        const err = new Error(
          `Insufficient stock for "${prod.name}". Available: ${prod.stock_qty}, Requested: ${qty}`,
        );
        err.statusCode = 422;
        throw err;
      }

      // Decrement stock
      const newStock = prod.stock_qty - qty;
      await client.query(
        `UPDATE products SET stock_qty = stock_qty - $1, updated_at = NOW() WHERE id = $2`,
        [qty, prodId],
      );

      // Low-stock auto-alert (FR-ECM-06): Alert admins when stock drops <= 5
      if (newStock <= 5) {
        await client.query(
          `INSERT INTO alerts (author_id, title, urgency, recipient_scope, daycare_id)
           VALUES ($1, $2, 'high', 'caregivers', $3)`,
          [
            user.id,
            `Low stock alert: "${prod.name}" has only ${newStock} units left`,
            user.daycare_id || prod.daycare_id || null,
          ],
        );
      }

      const unitPrice = parseFloat(prod.price);
      total += unitPrice * qty;

      preparedItems.push({
        product_id: prodId,
        product_name: prod.name,
        quantity: qty,
        unit_price: unitPrice,
      });
    }

    // 2. Create order stamped with user's daycare_id
    const daycareId = user.role === "super_admin" ? null : user.daycare_id;
    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (parent_id, total, order_status, payment_status, daycare_id, note, idempotency_key, request_hash)
       VALUES ($1, $2, 'placed', 'unpaid', $3, $4, $5, $6)
       RETURNING *`,
      [
        user.id,
        total,
        daycareId,
        note,
        body.idempotency_key || null,
        requestHash,
      ],
    );

    const order = orderRows[0];

    // 3. Insert order items (snapshot price)
    const orderItems = [];
    for (const item of preparedItems) {
      const { rows: itemRows } = await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [order.id, item.product_id, item.quantity, item.unit_price],
      );
      orderItems.push({
        ...itemRows[0],
        product_name: item.product_name,
      });
    }

    // Zero-total orders need no settlement or simulated transfer.
    if (total === 0) {
      const {rows:[settled]} = await client.query("UPDATE orders SET payment_status='paid' WHERE id=$1 RETURNING *",[order.id]);
      Object.assign(order,settled);
    }
    // 4. Create initial payment record
    await client.query(
      `INSERT INTO payments (order_id, method, status, verified_at)
       VALUES ($1, $2, $3, $4)`,
      [order.id,total === 0 ? 'no_charge' : 'pay_at_daycare',total === 0 ? 'paid' : 'unpaid',total === 0 ? new Date() : null],
    );

    await writeAudit(client,user,'ORDER_PLACED','orders',order.id,{total,no_charge:total === 0});

    await client.query("COMMIT");

    return {
      ...order,
      items: orderItems,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

/**
 * List parent's orders.
 */
const listMyOrders = async (user) => {
  const isSuper = user.role === "super_admin";
  const daycareId = user.daycare_id || null;

  const { rows: orders } = await db.query(
    `SELECT o.id, o.total, o.order_status, o.payment_status, o.created_at, o.daycare_id, o.note, o.version,
       (SELECT method FROM payments WHERE order_id=o.id) AS payment_method,
       (SELECT gateway_ref FROM payments WHERE order_id=o.id) AS payment_reference
     FROM orders o
     WHERE o.parent_id = $1
       AND ($2::boolean = TRUE OR o.daycare_id = $3)
     ORDER BY o.created_at DESC`,
    [user.id, isSuper, daycareId],
  );

  for (const order of orders) {
    const { rows: items } = await db.query(
      `SELECT oi.id, oi.product_id, p.name AS product_name, oi.quantity, oi.unit_price
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1`,
      [order.id],
    );
    order.items = items;
  }

  return { data: orders };
};

/**
 * List all orders for administrative view.
 */
const listAllOrders = async (query = {}, user) => {
  const isSuper = user && user.role === "super_admin";
  const daycareId = user?.daycare_id || null;

  const { rows: orders } = await db.query(
    `SELECT o.id, o.parent_id, u.name AS parent_name, o.total, o.order_status, o.payment_status, o.created_at, o.daycare_id, o.note, o.version
     FROM orders o
     JOIN users u ON u.id = o.parent_id
     WHERE ($1::boolean = TRUE OR o.daycare_id = $2)
     ORDER BY o.created_at DESC`,
    [isSuper, daycareId],
  );

  return { data: orders };
};

/**
 * Update order and payment status (Admin only).
 */
const updateOrderStatus = async (orderIdParam, body, user) => {
  const orderId = parseInt(orderIdParam, 10);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { rows: existingRows } = await client.query(
      `SELECT id, daycare_id, version, order_status, payment_status, total FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId],
    );
    if (existingRows.length === 0) {
      const err = new Error("Order not found");
      err.statusCode = 404;
      throw err;
    }
    const existing = existingRows[0];
    if (!user?.daycare_id || existing.daycare_id !== user.daycare_id) {
      const err = new Error("Order not found");
      err.statusCode = 404;
      throw err;
    }

    const failure = (message, statusCode = 409) =>
      Object.assign(new Error(message), { statusCode });
    if (body.version !== undefined) {
      if (!Number.isSafeInteger(body.version) || body.version < 1)
        throw failure("Reload the order before saving.", 422);
      if (body.version !== existing.version)
        throw failure("Order changed. Reload before saving.");
    }
    const nextStatus = body.order_status ?? existing.order_status;
    const nextPayment = body.payment_status ?? existing.payment_status;
    const transitions = {
      placed: ["confirmed", "cancelled"],
      confirmed: ["ready_for_pickup", "cancelled"],
      ready_for_pickup: ["collected", "cancelled"],
      collected: [],
      cancelled: [],
    };
    if (
      nextStatus !== existing.order_status &&
      !transitions[existing.order_status]?.includes(nextStatus)
    )
      throw failure("This order status transition is not allowed.");
    if (
      existing.order_status === "cancelled" &&
      nextPayment !== existing.payment_status
    )
      throw failure("A cancelled order cannot accept payment.");
    if (existing.payment_status === "paid" && nextPayment !== "paid")
      throw failure(
        "Recorded payments cannot be reversed here. A refund workflow is required.",
      );
    if (nextStatus === "collected" && nextPayment !== "paid")
      throw failure("Record payment before collecting this order.");
    if (nextStatus === "cancelled" && ["paid", "pending"].includes(nextPayment) && Number(existing.total) !== 0)
      throw failure("Resolve payment or refund before cancelling this order.");
    if (nextStatus === "cancelled" && existing.order_status !== "cancelled") {
      // Same product order as checkout: competing cancellations cannot deadlock.
      const { rows: items } = await client.query(
        "SELECT product_id,SUM(quantity)::int AS quantity FROM order_items WHERE order_id=$1 GROUP BY product_id ORDER BY product_id",
        [orderId],
      );
      for (const item of items)
        await client.query(
          "UPDATE products SET stock_qty=stock_qty+$1 WHERE id=$2 AND daycare_id=$3",
          [item.quantity, item.product_id, existing.daycare_id],
        );
    }

    const fields = [];
    const vals = [];
    let idx = 1;

    if (body.order_status !== undefined) {
      fields.push(`order_status = $${idx++}`);
      vals.push(body.order_status);
    }
    if (body.payment_status !== undefined) {
      fields.push(`payment_status = $${idx++}`);
      vals.push(body.payment_status);
    }

    if (fields.length === 0) {
      const err = new Error("No status fields provided");
      err.statusCode = 422;
      throw err;
    }

    fields.push(`updated_at = NOW()`);
    vals.push(orderId);
    let whereClause = `WHERE id = $${idx++}`;
    if (body.version !== undefined) {
      vals.push(body.version);
      whereClause += ` AND version = $${idx++}`;
    }

    const { rows } = await client.query(
      `UPDATE orders SET ${fields.join(", ")} ${whereClause} RETURNING *`,
      vals,
    );

    if (!rows.length) throw failure("Order changed. Reload before saving.");
    const order = rows[0];

    // Synchronize payment status if payment_status changed
    if (
      body.payment_status !== undefined &&
      body.payment_status !== existing.payment_status
    ) {
      const verifiedAt = body.payment_status === "paid" ? new Date() : null;
      await client.query(
        `UPDATE payments SET status = $1, verified_at = $2 WHERE order_id = $3`,
        [body.payment_status, verifiedAt, orderId],
      );
    }

    await client.query(
      "INSERT INTO audit_logs(actor_id,action,target_table,target_id,metadata,daycare_id) VALUES($1,$2,$3,$4,$5,$6)",
      [
        user.id,
        "ORDER_STATUS_UPDATED",
        "orders",
        orderId,
        JSON.stringify({
          before: {
            order_status: existing.order_status,
            payment_status: existing.payment_status,
          },
          after: { order_status: nextStatus, payment_status: nextPayment },
          stock_restored:
            nextStatus === "cancelled" && existing.order_status !== "cancelled",
        }),
        existing.daycare_id,
      ],
    );
    await client.query("COMMIT");
    return order;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Category Management — §8.10 | SRS: FR-ECM-01
 */
function categoryActor(user) {
  if (
    !user?.daycare_id ||
    !["admin", "caregiver", "parent"].includes(user.role)
  ) {
    throw Object.assign(new Error("Daycare account required"), {
      statusCode: 403,
    });
  }
  return user.daycare_id;
}
async function assertCategory(id, user) {
  if (id == null) return;
  const tenant = categoryActor(user);
  const { rows } = await db.query(
    "SELECT id FROM product_categories WHERE id=$1 AND (daycare_id=$2 OR daycare_id IS NULL)",
    [id, tenant],
  );
  if (!rows.length)
    throw Object.assign(new Error("Category not found"), { statusCode: 404 });
}
const listCategories = async (user) => {
  const tenant = categoryActor(user);
  const { rows } = await db.query(
    `SELECT c.id,c.name,c.daycare_id,COUNT(p.id)::int AS product_count
    FROM product_categories c LEFT JOIN products p ON p.category_id=c.id AND p.daycare_id=$1
    WHERE c.daycare_id=$1 OR c.daycare_id IS NULL GROUP BY c.id ORDER BY c.name`,
    [tenant],
  );
  return { data: rows };
};
const createCategory = async (body, user) => {
  const tenant = categoryActor(user);
  try {
    return (
      await db.query(
        "INSERT INTO product_categories(name,daycare_id) VALUES($1,$2) RETURNING *",
        [body.name.trim(), tenant],
      )
    ).rows[0];
  } catch (error) {
    if (error.code === "23505")
      throw Object.assign(
        new Error("A category with this name already exists"),
        { statusCode: 409 },
      );
    throw error;
  }
};
const updateCategory = async (id, body, user) => {
  const tenant = categoryActor(user);
  try {
    const { rows } = await db.query(
      "UPDATE product_categories SET name=$1 WHERE id=$2 AND daycare_id=$3 RETURNING *",
      [body.name.trim(), id, tenant],
    );
    if (!rows.length)
      throw Object.assign(
        new Error("Category not found or shared category is read-only"),
        { statusCode: 404 },
      );
    return rows[0];
  } catch (error) {
    if (error.code === "23505")
      throw Object.assign(
        new Error("A category with this name already exists"),
        { statusCode: 409 },
      );
    throw error;
  }
};
const deleteCategory = async (id, user) => {
  const tenant = categoryActor(user);
  const { transaction } = require("../auth/legacy-security");
  return transaction(db, async (client) => {
    const { rows } = await client.query(
      "SELECT id FROM product_categories WHERE id=$1 AND daycare_id=$2 FOR UPDATE",
      [id, tenant],
    );
    if (!rows.length)
      throw Object.assign(
        new Error("Category not found or shared category is read-only"),
        { statusCode: 404 },
      );
    const used = await client.query(
      "SELECT 1 FROM products WHERE category_id=$1 LIMIT 1",
      [id],
    );
    if (used.rows.length)
      throw Object.assign(new Error("Category has assigned products"), {
        statusCode: 409,
      });
    await client.query(
      "DELETE FROM product_categories WHERE id=$1 AND daycare_id=$2",
      [id, tenant],
    );
    return { message: "Category deleted successfully" };
  });
};

module.exports = {
  listProducts,
  createProduct,
  updateProduct,
  placeOrder,
  listMyOrders,
  listAllOrders,
  updateOrderStatus,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
