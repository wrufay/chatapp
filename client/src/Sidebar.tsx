import { useState } from 'react';
import { useStore } from './store';
import { i3, i13 } from './assets/images';
import type { User } from './types';

const API = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface Props {
  onSelectRoom: (id: string) => void;
  onCreateRoom: (name: string) => void;
  onStartDM: (userId: string) => void;
  getToken: () => Promise<string | null>;
  currentUserId: string;
}

export default function Sidebar({ onSelectRoom, onCreateRoom, onStartDM, getToken, currentUserId }: Props) {
  const rooms = useStore((s) => s.rooms);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const [newRoomName, setNewRoomName] = useState('');
  const [creating, setCreating] = useState(false);
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const publicRooms = rooms.filter((r) => !r.is_dm);
  const dms = rooms.filter((r) => r.is_dm);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    await onCreateRoom(newRoomName.trim());
    setNewRoomName('');
    setCreating(false);
  }

  async function openDmPicker() {
    setDmPickerOpen(true);
    setLoadingUsers(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } finally {
      setLoadingUsers(false);
    }
  }

  return (
    <div className="sidebar">
      {/* ── Rooms ── */}
      <div className="sidebar-header">
        <img src={i3} style={{ width: 14, height: 14, imageRendering: 'pixelated' }} />
        Rooms
      </div>
      <div className="sidebar-section">
        {publicRooms.map((room) => (
          <div
            key={room.id}
            className={`room-item${activeRoomId === room.id ? ' active' : ''}`}
            onClick={() => onSelectRoom(room.id)}
          >
            <img src={i13} style={{ width: 14, height: 14, imageRendering: 'pixelated', flexShrink: 0 }} />
            {room.name}
          </div>
        ))}
      </div>
      <div className="sidebar-footer">
        {creating ? (
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: 4, flexDirection: 'column' }}>
            <input
              className="xp-input"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="room name"
              autoFocus
            />
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="submit" className="xp-button" style={{ flex: 1 }}>OK</button>
              <button type="button" className="xp-button" onClick={() => setCreating(false)}>✕</button>
            </div>
          </form>
        ) : (
          <button className="xp-button" style={{ width: '100%' }} onClick={() => setCreating(true)}>
            + New Room
          </button>
        )}
      </div>

      {/* ── Direct Messages ── */}
      <div className="sidebar-header" style={{ marginTop: 2 }}>
        <img src={i3} style={{ width: 14, height: 14, imageRendering: 'pixelated' }} />
        Direct Messages
      </div>
      <div className="sidebar-section" style={{ flex: 'none' }}>
        {dms.map((room) => (
          <div
            key={room.id}
            className={`room-item${activeRoomId === room.id ? ' active' : ''}`}
            onClick={() => onSelectRoom(room.id)}
          >
            {room.dm_with_image ? (
              <img src={room.dm_with_image} style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 11 }}>👤</span>
            )}
            {room.dm_with || room.name}
          </div>
        ))}
      </div>
      <div className="sidebar-footer">
        {dmPickerOpen ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <span style={{ fontFamily: 'Tahoma', fontSize: 10, color: '#333' }}>Select a user</span>
              <button className="xp-button" style={{ padding: '1px 6px', fontSize: 10 }} onClick={() => setDmPickerOpen(false)}>✕</button>
            </div>
            {loadingUsers ? (
              <div style={{ fontFamily: 'Tahoma', fontSize: 10, color: '#666', padding: '4px 0' }}>Loading…</div>
            ) : users.length === 0 ? (
              <div style={{ fontFamily: 'Tahoma', fontSize: 10, color: '#666', padding: '4px 0' }}>No other users yet</div>
            ) : (
              users.map((u) => (
                <div
                  key={u.id}
                  className="room-item"
                  onClick={() => { onStartDM(u.id); setDmPickerOpen(false); }}
                  style={{ gap: 6 }}
                >
                  {u.image_url ? (
                    <img src={u.image_url} style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 11 }}>👤</span>
                  )}
                  {u.username}
                </div>
              ))
            )}
          </div>
        ) : (
          <button className="xp-button" style={{ width: '100%' }} onClick={openDmPicker}>
            + New DM
          </button>
        )}
      </div>
    </div>
  );
}
