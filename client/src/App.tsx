import { useEffect, useState } from 'react';
import { useUser, useAuth, SignIn, useClerk } from '@clerk/clerk-react';
import { useStore } from './store';
import { connectSocket, getSocket } from './socket';
import Sidebar from './Sidebar';
import ChatPanel from './ChatPanel';
import Clock from './Clock';
import { playNotification } from './notification';
import { dog, i9, i17 } from './assets/images';
import type { Message, ReadReceipt, Room } from './types';

const API = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

function TaskbarRoomTab() {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const rooms = useStore((s) => s.rooms);
  if (!activeRoomId) return null;
  const room = rooms.find((r) => r.id === activeRoomId);
  const label = room?.is_dm ? (room.dm_with ?? 'DM') : room?.is_group ? room.name : `#${room?.name || activeRoomId}`;
  return <div className="taskbar-tab active">💬 {label}</div>;
}

export default function App() {
  const { isSignedIn, user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const [startOpen, setStartOpen] = useState(false);
  const setRooms = useStore((s) => s.setRooms);
  const addRoom = useStore((s) => s.addRoom);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const setActiveRoom = useStore((s) => s.setActiveRoom);
  const addMessage = useStore((s) => s.addMessage);
  const removeMessage = useStore((s) => s.removeMessage);
  const removeRoom = useStore((s) => s.removeRoom);
  const setTypingUsers = useStore((s) => s.setTypingUsers);
  const updateReaction = useStore((s) => s.updateReaction);
  const setReadReceipts = useStore((s) => s.setReadReceipts);
  const incrementUnread = useStore((s) => s.incrementUnread);
  const clearUnread = useStore((s) => s.clearUnread);

  useEffect(() => {
    if (!isSignedIn || !user) return;

    async function init() {
      const token = await getToken();
      const username = user!.username ?? user!.firstName ?? user!.emailAddresses[0]?.emailAddress ?? '';
      const socket = connectSocket(user!.id, username, user!.imageUrl ?? '', token ?? '');

      socket.on('new_message', (msg: Message) => {
        addMessage(msg);
        if (msg.user_id !== user!.id) {
          playNotification();
          if (useStore.getState().activeRoomId !== msg.room_id) incrementUnread(msg.room_id);
        }
      });

      socket.on('message_deleted', ({ roomId, messageId }: { roomId: string; messageId: string }) => {
        removeMessage(roomId, messageId);
      });
      socket.on('typing_update', ({ roomId, users }: { roomId: string; users: string[] }) =>
        setTypingUsers(roomId, users)
      );
      socket.on('room_created', (room: Room) => addRoom(room));
      socket.on('reaction_updated', ({ roomId, messageId, reactions }: { roomId: string; messageId: string; reactions: Record<string, string[]> }) => {
        updateReaction(roomId, messageId, reactions);
      });
      socket.on('read_update', ({ roomId, reads }: { roomId: string; reads: Record<string, ReadReceipt> }) =>
        setReadReceipts(roomId, reads)
      );

      socket.on('dm_created', ({ roomId, members }: { roomId: string; members: { id: string; username: string; image_url: string }[] }) => {
        const me = user!.id;
        if (!members.some((m) => m.id === me)) return;
        const other = members.find((m) => m.id !== me)!;
        addRoom({ id: roomId, name: '', is_dm: true, is_group: false, dm_with: other.username, dm_with_image: other.image_url });
      });

      socket.on('group_created', ({ roomId, name, members }: { roomId: string; name: string; members: { id: string }[] }) => {
        const me = user!.id;
        if (!members.some((m) => m.id === me)) return;
        addRoom({ id: roomId, name, is_dm: false, is_group: true });
      });

      socket.on('group_invited', ({ room, userId }: { room: Room; userId: string }) => {
        if (userId === user!.id) addRoom(room);
      });

      // If the server restarts, socket.io room state is wiped. Rejoin the active room on reconnect.
      socket.on('connect', () => {
        const activeRoom = useStore.getState().activeRoomId;
        if (activeRoom) socket.emit('join_room', activeRoom);
      });

      const res = await fetch(`${API}/rooms`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const rooms = await res.json();
      if (Array.isArray(rooms)) setRooms(rooms);
    }

    init();
  }, [isSignedIn, user]);

  async function handleSelectRoom(id: string) {
    const prev = activeRoomId;
    const socket = getSocket();
    if (socket) {
      if (prev) socket.emit('leave_room', prev);
      socket.emit('join_room', id);
    }
    setActiveRoom(id);
    clearUnread(id);
  }

  async function handleLeaveRoom(roomId: string) {
    const token = await getToken();
    await fetch(`${API}/rooms/${roomId}/membership`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const socket = getSocket();
    if (socket) socket.emit('leave_room', roomId);
    removeRoom(roomId);
    setActiveRoom(null);
  }

  async function handleDeleteMessage(roomId: string, msgId: string) {
    const token = await getToken();
    const res = await fetch(`${API}/rooms/${roomId}/messages/${msgId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[delete message failed]', res.status, err);
    }
  }

  async function handleCreateRoom(name: string) {
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

  async function handleCreateGroup(name: string, memberIds: string[]) {
    const token = await getToken();
    const res = await fetch(`${API}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, memberIds }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Failed to create group');
      return;
    }
    const room = await res.json();
    addRoom({ ...room, is_group: true });
    handleSelectRoom(room.id);
  }

  async function handleStartDM(targetUserId: string) {
    const token = await getToken();
    const res = await fetch(`${API}/dms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetUserId }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Failed to open DM');
      return;
    }
    const room = await res.json();
    addRoom(room);
    handleSelectRoom(room.id);
  }

  if (!isLoaded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <img src={i17} style={{ width: 48, height: 48, imageRendering: 'pixelated' }} />
        <span style={{ fontFamily: 'Tahoma', fontSize: 11, color: '#dce1e9', marginTop: 8 }}>Loading…</span>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="xp-window signin-window" style={{ width: 'fit-content' }}>
          <div className="xp-titlebar">
            <img src={i9} style={{ width: 14, height: 14, imageRendering: 'pixelated', marginRight: 4 }} />
            <span className="xp-titlebar-text">Sign In — swwd gng</span>
            <div className="xp-controls">
              <button className="xp-btn">─</button>
              <button className="xp-btn">□</button>
              <button className="xp-btn close">✕</button>
            </div>
          </div>
          <div style={{ background: '#d4d0c8', padding: '4px 4px 0 4px' }}>
            <SignIn routing="hash" />
          </div>
        </div>
      </div>
    );
  }

  const username = user.username ?? user.firstName ?? user.emailAddresses[0]?.emailAddress ?? '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div className="xp-window app-outer-window" style={{ flex: 1, margin: 8, marginBottom: 44, overflow: 'hidden' }}>
        <div className="xp-titlebar">
          <img src={dog} style={{ width: 16, height: 16, imageRendering: 'pixelated', marginRight: 4 }} />
          <span className="xp-titlebar-text">swwd gng — {username}</span>
          <div className="xp-controls">
            <button className="xp-btn">─</button>
            <button className="xp-btn">□</button>
            <button className="xp-btn close" onClick={() => signOut()}>✕</button>
          </div>
        </div>
        <div className={`chat-layout${activeRoomId ? ' has-room' : ''}`}>
          <Sidebar
            onSelectRoom={handleSelectRoom}
            onCreateRoom={handleCreateRoom}
            onStartDM={handleStartDM}
            onCreateGroup={handleCreateGroup}
            getToken={getToken}
            currentUserId={user.id}
          />
          <div className="chat-area">
            <ChatPanel
              roomId={activeRoomId}
              currentUserId={user.id}
              currentUsername={username}
              getToken={getToken}
              onDeleteMessage={handleDeleteMessage}
              onLeaveRoom={handleLeaveRoom}
            />
          </div>
        </div>
      </div>

      {startOpen && (
        <div style={{
          position: 'fixed', bottom: 36, left: 6, zIndex: 200,
          background: '#d4d0c8', border: '2px solid', borderColor: '#fff #808080 #808080 #fff',
          boxShadow: '2px 2px 0 #000', minWidth: 180,
        }} onClick={() => setStartOpen(false)}>
          <div style={{ background: 'linear-gradient(to bottom, #0a246a, #a6caf0)', padding: '8px 10px', color: 'white', fontFamily: 'Tahoma', fontSize: 11, fontWeight: 'bold' }}>
            {username}
          </div>
          <div style={{ padding: 4 }}>
            <button onClick={() => signOut()} style={{
              width: '100%', textAlign: 'left', padding: '4px 8px',
              fontFamily: 'Tahoma', fontSize: 11, background: 'none',
              border: 'none', cursor: 'url(\'/14.png\') 0 0, pointer', display: 'flex', alignItems: 'center', gap: 8,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = '#0a246a'; e.currentTarget.style.color = 'white'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = ''; }}>
              <img src={i9} style={{ width: 16, height: 16, imageRendering: 'pixelated' }} />
              Sign Out
            </button>
          </div>
        </div>
      )}
      <div className="taskbar">
        <button className="taskbar-start" onClick={() => setStartOpen(v => !v)}>⊞ Start</button>
        <TaskbarRoomTab />
        <Clock />
      </div>
    </div>
  );
}
