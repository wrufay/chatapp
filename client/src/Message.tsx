import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Message as MessageType } from './types';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function getAccentColor(username: string): string {
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

interface Props {
  msg: MessageType;
  prevMsg?: MessageType;
  currentUserId: string;
  onReact: (msgId: string, emoji: string) => void;
  onReply: (msg: MessageType) => void;
  doubleTapEmoji: string;
  onChangeDoubleTap: (emoji: string) => void;
}

export default function Message({ msg, prevMsg, currentUserId, onReact, onReply, doubleTapEmoji, onChangeDoubleTap }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [changingDoubleTap, setChangingDoubleTap] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef(0);
  const lastClickRef = useRef(0);

  useEffect(() => {
    if (!lightboxUrl) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setLightboxUrl(null); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxUrl]);
  const reactions = msg.reactions ?? {};
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const accentColor = getAccentColor(msg.username);
  const showMeta = !prevMsg || prevMsg.user_id !== msg.user_id;

  const EMOJI_RE = /\p{Extended_Pictographic}[️⃣]?(?:‍\p{Extended_Pictographic}[️⃣]?)*/gu;
  const emojiOnly = (() => {
    if (!msg.content || msg.image_url) return false;
    const stripped = msg.content.replace(EMOJI_RE, '').replace(/[️︎‍⃣\s]/g, '');
    return stripped.length === 0;
  })();
  const emojiCount = emojiOnly ? (msg.content.match(EMOJI_RE) ?? []).length : 0;
  const emojiFontSize = emojiOnly
    ? emojiCount === 1 ? 64 : emojiCount <= 3 ? 48 : emojiCount <= 6 ? 32 : 13
    : 13;

  function startLongPress() {
    longPressTimer.current = setTimeout(() => setPickerOpen(true), 450);
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handleTouchEnd() {
    cancelLongPress();
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      onReact(msg.id, doubleTapEmoji);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }

  function handleMouseDown(e: React.MouseEvent) {
    const now = Date.now();
    if (now - lastClickRef.current < 300) {
      e.preventDefault();
      onReact(msg.id, doubleTapEmoji);
      lastClickRef.current = 0;
    } else {
      lastClickRef.current = now;
    }
  }

  return (
    <div
      className="message-row"
      onMouseLeave={() => { setPickerOpen(false); setChangingDoubleTap(false); }}
    >
      {/* backdrop — closes picker when tapping outside on mobile */}
      {pickerOpen && (
        <div
          className="picker-backdrop"
          onClick={() => setPickerOpen(false)}
          onTouchStart={() => setPickerOpen(false)}
        />
      )}

      {showMeta && (
        <div className="message-meta">
          <span className="message-username" style={{ color: accentColor }}>{msg.username}</span>
          <span className="message-time">{time}</span>
        </div>
      )}

      {msg.reply_to_id && (
        <div className="reply-preview">
          <span className="reply-preview-username">{msg.reply_to_username}</span>
          {msg.reply_to_content && msg.reply_to_content.length > 60
            ? msg.reply_to_content.slice(0, 60) + '…'
            : msg.reply_to_content}
        </div>
      )}

      <div
        className={`message-content${emojiOnly ? ' emoji-only-content' : ''}`}
        onMouseDown={handleMouseDown}
        onTouchStart={startLongPress}
        onTouchEnd={handleTouchEnd}
        onTouchMove={cancelLongPress}
        onContextMenu={(e) => { if (pickerOpen) e.preventDefault(); }}
        style={{ fontSize: emojiFontSize, lineHeight: emojiOnly ? 1.1 : 1.5 }}
      >
        {msg.image_url && (
          <img
            src={msg.image_url}
            alt="image"
            onClick={() => setLightboxUrl(msg.image_url!)}
            style={{ maxWidth: 280, maxHeight: 280, display: 'block', borderRadius: 2, marginBottom: msg.content ? 4 : 0, cursor: 'zoom-in' }}
          />
        )}
        {msg.content}
      </div>

      {Object.keys(reactions).length > 0 && (
        <div className="message-reactions">
          {Object.entries(reactions).map(([emoji, users]) => (
            <button
              key={emoji}
              className={`reaction-pill${users.includes(currentUserId) ? ' mine' : ''}`}
              onClick={() => onReact(msg.id, emoji)}
            >
              {emoji} <span style={{ fontSize: 10, fontFamily: 'VT323, monospace', color: '#0a246a', fontWeight: 'bold' }}>{users.length}</span>
            </button>
          ))}
        </div>
      )}

      {/* desktop hover picker */}
      <div
        className="reaction-picker"
        style={{ display: pickerOpen ? 'flex' : 'none', flexDirection: 'column', alignItems: 'stretch' }}
        onMouseDown={(e) => e.preventDefault()}
        onMouseLeave={() => { setPickerOpen(false); setChangingDoubleTap(false); }}
      >
        {changingDoubleTap && (
          <div style={{ fontSize: 9, fontFamily: 'Tahoma', color: '#666', textAlign: 'center', marginBottom: 2, letterSpacing: '0.05em' }}>
            SET DOUBLE-TAP
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {EMOJIS.map((e) => (
            <button
              key={e}
              style={{ background: changingDoubleTap && e === doubleTapEmoji ? '#a6caf0' : undefined }}
              onClick={() => {
                if (changingDoubleTap) { onChangeDoubleTap(e); setChangingDoubleTap(false); setPickerOpen(false); }
                else { onReact(msg.id, e); setPickerOpen(false); }
              }}
            >{e}</button>
          ))}
          <button
            onClick={() => setChangingDoubleTap((v) => !v)}
            title="Change double-tap emoji"
            style={{
              fontSize: 14, background: changingDoubleTap ? '#a6caf0' : 'none', border: 'none',
              cursor: 'pointer', padding: '2px 4px', borderRadius: 2,
              borderLeft: '1px solid rgba(0,0,0,0.2)', paddingLeft: 6,
            }}
          >{doubleTapEmoji}✎</button>
        </div>
      </div>

      <button
        style={{
          position: 'absolute', right: 36, top: 4,
          opacity: 0, background: '#d4d0c8', border: '1px solid #808080',
          cursor: 'pointer', fontSize: 11, fontFamily: 'Tahoma', padding: '1px 5px',
          borderRadius: 2,
        }}
        className="emoji-trigger reply-trigger"
        onClick={() => onReply(msg)}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0'; }}
      >
        ↩
      </button>

      <button
        style={{
          position: 'absolute', right: 8, top: 4,
          opacity: 0, background: '#d4d0c8', border: '1px solid #808080',
          cursor: 'pointer', fontSize: 11, fontFamily: 'Tahoma', padding: '1px 5px',
          borderRadius: 2,
        }}
        className="emoji-trigger"
        onClick={() => setPickerOpen((v) => !v)}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
        onMouseLeave={(e) => { if (!pickerOpen) e.currentTarget.style.opacity = '0'; }}
      >
        ☺
      </button>

      <style>{`
        .message-row:hover .emoji-trigger { opacity: 1 !important; }
        .message-row:hover .reply-trigger { opacity: 1 !important; }
        .emoji-trigger, .reply-trigger { user-select: none; }
      `}</style>

      {lightboxUrl && createPortal(
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={lightboxUrl}
            alt="full size"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 4, boxShadow: '0 4px 32px rgba(0,0,0,0.6)', cursor: 'default' }}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            style={{
              position: 'absolute', top: 12, right: 16,
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
              color: 'white', borderRadius: 4, padding: '4px 10px',
              fontFamily: 'Tahoma', fontSize: 13, cursor: 'pointer',
            }}
          >✕</button>
        </div>,
        document.body
      )}
    </div>
  );
}
