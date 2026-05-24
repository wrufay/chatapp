import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(userId: string, username: string, imageUrl: string, token: string): Socket {
  if (socket) socket.disconnect();
  socket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001', {
    auth: { userId, username, imageUrl, token },
  });
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
