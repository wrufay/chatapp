import { useState } from 'react';
import { useStore } from './store';
import { i3, i13 } from './assets/images';
import type { User } from './types';

function UnreadBadge({ count }: { count: number }) {
  return (
    <span style={{
      background: '#cc0000', color: 'white', borderRadius: 8,
      fontSize: 9, fontFamily: 'Tahoma', padding: '1px 4px',
      minWidth: 14, textAlign: 'center', flexShrink: 0,
    }}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

const API = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface Props {
  onSelectRoom: (id: string) => void;
  onCreateRoom: (name: string) => void;
  onStartDM: (userId: string) => void;
  onCreateGroup: (name: string, memberIds: string[]) => void;
  getToken: () => Promise<string | null>;
  currentUserId: string;
}

export default function Sidebar({ onSelectRoom, onCreateRoom, onStartDM, onCreateGroup, getToken, currentUserId }: Props) {
  const rooms = useStore((s) => s.rooms);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const unreadCounts = useStore((s) => s.unreadCounts);
  const [newRoomName, setNewRoomName] = useState('');
  const [creating, setCreating] = useState(false);
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const publicRooms = rooms.filter((r) => !r.is_dm && !r.is_group);
  const groups = rooms.filter((r) => r.is_group);
  const dms = rooms.filter((r) => r.is_dm);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    await onCreateRoom(newRoomName.trim());
    setNewRoomName('');
    setCreating(false);
  }

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setUsers(Array.isArray(data) ? data.filter((u: User) => u.id !== currentUserId) : []);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function openDmPicker() {
    setDmPickerOpen(true);
    await loadUsers();
  }

  async function openGroupPicker() {
    setGroupPickerOpen(true);
    setGroupName('');
    setSelectedMembers([]);
    await loadUsers();
  }

  function toggleMember(userId: string) {
    setSelectedMembers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!groupName.trim() || selectedMembers.length === 0) return;
    await onCreateGroup(groupName.trim(), selectedMembers);
    setGroupPickerOpen(false);
    setGroupName('');
    setSelectedMembers([]);
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
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.name}</span>
            {(unreadCounts[room.id] ?? 0) > 0 && <UnreadBadge count={unreadCounts[room.id]} />}
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

      {/* ── Groups ── */}
      <div className="sidebar-header" style={{ marginTop: 2 }}>
        <img src={i3} style={{ width: 14, height: 14, imageRendering: 'pixelated' }} />
        Groups
      </div>
      <div className="sidebar-section" style={{ flex: 'none' }}>
        {groups.map((room) => (
          <div
            key={room.id}
            className={`room-item${activeRoomId === room.id ? ' active' : ''}`}
            onClick={() => onSelectRoom(room.id)}
          >
            <span style={{ fontSize: 11 }}>👥</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.name}</span>
            {(unreadCounts[room.id] ?? 0) > 0 && <UnreadBadge count={unreadCounts[room.id]} />}
          </div>
        ))}
      </div>
      <div className="sidebar-footer">
        {groupPickerOpen ? (
          <form onSubmit={handleCreateGroup} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'Tahoma', fontSize: 10, color: '#333' }}>New group</span>
              <button type="button" className="xp-button" style={{ padding: '1px 6px', fontSize: 10 }} onClick={() => setGroupPickerOpen(false)}>✕</button>
            </div>
            <input
              className="xp-input"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="group name"
              autoFocus
            />
            {loadingUsers ? (
              <div style={{ fontFamily: 'Tahoma', fontSize: 10, color: '#666', padding: '2px 0' }}>Loading…</div>
            ) : users.length === 0 ? (
              <div style={{ fontFamily: 'Tahoma', fontSize: 10, color: '#666', padding: '2px 0' }}>No other users yet</div>
            ) : (
              <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {users.map((u) => (
                  <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Tahoma', fontSize: 11, cursor: 'pointer', padding: '2px 4px' }}>
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(u.id)}
                      onChange={() => toggleMember(u.id)}
                      style={{ margin: 0 }}
                    />
                    {u.image_url ? (
                      <img src={u.image_url} style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 11 }}>👤</span>
                    )}
                    {u.username}
                  </label>
                ))}
              </div>
            )}
            <button
              type="submit"
              className="xp-button"
              style={{ width: '100%' }}
              disabled={!groupName.trim() || selectedMembers.length === 0}
            >
              Create
            </button>
          </form>
        ) : (
          <button className="xp-button" style={{ width: '100%' }} onClick={openGroupPicker}>
            + New Group
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
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.dm_with || room.name}</span>
            {(unreadCounts[room.id] ?? 0) > 0 && <UnreadBadge count={unreadCounts[room.id]} />}
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
