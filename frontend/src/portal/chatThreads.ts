export type ChatContact = { id: number; name: string; role?: string; title?: string; child_names?: string[] };
export type ChatMessage = {
  id: number;
  sender_id: number;
  recipient_id: number;
  sender_name?: string;
  sender_role?: string;
  recipient_name?: string;
  recipient_role?: string;
  subject?: string | null;
  body: string;
  read_at?: string | null;
  created_at: string;
};

export function buildChatConversations(actorId:number,contacts:ChatContact[],messages:ChatMessage[],search:string){
  const people = new Map<number, ChatContact>();
  contacts.forEach(contact => { if (contact.id !== actorId) people.set(contact.id, contact); });
  messages.forEach(message => {
    const otherId = message.sender_id === actorId ? message.recipient_id : message.sender_id;
    if (otherId === actorId || people.has(otherId)) return;
    const incoming = message.sender_id === otherId;
    people.set(otherId, {
      id: otherId,
      name: (incoming ? message.sender_name : message.recipient_name) || "Daycare contact",
      role: incoming ? message.sender_role : message.recipient_role,
    });
  });
  const needle = search.trim().toLowerCase();
  return [...people.values()].map(contact => {
    const thread = messages.filter(message =>
      (message.sender_id === actorId && message.recipient_id === contact.id) ||
      (message.sender_id === contact.id && message.recipient_id === actorId),
    ).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const latest = thread.at(-1);
    return {
      ...contact,
      thread,
      latest,
      unread: thread.filter(message => message.recipient_id === actorId && !message.read_at).length,
    };
  }).filter(conversation =>
    !needle || conversation.name.toLowerCase().includes(needle) || conversation.title?.toLowerCase().includes(needle) || conversation.latest?.body.toLowerCase().includes(needle),
  ).sort((a, b) => {
    const time = (b.latest ? Date.parse(b.latest.created_at) : 0) - (a.latest ? Date.parse(a.latest.created_at) : 0);
    return time || a.name.localeCompare(b.name);
  });
}
