import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  return socket;
}

export function connectSocket(userId, username, imageUrl, token) {
  if (socket) socket.disconnect();
  socket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001', {
    auth: { userId, username, imageUrl, token },
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
