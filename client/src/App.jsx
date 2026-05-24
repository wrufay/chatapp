import { useEffect } from 'react';
import { useUser, useAuth, SignIn } from '@clerk/clerk-react';
import { useStore } from './store';
import { connectSocket, getSocket } from './socket';
import Sidebar from './Sidebar';
import ChatPanel from './ChatPanel';
import Clock from './Clock';
import { playNotification } from './notification';

const API = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

function TaskbarRoomTab() {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const rooms = useStore((s) => s.rooms);
  if (!activeRoomId) return null;
  const room = rooms.find((r) => r.id === activeRoomId);
  return <div className="taskbar-tab active">💬 #{room?.name || activeRoomId}</div>;
}

export default function App() {
  const { isSignedIn, user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const setRooms = useStore((s) => s.setRooms);
  const addRoom = useStore((s) => s.addRoom);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const setActiveRoom = useStore((s) => s.setActiveRoom);
  const addMessage = useStore((s) => s.addMessage);
  const setTypingUsers = useStore((s) => s.setTypingUsers);
  const updateReaction = useStore((s) => s.updateReaction);

  useEffect(() => {
    if (!isSignedIn || !user) return;

    async function init() {
      const token = await getToken();
      const username = user.username || user.firstName || user.emailAddresses[0]?.emailAddress;
      const socket = connectSocket(user.id, username, user.imageUrl, token);

      socket.on('new_message', (msg) => {
        addMessage(msg);
        if (msg.user_id !== user.id) playNotification();
      });
      socket.on('typing_update', ({ roomId, users }) => setTypingUsers(roomId, users));
      socket.on('room_created', (room) => addRoom(room));
      socket.on('reaction_updated', ({ roomId, messageId, reactions }) => {
        updateReaction(roomId, messageId, reactions);
      });

      const res = await fetch(`${API}/rooms`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const rooms = await res.json();
      setRooms(rooms);
    }

    init();
  }, [isSignedIn, user]);

  async function handleSelectRoom(id) {
    const prev = activeRoomId;
    const socket = getSocket();
    if (socket) {
      if (prev) socket.emit('leave_room', prev);
      socket.emit('join_room', id);
    }
    setActiveRoom(id);
  }

  async function handleCreateRoom(name) {
    const token = await getToken();
    const res = await fetch(`${API}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Failed to create room');
    }
  }

  if (!isLoaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#363732' }}>
        <span style={{ fontFamily: 'Tahoma', fontSize: 12, color: '#dce1e9' }}>Loading…</span>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#363732' }}>
        <div className="xp-window" style={{ width: 400 }}>
          <div className="xp-titlebar">
            <span className="xp-titlebar-text">Sign In — Chat</span>
            <div className="xp-controls">
              <button className="xp-btn">─</button>
              <button className="xp-btn">□</button>
              <button className="xp-btn close">✕</button>
            </div>
          </div>
          <div style={{ background: '#d4d0c8', padding: 16 }}>
            <SignIn routing="hash" />
          </div>
        </div>
      </div>
    );
  }

  const username = user.username || user.firstName || user.emailAddresses[0]?.emailAddress;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div className="xp-window" style={{ flex: 1, margin: 8, marginBottom: 44, overflow: 'hidden' }}>
        <div className="xp-titlebar">
          <span className="xp-titlebar-text">💬 Chat — {username}</span>
          <div className="xp-controls">
            <button className="xp-btn">─</button>
            <button className="xp-btn">□</button>
            <button className="xp-btn close">✕</button>
          </div>
        </div>
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', background: '#d4d0c8' }}>
          <Sidebar onSelectRoom={handleSelectRoom} onCreateRoom={handleCreateRoom} />
          <ChatPanel
            roomId={activeRoomId}
            currentUserId={user.id}
            currentUsername={username}
            getToken={getToken}
          />
        </div>
      </div>

      <div className="taskbar">
        <button className="taskbar-start">⊞ Start</button>
        <TaskbarRoomTab />
        <Clock />
      </div>
    </div>
  );
}

