import { create } from 'zustand';
import type { Room, Message, ReadReceipt } from './types';

interface StoreState {
  rooms: Room[];
  activeRoomId: string | null;
  messages: Record<string, Message[]>;
  typingUsers: Record<string, string[]>;
  readReceipts: Record<string, Record<string, ReadReceipt>>;
  unreadCounts: Record<string, number>;

  setRooms: (rooms: Room[]) => void;
  addRoom: (room: Room) => void;
  removeRoom: (roomId: string) => void;
  setActiveRoom: (id: string | null) => void;
  setMessages: (roomId: string, msgs: Message[]) => void;
  addMessage: (msg: Message) => void;
  removeMessage: (roomId: string, messageId: string) => void;
  updateReaction: (roomId: string, messageId: string, reactions: Record<string, string[]>) => void;
  setTypingUsers: (roomId: string, users: string[]) => void;
  setReadReceipts: (roomId: string, reads: Record<string, ReadReceipt>) => void;
  incrementUnread: (roomId: string) => void;
  clearUnread: (roomId: string) => void;
}

export const useStore = create<StoreState>()((set) => ({
  rooms: [],
  activeRoomId: null,
  messages: {},
  typingUsers: {},
  readReceipts: {},
  unreadCounts: {},

  setRooms: (rooms) => set({ rooms }),
  addRoom: (room) => set((s) =>
    s.rooms.some((r) => r.id === room.id) ? s : { rooms: [...s.rooms, room] }
  ),
  removeRoom: (roomId) => set((s) => ({ rooms: s.rooms.filter((r) => r.id !== roomId) })),

  setActiveRoom: (id) => set({ activeRoomId: id }),

  setMessages: (roomId, msgs) =>
    set((s) => ({ messages: { ...s.messages, [roomId]: msgs } })),

  addMessage: (msg) =>
    set((s) => {
      const existing = s.messages[msg.room_id] ?? [];
      return { messages: { ...s.messages, [msg.room_id]: [...existing, msg] } };
    }),

  removeMessage: (roomId, messageId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [roomId]: (s.messages[roomId] ?? []).filter((m) => String(m.id) !== String(messageId)),
      },
    })),

  updateReaction: (roomId, messageId, reactions) =>
    set((s) => {
      const msgs = (s.messages[roomId] ?? []).map((m) =>
        m.id === messageId ? { ...m, reactions } : m
      );
      return { messages: { ...s.messages, [roomId]: msgs } };
    }),

  setTypingUsers: (roomId, users) =>
    set((s) => ({ typingUsers: { ...s.typingUsers, [roomId]: users } })),

  setReadReceipts: (roomId, reads) =>
    set((s) => ({ readReceipts: { ...s.readReceipts, [roomId]: reads } })),

  incrementUnread: (roomId) =>
    set((s) => ({ unreadCounts: { ...s.unreadCounts, [roomId]: (s.unreadCounts[roomId] ?? 0) + 1 } })),

  clearUnread: (roomId) =>
    set((s) => ({ unreadCounts: { ...s.unreadCounts, [roomId]: 0 } })),
}));
