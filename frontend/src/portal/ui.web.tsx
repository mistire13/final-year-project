import React, { ReactNode, useEffect, useRef, useState } from "react";
import { Row, initials, label, exportCsv } from "./model";
import { motion, useReducedMotion, useAnimate } from "motion/react";
const paths: Record<string, string> = {
  home: "M3 10 12 3l9 7v11h-6v-7H9v7H3Z",
  chart: "M4 20V10m8 10V4m8 16v-7",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m8-7a4 4 0 0 1 0 8m1 3a4 4 0 0 1 4 4v2",
  child: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M8 9h.01M16 9h.01M8 14q4 5 8 0",
  desk: "M3 10h18v5H3Zm2 5v6m14-6v6M7 10V4h10v6",
  check: "m5 12 4 4 10-10",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 4v6l4 2",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6",
  calendar: "M4 5h16v16H4ZM8 2v6m8-6v6M4 11h16",
  file: "M5 3h10l4 4v14H5Zm4 7h6m-6 4h6m-6 4h4",
  heart: "M12 20S1 13 3 7c2-6 8-4 9 0 1-4 7-6 9 0 2 6-9 13-9 13Z",
  message: "M3 4h18v13H9l-6 4Z",
  store: "M4 8h16l-2-5H6ZM5 8v13h14V8M9 21v-8h6v8",
  audit: "M5 3h14v18H5Zm4 5h6m-6 4h6m-6 4h6",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  close: "m6 6 12 12M6 18 18 6",
  menu: "M4 6h16M4 12h16M4 18h16",
  logout: "M9 4H4v16h5m4-8h8m-4-4 4 4-4 4",
  download: "M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5",
  refresh: "M20 7V3m0 4h-4M4 17v4m0-4h4M4 9a8 8 0 0 1 14-4m2 10a8 8 0 0 1-14 4",
  bell: "M5 17h14l-2-4V9a5 5 0 0 0-10 0v4Zm5 3h4",
  leaf: "M20 3C7 1 1 11 8 17 14 22 22 15 20 3ZM5 21l10-12",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z",
  building: "M3 21h18M3 7v14M21 7v14M6 7V3h12v4M9 7v2m0 4v2m0 4v2m6-12v2m0 4v2m0 4v2",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  briefcase: "M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2",
  award: "M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm0 0v7l3.5-2 3.5 2V15m-14 0v7l3.5-2 3.5 2V15",
  smartphone: "M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 16h.01",
  alert: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4m0 4h.01",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 0c-2.5 3-4 7-4 10s1.5 7 4 10m0-20c2.5 3 4 7 4 10s-1.5 7-4 10M2 12h20",
  sparkles: "m12 3 2.1 5.9L20 11l-5.9 2.1L12 19l-2.1-5.9L4 11l5.9-2.1z",
  rocket: "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.77 22.77 0 0 1-3.95 2z",
  bot: "M12 8V4H8m4 0h4m-4 4a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4zm-6 6h2m12 0h2M9 13v2m6-2v2",
  lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zm-12 0V7a5 5 0 0 1 10 0v4",
  key: "m21 2-2 2m-1.5 1.5L14 9l-1.5-1.5-2 2 1.5 1.5L9 14l-1.5-1.5-2 2 1.5 1.5-3.5 3.5a2.12 2.12 0 0 0 3 3L10 19l1.5 1.5 2-2-1.5-1.5 3-3 1.5 1.5 2-2-1.5-1.5 3.5-3.5a2.12 2.12 0 0 0 0-3z",
  zap: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zm11-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  bag: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18m-5 4a4 4 0 0 1-8 0",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  clipboard: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2m2-2h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z",
  checkCircle: "m9 12 2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.file} />
    </svg>
  );
}
export function Button({
  children,
  icon,
  onClick,
  variant = "",
  disabled = false,
  type = "button",
  style,
  className = "",
}: {
  children: ReactNode;
  icon?: string;
  onClick?: () => void;
  variant?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <motion.button whileHover={disabled ? undefined : { y: -1 }} whileTap={disabled ? undefined : { scale: .98 }}
      type={type}
      className={`p-button ${variant} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      style={style}
    >
      {icon && <Icon name={icon} size={17} />} {children}
    </motion.button>
  );
}
export function Badge({ value, tone }: { value: unknown; tone?: string }) {
  const text = String(value ?? "unknown");
  return (
    <span
      className={
        "p-badge " +
        (tone ||
          ([
            "active",
            "checkin",
            "paid",
            "complete",
            "success",
            "on_duty",
            "approved",
          ].includes(text)
            ? "green"
            : ["absent", "high", "failed", "inactive", "revoked"].includes(text)
              ? "red"
              : [
                    "pending",
                    "placed",
                    "waitlist",
                    "scheduled",
                    "unpaid",
                    "manual_fallback",
                  ].includes(text)
                ? "gold"
                : "neutral"))
      }
    >
      {label(
        text === "checkin"
          ? "present"
          : text === "checkout"
            ? "collected"
            : text,
      )}
    </span>
  );
}
export function Person({ name, sub }: { name: string; sub?: string }) {
  return (
    <div className="p-person">
      <span className="p-avatar">{initials(name || "?")}</span>
      <span>
        <strong>{name || "Unassigned"}</strong>
        {sub && <small>{sub}</small>}
      </span>
    </div>
  );
}
export function Card({
  children,
  className = "",
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.section initial={reduce ? false : { opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className={"p-card " + className}>
      {(title || action) && (
        <div className="p-card-head">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </motion.section>
  );
}
export function Empty({
  title = "No records yet",
  text = "Records will appear here when they are available.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="p-empty">
      <Icon name="leaf" size={32} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
export type Column = {
  key: string;
  title: string;
  render?: (row: Row) => ReactNode;
};
export function Table({
  rows,
  columns,
  pageSize = 8,
}: {
  rows: Row[];
  columns: Column[];
  pageSize?: number;
}) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "", direction: 1 });
  useEffect(() => setPage(1), [rows.length]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const sorted = [...rows].sort((a, b) =>
    sort.key
      ? String(a[sort.key] ?? "").localeCompare(
          String(b[sort.key] ?? ""),
          undefined,
          { numeric: true },
        ) * sort.direction
      : 0,
  );
  return (
    <>
      <div className="p-table-wrap" style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table className="p-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={
                    sort.key === c.key
                      ? sort.direction === 1
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    onClick={() =>
                      setSort({
                        key: c.key,
                        direction: sort.key === c.key ? -sort.direction : 1,
                      })
                    }
                  >
                    {c.title}
                    {sort.key === c.key
                      ? sort.direction === 1
                        ? " ↑"
                        : " ↓"
                      : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted
              .slice((current - 1) * pageSize, current * pageSize)
              .map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => (
                    <td key={c.key}>
                      {c.render ? c.render(row) : label(row[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!rows.length ? (
        <Empty title="No matches" text="Try another search, date or filter." />
      ) : (
        <div className="p-pagination">
          <span>
            {(current - 1) * pageSize + 1}–
            {Math.min(current * pageSize, rows.length)} of {rows.length}
            <Button variant="quiet" icon="download" onClick={()=>downloadRecords(sorted)}>Export results</Button>
          </span>
          <div>
            <Button
              variant="quiet"
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </Button>
            <span>
              {current} / {pages}
            </span>
            <Button
              variant="quiet"
              disabled={current >= pages}
              onClick={() => setPage(current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const [ref, animate] = useAnimate<HTMLDialogElement>();
  const reduce = useReducedMotion();
  const closing = useRef(false);
  const close = async () => {
    if (closing.current) return;
    closing.current = true;
    if (!reduce && ref.current) await animate(ref.current, { opacity: 0, transform: "translateY(8px) scale(.99)" }, { duration: .14 });
    onClose();
  };
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    if (!reduce && el) void animate(el, { opacity: [0, 1], transform: ["translateY(12px) scale(.98)", "translateY(0) scale(1)"] }, { duration: .22 });
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="p-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        void close();
      }}
    >
      <div className="p-dialog-head">
        <div>
          <span className="p-eyebrow">ANKELBA ADMINISTRATION</span>
          <h2>{title}</h2>
        </div>
        <button
          className="p-icon-button"
          aria-label="Close dialog"
          onClick={() => void close()}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export type FieldSpec = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  wide?: boolean;
  hint?: string;
  min?: string;
  max?: string;
};
export function RecordForm({
  fields,
  initial = {},
  onSave,
  onCancel,
  busy,
  error,
  submit = "Save changes",
}: {
  fields: FieldSpec[];
  initial?: Record<string, any>;
  onSave: (values: Record<string, any>) => void;
  onCancel: () => void;
  busy: boolean;
  error: string;
  submit?: string;
}) {
  const [values, setValues] = useState(initial);
  const change = (key: string, value: any) =>
    setValues((old) => ({ ...old, [key]: value }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const submitted = new FormData(e.currentTarget);
        onSave(Object.fromEntries(fields.map(field => [field.key, field.type === "checkbox" ? submitted.has(field.key) : submitted.get(field.key) ?? ""])));
      }}
    >
      <div className="p-form-grid">
        {fields.map((field) => (
          <label
            key={field.key}
            className={
              (field.wide ? "wide " : "") +
              (field.type === "checkbox" ? "p-check-field" : "")
            }
          >
            <span>
              {field.label}
              {field.required ? " *" : ""}
            </span>
            {field.type === "select" ? (
              <select
                name={field.key}
                required={field.required}
                value={values[field.key] ?? ""}
                onChange={(e) => change(field.key, e.target.value)}
              >
                <option value="">Select…</option>
                {field.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : field.type === "textarea" ? (
              <textarea
                name={field.key}
                required={field.required}
                rows={4}
                value={values[field.key] ?? ""}
                onInput={(e) => change(field.key, e.currentTarget.value)}
                onChange={(e) => change(field.key, e.target.value)}
              />
            ) : field.type === "checkbox" ? (
              <input
                type="checkbox"
                name={field.key}
                checked={!!values[field.key]}
                onChange={(e) => change(field.key, e.target.checked)}
              />
            ) : (
              <input
                type={field.type || "text"}
                name={field.key}
                onInput={(e) => change(field.key, e.currentTarget.value)}
                autoComplete={
                  field.type === "password" ? "new-password" : "off"
                }
                required={field.required}
                min={field.min}
                max={field.max}
                step={field.type === "number" ? "any" : undefined}
                value={values[field.key] ?? ""}
                onChange={(e) => change(field.key, e.target.value)}
              />
            )}{" "}
            {field.hint && <small>{field.hint}</small>}
          </label>
        ))}
      </div>
      {error && (
        <div role="alert" className="p-error">
          {error}
        </div>
      )}
      <div className="p-dialog-footer">
        <Button variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submit}
        </Button>
      </div>
    </form>
  );
}

export function downloadRecords(rows: Row[], filename='ankelba-records') {
 const keys=[...new Set(rows.flatMap(row=>Object.keys(row)))].filter(key=>rows.every(row=>row[key]==null||typeof row[key]!=='object') && !['password','password_hash'].includes(key));
 const blob=new Blob(['\uFEFF'+exportCsv(keys,rows.map(row=>keys.map(key=>row[key])))],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
