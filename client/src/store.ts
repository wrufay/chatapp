import { create } from 'zustand';
import type { Room, Message, ReadReceipt } from './types';

interface StoreState {
  rooms: Room[];
  activeRoomId: string | null;
  messages: Record<string, Message[]>;
  typingUsers: Record<string, string[]>;
  readReceipts: Record<string, Record<string, ReadReceipt>>;

  setRooms: (rooms: Room[]) => void;
  addRoom: (room: Room) => void;
  setActiveRoom: (id: string | null) => void;
  setMessages: (roomId: string, msgs: Message[]) => void;
  addMessage: (msg: Message) => void;
  updateReaction: (roomId: string, messageId: string, reactions: Record<string, string[]>) => void;
  setTypingUsers: (roomId: string, users: string[]) => void;
  setReadReceipts: (roomId: string, reads: Record<string, ReadReceipt>) => void;
}

export const useStore = create<StoreState>()((set) => ({
  rooms: [],
  activeRoomId: null,
  messages: {},
  typingUsers: {},
  readReceipts: {},

  setRooms: (rooms) => set({ rooms }),
  addRoom: (room) => set((s) =>
    s.rooms.some((r) => r.id === room.id) ? s : { rooms: [...s.rooms, room] }
  ),

  setActiveRoom: (id) => set({ activeRoomId: id }),

  setMessages: (roomId, msgs) =>
    set((s) => ({ messages: { ...s.messages, [roomId]: msgs } })),

  addMessage: (msg) =>
    set((s) => {
      const existing = s.messages[msg.room_id] ?? [];
      return { messages: { ...s.messages, [msg.room_id]: [...existing, msg] } };
    }),

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
}));
