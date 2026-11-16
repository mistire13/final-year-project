import React, { useEffect, useState } from "react";
import PlusStaffScheduling from "./PlusStaffScheduling.web";
import { Duties, type PageContext } from "./pages.web";

type View = "duties" | "schedules" | "leave" | "substitutions";

export default function FrontDeskWorkspace({
  ctx,
  plus,
  onDataChanged,
}: {
  ctx: PageContext;
  plus: boolean;
  onDataChanged?: () => void;
}) {
  const [view, setView] = useState<View>("duties");
  useEffect(() => {
    if (!plus) setView("duties");
  }, [plus]);

  const tabs: { key: View; label: string }[] = [
    { key: "duties", label: "Duties" },
    ...(plus
      ? [
          { key: "schedules" as const, label: "Weekly schedules" },
          { key: "leave" as const, label: "Leave" },
          { key: "substitutions" as const, label: "Substitutions" },
        ]
      : []),
  ];

  return (
    <div className="p-front-desk-workspace">
      {plus && (
        <div className="p-tabs" role="tablist" aria-label="Front-desk tools">
          {tabs.map((tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={view === tab.key}
              aria-controls="front-desk-tool-panel"
              className={view === tab.key ? "active" : ""}
              key={tab.key}
              onClick={() => setView(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      <section id="front-desk-tool-panel" role={plus ? "tabpanel" : undefined}>
        {view === "duties" ? (
          <Duties {...ctx} />
        ) : (
          <PlusStaffScheduling section={view} onDataChanged={onDataChanged} />
        )}
      </section>
    </div>
  );
}
