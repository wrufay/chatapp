import { create } from 'zustand';

export const useStore = create((set, get) => ({
  rooms: [],
  activeRoomId: null,
  messages: {},
  typingUsers: {},

  setRooms: (rooms) => set({ rooms }),
  addRoom: (room) => set((s) => ({ rooms: [...s.rooms, room] })),

  setActiveRoom: (id) => set({ activeRoomId: id }),

  setMessages: (roomId, msgs) =>
    set((s) => ({ messages: { ...s.messages, [roomId]: msgs } })),

  addMessage: (msg) =>
    set((s) => {
      const existing = s.messages[msg.room_id] || [];
      return { messages: { ...s.messages, [msg.room_id]: [...existing, msg] } };
    }),

  updateReaction: (roomId, messageId, reactions) =>
    set((s) => {
      const msgs = (s.messages[roomId] || []).map((m) =>
        m.id === messageId ? { ...m, reactions } : m
      );
      return { messages: { ...s.messages, [roomId]: msgs } };
    }),

  setTypingUsers: (roomId, users) =>
    set((s) => ({ typingUsers: { ...s.typingUsers, [roomId]: users } })),
}));
