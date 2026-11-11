export type InboxRoom = {
  id: string;
  name: string | null;
  is_group: boolean;
  other_user_name: string | null;
  avatar_url: string | null;
  other_user_avatar: string | null;
  last_message: string | null;
  last_message_type: 'text' | 'image' | 'audio' | 'file' | null | undefined;
  last_message_at: string | null;
};

type Translate = (key: string) => string;
const nullableText = (value: unknown) => typeof value === 'string' ? value : null;

// The backend is authoritative for membership and ordering. Do not retain URLs
// or message bodies beyond the small, explicit inbox projection.
export function readInboxRooms(data: any): InboxRoom[] {
  if (data?.success !== true || !Array.isArray(data.rooms)) throw new Error('Invalid conversations response');
  const ids = new Set<string>();
  return data.rooms.map((room: any) => {
    if (!room || typeof room.id !== 'string' || !room.id || ids.has(room.id)
      || room.id.startsWith('support-ticket-') || typeof room.is_group !== 'boolean') {
      throw new Error('Invalid conversation');
    }
    ids.add(room.id);
    const kind = room.last_message_type;
    if (kind != null && !['text', 'image', 'audio', 'file'].includes(kind)) throw new Error('Invalid preview');
    if (room.last_message != null && typeof room.last_message !== 'string') throw new Error('Invalid preview text');
    if (room.last_message_at != null && typeof room.last_message_at !== 'string') throw new Error('Invalid preview time');
    const at = nullableText(room.last_message_at);
    if (at !== null && !Number.isFinite(Date.parse(at))) throw new Error('Invalid preview time');
    return {
      id: room.id, name: nullableText(room.name), is_group: room.is_group,
      other_user_name: nullableText(room.other_user_name),
      avatar_url: nullableText(room.avatar_url), other_user_avatar: nullableText(room.other_user_avatar),
      last_message: typeof room.last_message === 'string' ? Array.from(room.last_message).slice(0, 160).join('') : null,
      last_message_type: kind, last_message_at: at,
    };
  });
}

export function inboxTitle(room: InboxRoom, t: Translate): string {
  return room.is_group ? room.name?.trim() || t('Unnamed group') : room.other_user_name?.trim() || t('Unknown user');
}

export function searchInbox(rooms: InboxRoom[], query: string, t: Translate): InboxRoom[] {
  const term = query.trim().toLocaleLowerCase();
  return term ? rooms.filter(room => inboxTitle(room, t).toLocaleLowerCase().includes(term)) : rooms;
}

export function inboxPreview(room: InboxRoom, t: Translate): string {
  // Older servers omit the additive projection. Do not mistake that for an empty conversation.
  if (room.last_message_type === undefined) return t(room.is_group ? 'Group' : 'Direct message');
  const text = room.last_message?.replace(/\s+/g, ' ').trim();
  if (text) return text;
  if (room.last_message_type === 'image') return t('Photo');
  if (room.last_message_type === 'audio') return t('Voice message');
  if (room.last_message_type === 'file') return t('Attachment');
  return room.last_message_type === 'text' ? t('Message') : t('No messages yet');
}

export function inboxTime(value: string | null, locale: string, now = new Date()): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  // Calendar-day comparison, not elapsed hours, preserves local midnight/DST behavior.
  const today = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return today ? date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(locale, { month: 'short', day: 'numeric', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
