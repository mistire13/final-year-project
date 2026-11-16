import React, { useEffect, useMemo, useRef, useState } from "react";
import { portalClient, portalTokenStorage, apiError } from "./api";
import { Button, Icon } from "./ui.web";
import { sendTyping, subscribeRealtime } from "../services/realtime";
import { buildChatConversations, type ChatContact as Contact, type ChatMessage as Message } from "./chatThreads";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
const roleLabel = (value?: string) => value === "parent" ? "Parent" : value === "caregiver" ? "Caregiver" : value === "admin" ? "Daycare office" : value || "Contact";
const timeLabel = (value?: string) => value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
const dayLabel = (value: string) => new Date(value).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

export default function ChatInbox({
  actor,
  initialMessages = [],
  initialContacts = [],
  preview = false,
}: {
  actor: { id: number; name?: string };
  initialMessages?: Message[];
  initialContacts?: Contact[];
  preview?: boolean;
}) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(!preview);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [typingFrom, setTypingFrom] = useState<number | null>(null);
  const threadEnd = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTyping = useRef(0);
  const loadRevision = useRef(0);

  const load = async (background = false) => {
    if (preview) return;
    const revision = ++loadRevision.current;
    if (!background) setLoading(true);
    try {
      const [contactResult, messageResult] = await Promise.all([
        portalClient.get("/communication/contacts"),
        portalClient.get("/communication/messages"),
      ]);
      if (revision === loadRevision.current) {
        setContacts(contactResult.data.contacts || []);
        setMessages(messageResult.data.data || []);
        setError("");
      }
    } catch (reason) {
      if (revision === loadRevision.current) setError(apiError(reason));
    } finally {
      if (!background && revision === loadRevision.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (preview) return;
    let active = true;
    void load();
    const token = portalTokenStorage.getToken();
    const unsubscribe = token ? subscribeRealtime(token, event => {
      if (!active) return;
      if (event.type === "ready" || event.type === "message.changed" || event.type === "message.read") void load(true);
      else if (event.type === "disconnected") setTypingFrom(null);
      else if (event.type === "typing") {
        if (typingTimer.current) clearTimeout(typingTimer.current);
        setTypingFrom(event.active ? event.userId : null);
        if (event.active) typingTimer.current = setTimeout(() => setTypingFrom(null), 5000);
      }
    }) : undefined;
    return () => {
      active = false;
      loadRevision.current++;
      unsubscribe?.();
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [actor.id, preview]);

  const conversations = useMemo(() => {
    return buildChatConversations(actor.id, contacts, messages, search);
  }, [actor.id, contacts, messages, search]);

  const selected = conversations.find(conversation => conversation.id === selectedId) || null;
  useEffect(() => { threadEnd.current?.scrollIntoView({ block: "end" }); }, [selectedId, selected?.thread.length]);

  const openConversation = (conversation: typeof conversations[number]) => {
    setSelectedId(conversation.id);
    setError("");
    if (preview || !conversation.unread) return;
    const unread = conversation.thread.filter(message => message.recipient_id === actor.id && !message.read_at);
    const readAt = new Date().toISOString();
    setMessages(rows => rows.map(message => unread.some(item => item.id === message.id) ? { ...message, read_at: readAt } : message));
    void Promise.all(unread.map(message => portalClient.patch(`/communication/messages/${message.id}/read`))).catch(reason => {
      setError(apiError(reason));
      void load(true);
    });
  };

  const updateDraft = (value: string) => {
    setDraft(value);
    if (!selectedId || preview) return;
    const active = value.trim().length > 0;
    if (!active || Date.now() - lastTyping.current > 1500) {
      sendTyping(portalTokenStorage.getToken(), selectedId, active);
      lastTyping.current = Date.now();
    }
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!selectedId || !body || sending) return;
    setSending(true);
    setError("");
    try {
      if (preview) {
        setMessages(rows => [...rows, { id: Date.now(), sender_id: actor.id, recipient_id: selectedId, body, created_at: new Date().toISOString(), read_at: null }]);
      } else {
        const { data } = await portalClient.post("/communication/messages", { recipient_id: selectedId, body });
        setMessages(rows => [...rows.filter(message => message.id !== data.id), data]);
        sendTyping(portalTokenStorage.getToken(), selectedId, false);
      }
      setDraft("");
    } catch (reason) {
      setError(apiError(reason));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`p-chat-shell${selected ? " has-selection" : ""}`}>
      <aside className="p-chat-sidebar" aria-label="Conversations">
        <div className="p-chat-sidebar-head">
          <h2>Messages</h2>
          <label className="p-chat-search">
            <span className="sr-only">Search conversations</span>
            <Icon name="search" size={16} />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search" />
          </label>
        </div>
        <div className="p-chat-conversations">
          {loading && <p role="status" className="p-chat-state">Loading…</p>}
          {error && !selected && <p role="alert" className="p-chat-error">{error}</p>}
          {!loading && !conversations.length && <p className="p-chat-state">No conversations yet.</p>}
          {conversations.map(conversation => (
            <button
              type="button"
              className={`p-chat-conversation${selectedId === conversation.id ? " active" : ""}${conversation.unread ? " unread" : ""}`}
              aria-current={selectedId === conversation.id ? "true" : undefined}
              key={conversation.id}
              onClick={() => openConversation(conversation)}
            >
              <span className="p-chat-avatar" aria-hidden="true">{initials(conversation.name)}</span>
              <span className="p-chat-conversation-copy">
                <span className="p-chat-conversation-line"><strong>{conversation.name}</strong><time>{timeLabel(conversation.latest?.created_at)}</time></span>
                <span className="p-chat-conversation-line"><small>{conversation.latest?.body || conversation.title || roleLabel(conversation.role)}</small>{conversation.unread > 0 && <span className="p-chat-unread" aria-label={`${conversation.unread} unread`}>{conversation.unread}</span>}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="p-chat-panel" aria-label={selected ? `Conversation with ${selected.name}` : "Selected conversation"}>
        {!selected ? (
          <div className="p-chat-empty"><Icon name="message" size={28} /><h2>Select a conversation</h2></div>
        ) : (
          <>
            <header className="p-chat-header">
              <button type="button" className="p-chat-back" aria-label="Back to conversations" onClick={() => setSelectedId(null)}>‹</button>
              <span className="p-chat-avatar" aria-hidden="true">{initials(selected.name)}</span>
              <div><strong>{selected.name}</strong><small>{typingFrom === selected.id ? "Typing…" : selected.child_names?.length ? selected.child_names.join(", ") : roleLabel(selected.role)}</small></div>
            </header>
            <div className="p-chat-thread" aria-live="polite">
              {selected.thread.map((message, index) => {
                const own = message.sender_id === actor.id;
                const previous = selected.thread[index - 1];
                const showDay = !previous || new Date(previous.created_at).toDateString() !== new Date(message.created_at).toDateString();
                return <React.Fragment key={message.id}>
                  {showDay && <div className="p-chat-day">{dayLabel(message.created_at)}</div>}
                  <div className={`p-chat-message${own ? " own" : ""}`}>
                    {message.subject && <strong>{message.subject}</strong>}
                    <p>{message.body}</p>
                    <time>{timeLabel(message.created_at)}{own && message.read_at ? " · Read" : ""}</time>
                  </div>
                </React.Fragment>;
              })}
              {!selected.thread.length && <p className="p-chat-state">Start the conversation.</p>}
              <div ref={threadEnd} />
            </div>
            {error && <p role="alert" className="p-chat-error">{error}</p>}
            <form className="p-chat-composer" onSubmit={send}>
              <label className="sr-only" htmlFor="chat-message">Message</label>
              <textarea id="chat-message" value={draft} onChange={event => updateDraft(event.target.value)} placeholder="Write a message…" maxLength={10000} rows={1} />
              <Button type="submit" disabled={sending || !draft.trim()}>{sending ? "Sending…" : "Send"}</Button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
