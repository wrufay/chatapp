import { useEffect, useState } from 'react';
import { SignIn } from '@clerk/clerk-react';
import { getUserId, getUsername, setUsername as saveUsername, clearUsername, getToken as getAnonToken } from './identity';
import { useOptionalClerk } from './useOptionalClerk';
import { useStore } from './store';
import { connectSocket, getSocket } from './socket';
import Sidebar from './Sidebar';
import ChatPanel from './ChatPanel';
import Clock from './Clock';
import ProfileModal from './ProfileModal';
import { playNotification } from './notification';
import { dog, i9 } from './assets/images';
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

const clerkAvailable = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export default function App() {
  const { isLoaded: clerkLoaded, isSignedIn, user, getToken: getClerkToken, signOut } = useOptionalClerk();
  const [anonUsername, setAnonUsername] = useState<string | null>(() => getUsername());
  const activeMode: 'clerk' | 'anon' | null = isSignedIn ? 'clerk' : anonUsername ? 'anon' : null;
  const userId = isSignedIn ? user!.id : getUserId();
  const username = isSignedIn
    ? (user!.username ?? user!.firstName ?? user!.emailAddresses[0]?.emailAddress ?? '')
    : anonUsername;
  const imageUrl = isSignedIn ? user!.imageUrl : undefined;
  const getToken = isSignedIn ? getClerkToken : getAnonToken;
  const [nameInput, setNameInput] = useState('');
  const [startOpen, setStartOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
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
  const setPresence = useStore((s) => s.setPresence);

  useEffect(() => {
    if (!clerkLoaded) return;
    if (!activeMode) return;

    async function init() {
      // Clerk's getToken() can transiently resolve to null for a brief
      // window right after an auto-restored session -- isSignedIn flips
      // true from cached session data before Clerk's internal token
      // refresh has actually finished. Retry a few times before giving up
      // instead of silently rendering an empty chat with no error anywhere.
      let token = await getToken();
      for (let attempt = 0; attempt < 4 && !token; attempt++) {
        await new Promise((r) => setTimeout(r, 300));
        token = await getToken();
      }
      if (!token) {
        console.error('[init] could not obtain an auth token, giving up');
        return;
      }
      const socket = connectSocket(token, username!, imageUrl);

      socket.on('new_message', (msg: Message) => {
        addMessage(msg);
        if (msg.user_id !== userId) {
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
      socket.on('presence', ({ roomId, members }: { roomId: string; members: string[] }) =>
        setPresence(roomId, members)
      );

      socket.on('dm_created', ({ roomId, members }: { roomId: string; members: { id: string; username: string; image_url: string }[] }) => {
        if (!members.some((m) => m.id === userId)) return;
        const other = members.find((m) => m.id !== userId)!;
        addRoom({ id: roomId, name: '', is_dm: true, is_group: false, dm_with: other.username, dm_with_image: other.image_url, dm_with_id: other.id });
      });

      socket.on('group_created', ({ roomId, name, members }: { roomId: string; name: string; members: { id: string }[] }) => {
        if (!members.some((m) => m.id === userId)) return;
        addRoom({ id: roomId, name, is_dm: false, is_group: true });
      });

      socket.on('group_invited', ({ room, userId: invitedId }: { room: Room; userId: string }) => {
        if (invitedId === userId) addRoom(room);
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
  }, [clerkLoaded, activeMode, userId]);

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const name = nameInput.trim();
    if (!name) return;
    saveUsername(name);
    setAnonUsername(name);
  }

  function handleSignOut() {
    if (isSignedIn) {
      signOut();
      return;
    }
    clearUsername();
    setAnonUsername(null);
  }

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

  if (!clerkLoaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span style={{ fontFamily: 'Tahoma', fontSize: 11, color: '#dce1e9' }}>Loading…</span>
      </div>
    );
  }

  if (!activeMode) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="xp-window signin-window" style={{ width: 360 }}>
          <div className="xp-titlebar">
            <img src={i9} style={{ width: 14, height: 14, imageRendering: 'pixelated', marginRight: 4 }} />
            <span className="xp-titlebar-text">Sign In — swwd gng</span>
            <div className="xp-controls">
              <button className="xp-btn">─</button>
              <button className="xp-btn">□</button>
              <button className="xp-btn close">✕</button>
            </div>
          </div>
          <div style={{ background: '#d4d0c8', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {clerkAvailable && (
              <>
                {/* Hides the email/password fallback and the "Secured by Clerk" /
                    dev-mode footer via CSS only, keeping Clerk's own white card
                    chrome so the Google option reads as its own clear block
                    above the guest form. The real fix for the email fallback is
                    disabling "Email address" as a sign-in identifier in the
                    Clerk dashboard (User & Authentication > Email, Phone,
                    Username). Revert by dropping this appearance prop. */}
                <SignIn
                  routing="hash"
                  appearance={{
                    elements: {
                      dividerRow: { display: 'none' },
                      form: { display: 'none' },
                      footerAction: { display: 'none' },
                      footer: { display: 'none' },
                      headerSubtitle: { display: 'none' },
                      rootBox: { width: '100%' },
                      cardBox: { width: '100%' },
                      card: { width: '100%' },
                    },
                  }}
                />
                <div style={{ textAlign: 'center', fontFamily: 'Tahoma', fontSize: 11, color: '#666' }}>— or continue as guest —</div>
              </>
            )}
            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontFamily: 'Tahoma', fontSize: 13, fontWeight: 'bold', color: '#000' }}>
                pick a name to join
              </div>
              <div style={{ fontFamily: 'Tahoma', fontSize: 11, color: '#444' }}>
                no account, no email — just a nickname. be nice.
              </div>
              <input
                className="xp-input"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="nickname"
                maxLength={24}
                autoFocus
              />
              <button type="submit" className="xp-button" disabled={!nameInput.trim()}>
                Enter chat →
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div className="xp-window app-outer-window" style={{ flex: 1, margin: 8, marginBottom: 44, overflow: 'hidden' }}>
        <div className="xp-titlebar">
          <img src={dog} style={{ width: 16, height: 16, imageRendering: 'pixelated', marginRight: 4 }} />
          <span className="xp-titlebar-text">swwd gng — {username}</span>
          <div className="xp-controls">
            <button className="xp-btn">─</button>
            <button className="xp-btn">□</button>
            <button className="xp-btn close" onClick={handleSignOut}>✕</button>
          </div>
        </div>
        <div className={`chat-layout${activeRoomId ? ' has-room' : ''}`}>
          <Sidebar
            onSelectRoom={handleSelectRoom}
            onCreateRoom={handleCreateRoom}
            onStartDM={handleStartDM}
            onCreateGroup={handleCreateGroup}
            getToken={getToken}
            currentUserId={userId}
          />
          <div className="chat-area">
            <ChatPanel
              roomId={activeRoomId}
              currentUserId={userId}
              currentUsername={username!}
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
            <button onClick={() => { setProfileOpen(true); setStartOpen(false); }} style={{
              width: '100%', textAlign: 'left', padding: '4px 8px', color: '#000',
              fontFamily: 'Tahoma', fontSize: 11, background: 'none',
              border: 'none', cursor: 'url(\'/14.png\') 0 0, pointer', display: 'flex', alignItems: 'center', gap: 8,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = '#0a246a'; e.currentTarget.style.color = 'white'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#000'; }}>
              <span style={{ fontSize: 16 }}>👤</span>
              My Profile
            </button>
            <button onClick={handleSignOut} style={{
              width: '100%', textAlign: 'left', padding: '4px 8px', color: '#000',
              fontFamily: 'Tahoma', fontSize: 11, background: 'none',
              border: 'none', cursor: 'url(\'/14.png\') 0 0, pointer', display: 'flex', alignItems: 'center', gap: 8,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = '#0a246a'; e.currentTarget.style.color = 'white'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#000'; }}>
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
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} getToken={getToken} />}
    </div>
  );
}
