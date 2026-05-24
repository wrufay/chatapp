import { useState } from 'react';
import { useStore } from './store';

const EMOJI_MAP = { '💬': true };

export default function Sidebar({ onSelectRoom, onCreateRoom }) {
  const rooms = useStore((s) => s.rooms);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const [newRoomName, setNewRoomName] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    await onCreateRoom(newRoomName.trim());
    setNewRoomName('');
    setCreating(false);
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">💬 Rooms</div>
      <div className="sidebar-section">
        {rooms.map((room) => (
          <div
            key={room.id}
            className={`room-item${activeRoomId === room.id ? ' active' : ''}`}
            onClick={() => onSelectRoom(room.id)}
          >
            # {room.name}
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
    </div>
  );
}
