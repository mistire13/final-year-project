import React, { useEffect, useState } from "react";
import { apiError, portalClient } from "./api";
import { Row, localDay, money } from "./model";
import { Badge, Button, Card, Table } from "./ui.web";

/** Existing receipts remain readable after Plus ends, including older orders. */
export default function OrderHistory({ daycareId, refreshKey, query }: {
  daycareId?: number; refreshKey: unknown; query: string;
}) {
  const [orders, setOrders] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setOrders([]);
    portalClient.get('/store/orders').then(({ data }) => {
      if (active) setOrders(data.data);
    }).catch(e => {
      if (active) setError(apiError(e));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [daycareId, refreshKey, attempt]);

  return <Card title="Order history">
    {error ? <div role="alert" className="p-error">
      <p>{error}</p>
      <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>Retry</Button>
    </div> : loading ? <p role="status">Loading order history…</p> : <Table
      rows={orders.filter(order => JSON.stringify(order).toLowerCase().includes(query.trim().toLowerCase()))}
      columns={[
        { key: 'id', title: 'Order', render: row => `#ANK-${row.id}` },
        { key: 'created_at', title: 'Date', render: row => localDay(row.created_at) },
        { key: 'parent_name', title: 'Parent' },
        { key: 'total', title: 'Total', render: row => money(row.total) },
        { key: 'order_status', title: 'Fulfillment', render: row => <Badge value={row.order_status} /> },
        { key: 'payment_status', title: 'Payment', render: row => <Badge value={row.payment_status} /> },
        { key: 'payment_reference', title: 'Receipt', render: row => row.payment_reference || '—' },
        { key: 'refund', title: 'Cash return', render: row => row.refund ? `${money(row.refund.amount)} · ${row.refund.refund_reference}` : '—' },
      ]}
    />}
  </Card>;
}
