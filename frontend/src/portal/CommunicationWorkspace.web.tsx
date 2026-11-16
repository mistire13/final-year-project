import React, { useState } from "react";
import ChatInbox from "./ChatInbox.web";
import { Badge, Button, Card, Empty, Icon } from "./ui.web";
import type { PageContext } from "./pages.web";

const matches = (value: unknown, query: string) => !query.trim() || JSON.stringify(value).toLowerCase().includes(query.trim().toLowerCase());

export default function CommunicationWorkspace({ ctx }: { ctx: PageContext }) {
  const [tab, setTab] = useState<"messages" | "announcements">("messages");
  const contacts = ctx.data.users
    .filter(user => user.id !== ctx.actor.id && user.status === "active")
    .map(user => ({ id: user.id, name: user.name, role: user.role, title: user.title }));

  return (
    <div className="p-communication-workspace">
      <div className="p-communication-toolbar">
        <div className="p-tabs" role="tablist" aria-label="Communication tools">
          <button type="button" role="tab" aria-selected={tab === "messages"} className={tab === "messages" ? "active" : ""} onClick={() => setTab("messages")}>Messages</button>
          <button type="button" role="tab" aria-selected={tab === "announcements"} className={tab === "announcements" ? "active" : ""} onClick={() => setTab("announcements")}>Announcements</button>
        </div>
        {tab === "announcements" && !ctx.staff && <Button icon="plus" onClick={() => ctx.open("announcement")}>New announcement</Button>}
      </div>

      {tab === "messages" ? (
        <ChatInbox actor={ctx.actor} initialMessages={ctx.data.messages as any[]} initialContacts={contacts} preview={ctx.preview} />
      ) : (
        <Card>
          {ctx.data.announcements.filter(announcement => matches(announcement, ctx.query)).map(announcement => (
            <article key={announcement.id} className="p-attention">
              <span className="p-icon-tile"><Icon name="message" /></span>
              <div>
                <strong>{announcement.title}</strong>
                <p>{announcement.body}</p>
                <Badge value={announcement.audience === "group" ? ctx.data.groups.find(group => group.id === announcement.target_group_id)?.name || "Classroom" : "All families & staff"} />
              </div>
            </article>
          ))}
          {!ctx.data.announcements.length && <Empty title="No announcements" text="Published announcements will appear here." />}
        </Card>
      )}
    </div>
  );
}
