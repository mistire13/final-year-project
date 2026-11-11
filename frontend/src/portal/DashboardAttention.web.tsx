import React, { useEffect, useState } from "react";
import { portalClient } from "./api";
import { metrics, type Dataset } from "./model";
import { Button, Card, Icon } from "./ui.web";

const receiptQueues = [
  { status: "review_pending", title: "Bank receipts to review", action: "Review receipts" },
  { status: "verified_unapplied", title: "Confirmed payments to reconcile", action: "Reconcile payments" },
] as const;

type AttentionItem = {
  title: string;
  count: number;
  icon: string;
  action: string;
  page: string;
  fragment?: string;
};

export default function DashboardAttention({ data, date, preview, go }: {
  data: Dataset;
  date: string;
  preview: boolean;
  go: (page: string, fragment?: string) => void;
}) {
  const [receipts, setReceipts] = useState<number[] | null>(null);
  const [receiptError, setReceiptError] = useState(false);

  useEffect(() => {
    if (preview) return;
    let active = true;
    Promise.all(receiptQueues.map(async ({ status }) => {
      const { data } = await portalClient.get<{ total: number }>("/daycare-payments/requests", {
        params: { status, limit: 1 },
      });
      if (!Number.isSafeInteger(data.total) || data.total < 0) throw new Error("Receipt count unavailable");
      return data.total;
    })).then(counts => {
      if (active) setReceipts(counts);
    }).catch(() => {
      if (active) setReceiptError(true);
    });
    return () => { active = false; };
  }, [preview]);

  const items: AttentionItem[] = [
    { title: "Pickup requests", count: (data.guardianRequests || []).filter(request => request.status === "pending").length, icon: "shield", action: "Review pickup requests", page: "children" },
    { title: "Health updates to send", count: data.health.filter(record => !record.parent_notified).length, icon: "heart", action: "Open health records", page: "health" },
    ...receiptQueues.map(({ status, title, action }, index) => ({
      title, action, count: receipts?.[index] ?? 0, icon: "file", page: "bank-receipts", fragment: status,
    })),
    { title: "Daily reports remaining", count: metrics(data, date).missing, icon: "file", action: "Open daily reports", page: "reports" },
  ];
  if (data.daycare?.features?.shop) {
    items.push({ title: "Products low in stock", count: data.products.filter(product => product.stock_qty <= 5).length, icon: "store", action: "Check stock", page: "store" });
  }
  const pending = items.filter(item => item.count > 0);
  const checkingReceipts = !preview && !receiptError && receipts === null;

  return (
    <Card className="p-dashboard-attention">
      <div className="p-card-head">
        <div>
          <h2>Needs attention</h2>
        </div>
        <span className="p-icon-tile"><Icon name="bell" /></span>
      </div>
      {pending.length > 0 && (
        <ul className="p-attention-grid">
          {pending.map(item => (
            <li key={item.title}>
              <div className="p-attention-title">
                <Icon name={item.icon} size={18} />
                <h3>{item.title}</h3>
                <strong>{item.count}</strong>
              </div>
              <Button variant="secondary" onClick={() => go(item.page, item.fragment)}>
                {item.action} <Icon name="arrow" size={16} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {checkingReceipts && <p role="status">Checking for bank receipts that need review…</p>}
      {receiptError && <div className="p-attention-fallback">
        <p role="status">Bank receipt counts are unavailable.</p>
        <Button variant="secondary" onClick={() => go("bank-receipts")}>Open bank receipts</Button>
      </div>}
      {!pending.length && !checkingReceipts && !receiptError && <p>No items need attention for this view.</p>}
    </Card>
  );
}
