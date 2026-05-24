import { useState } from 'react';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function getAccentColor(username) {
  if (!username) return '#333';
  const h = username.toLowerCase();
  if (h.includes('jackson')) return '#53d8fb';
  if (h.includes('justin')) return '#66c3ff';
  if (h.includes('fay')) return '#d4afb9';
  const colors = ['#53d8fb', '#66c3ff', '#d4afb9', '#a6caf0', '#f0a6a6', '#a6f0b4'];
  let sum = 0;
  for (const c of username) sum += c.charCodeAt(0);
  return colors[sum % colors.length];
}

export default function Message({ msg, prevMsg, currentUserId, onReact }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const reactions = msg.reactions || {};
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const accentColor = getAccentColor(msg.username);
  const showMeta = !prevMsg || prevMsg.user_id !== msg.user_id;

  return (
    <div
      className="message-row"
      onMouseEnter={() => {}}
      onMouseLeave={() => setPickerOpen(false)}
    >
      {showMeta && (
        <div className="message-meta">
          <span className="message-username" style={{ color: accentColor }}>{msg.username}</span>
          <span className="message-time">{time}</span>
        </div>
      )}
      <div className="message-content">{msg.content}</div>

      {Object.keys(reactions).length > 0 && (
        <div className="message-reactions">
          {Object.entries(reactions).map(([emoji, users]) => (
            <button
              key={emoji}
              className={`reaction-pill${users.includes(currentUserId) ? ' mine' : ''}`}
              onClick={() => onReact(msg.id, emoji)}
            >
              {emoji} <span style={{ fontSize: 10, fontFamily: 'VT323, monospace' }}>{users.length}</span>
            </button>
          ))}
        </div>
      )}

      <div
        className="reaction-picker"
        style={{ display: pickerOpen ? 'flex' : 'none' }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {EMOJIS.map((e) => (
          <button key={e} onClick={() => { onReact(msg.id, e); setPickerOpen(false); }}>{e}</button>
        ))}
      </div>

      <button
        style={{
          position: 'absolute', right: 8, top: 4,
          opacity: 0, background: '#d4d0c8', border: '1px solid #808080',
          cursor: 'pointer', fontSize: 11, fontFamily: 'Tahoma', padding: '1px 5px',
          borderRadius: 2,
        }}
        className="emoji-trigger"
        onClick={() => setPickerOpen((v) => !v)}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
        onMouseLeave={(e) => { if (!pickerOpen) e.currentTarget.style.opacity = 0; }}
      >
        ☺
      </button>

      <style>{`
        .message-row:hover .emoji-trigger { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
