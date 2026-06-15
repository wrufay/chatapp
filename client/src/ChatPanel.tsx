import { useEffect, useRef, useState } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { useStore } from './store';
import { getSocket } from './socket';
import Message from './Message';
import ProfileModal from './ProfileModal';
import { i6 } from './assets/images';
import type { User } from './types';
import type { Message as MessageType } from './types';

const API = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface Props {
  roomId: string | null;
  currentUserId: string;
  currentUsername: string;
  getToken: () => Promise<string | null>;
  onDeleteMessage: (roomId: string, msgId: string) => void;
  onLeaveRoom: (roomId: string) => void;
}

export default function ChatPanel({ roomId, currentUserId, currentUsername, getToken, onDeleteMessage, onLeaveRoom }: Props) {
  const messages = useStore((s) => (roomId ? s.messages[roomId] : undefined)) ?? [];
  const typingUsers = useStore((s) => (roomId ? s.typingUsers[roomId] : undefined)) ?? [];
  const readReceipts = useStore((s) => (roomId ? s.readReceipts[roomId] : undefined)) ?? {};
  const presenceByRoom = useStore((s) => s.presenceByRoom);
  const onlineUserIds = new Set(Object.values(presenceByRoom).flat());
  const setMessages = useStore((s) => s.setMessages);
  const setActiveRoom = useStore((s) => s.setActiveRoom);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; username: string; content: string } | null>(null);
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [doubleTapEmoji, setDoubleTapEmoji] = useState(() => localStorage.getItem('doubleTapEmoji') ?? '❤️');
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  function handleChangeDoubleTap(emoji: string) {
    setDoubleTapEmoji(emoji);
    localStorage.setItem('doubleTapEmoji', emoji);
  }
  const [emojiSuggestions, setEmojiSuggestions] = useState<{ id: string; native: string }[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const domInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef('');

  const rooms = useStore((s) => s.rooms);
  const room = rooms.find((r) => r.id === roomId);

  const [groupMembers, setGroupMembers] = useState<User[]>([]);
  const [invitePickerOpen, setInvitePickerOpen] = useState(false);
  const [inviteUsers, setInviteUsers] = useState<User[]>([]);
  const [loadingInvite, setLoadingInvite] = useState(false);

  useEffect(() => {
    if (!roomId) return;
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/rooms/${roomId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (Array.isArray(data)) setMessages(roomId!, data);
      } catch (err) {
        console.error('Failed to load messages:', err);
      }
    }
    load();
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !room?.is_group) { setGroupMembers([]); return; }
    async function loadMembers() {
      try {
        const token = await getToken();
        const res = await fetch(`${API}/rooms/${roomId}/members`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (Array.isArray(data)) setGroupMembers(data);
      } catch {}
    }
    loadMembers();
  }, [roomId, room?.is_group]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (!roomId || !messages.length) return;
    const lastId = messages[messages.length - 1].id;
    const socket = getSocket();
    if (socket) socket.emit('mark_read', { roomId, messageId: lastId });
  }, [messages]);

  function insertEmoji(native: string) {
    const el = domInputRef.current;
    const start = el?.selectionStart ?? input.length;
    const end = el?.selectionEnd ?? input.length;
    const newVal = input.slice(0, start) + native + input.slice(end);
    setInput(newVal);
    inputRef.current = newVal;
    requestAnimationFrame(() => {
      if (el) { el.selectionStart = el.selectionEnd = start + [...native].length; el.focus(); }
    });
  }

  function selectSuggestion(native: string) {
    const openMatch = inputRef.current.match(/:([a-zA-Z0-9_+-]{1,})$/);
    const newVal = openMatch ? inputRef.current.slice(0, -openMatch[0].length) + native : inputRef.current + native;
    setInput(newVal);
    inputRef.current = newVal;
    setEmojiSuggestions([]);
    setSuggestionIndex(0);
    domInputRef.current?.focus();
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    let val = e.target.value;
    // Completed shortcode: replace immediately
    const completed = val.match(/:([a-zA-Z0-9_+-]+):$/);
    if (completed) {
      const entry = (data as any).emojis[completed[1]];
      if (entry) { val = val.slice(0, -completed[0].length) + entry.skins[0].native; setEmojiSuggestions([]); }
    } else {
      // Open shortcode: show suggestions
      const open = val.match(/:([a-zA-Z0-9_+-]{2,})$/);
      if (open) {
        const q = open[1].toLowerCase();
        const results = (Object.entries((data as any).emojis) as [string, any][])
          .filter(([id]) => id.includes(q))
          .sort(([a], [b]) => (a.startsWith(q) ? 0 : 1) - (b.startsWith(q) ? 0 : 1))
          .slice(0, 8)
          .map(([id, emoji]) => ({ id, native: emoji.skins[0].native }));
        setEmojiSuggestions(results);
        setSuggestionIndex(0);
      } else {
        setEmojiSuggestions([]);
      }
    }
    setInput(val);
    inputRef.current = val;
    const socket = getSocket();
    if (!socket) return;
    if (val.trim()) {
      socket.emit('typing_start', { roomId });
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        if (!inputRef.current.trim()) socket.emit('typing_stop', { roomId });
      }, 1500);
    } else {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      socket.emit('typing_stop', { roomId });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (emojiSuggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestionIndex((i) => Math.min(i + 1, emojiSuggestions.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestionIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectSuggestion(emojiSuggestions[suggestionIndex]?.native ?? ''); return; }
      if (e.key === 'Escape') { setEmojiSuggestions([]); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function setPending(file: File) {
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return { file, previewUrl: URL.createObjectURL(file) };
    });
  }

  function clearPending() {
    setPendingImage((prev) => { if (prev) URL.revokeObjectURL(prev.previewUrl); return null; });
  }

  async function send() {
    const content = input.trim();
    if (!content && !pendingImage) return;
    const socket = getSocket();
    if (!socket) return;
    setSending(true);
    try {
      let imageUrl: string | null = null;
      if (pendingImage) {
        const token = await getToken();
        const form = new FormData();
        form.append('image', pendingImage.file);
        const res = await fetch(`${API}/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
        const data = await res.json();
        imageUrl = data.url ?? null;
        clearPending();
      }
      socket.emit('send_message', { roomId, content, replyToId: replyTo?.id ?? null, imageUrl });
      socket.emit('typing_stop', { roomId });
      if (typingTimer.current) clearTimeout(typingTimer.current);
      setInput('');
      setReplyTo(null);
      setEmojiPickerOpen(false);
    } finally {
      setSending(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPending(file);
    e.target.value = '';
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) { setPending(file); e.preventDefault(); }
        break;
      }
    }
  }

  function handleReply(msg: MessageType) {
    setReplyTo({ id: msg.id, username: msg.username, content: msg.content });
  }

  async function handleReact(messageId: string, emoji: string) {
    const token = await getToken();
    await fetch(`${API}/rooms/${roomId}/messages/${messageId}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ emoji }),
    });
  }

  async function openInvitePicker() {
    setInvitePickerOpen(true);
    setLoadingInvite(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/users`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) {
        const memberIds = new Set(groupMembers.map((m) => m.id));
        setInviteUsers(data.filter((u: User) => !memberIds.has(u.id)));
      }
    } finally {
      setLoadingInvite(false);
    }
  }

  async function handleInvite(userId: string) {
    const token = await getToken();
    const res = await fetch(`${API}/groups/${roomId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      const invited = inviteUsers.find((u) => u.id === userId);
      if (invited) setGroupMembers((prev) => [...prev, invited]);
      setInviteUsers((prev) => prev.filter((u) => u.id !== userId));
    }
  }

  if (!roomId) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#d4d0c8' }}>
        <div style={{ fontFamily: 'Tahoma', fontSize: 12, color: '#666', textAlign: 'center' }}>
          <img src={i6} style={{ width: 48, height: 48, imageRendering: 'pixelated', marginBottom: 8 }} />
          <div>Select a room to start chatting</div>
        </div>
      </div>
    );
  }

  const displayTyping = typingUsers.filter((u) => u !== currentUsername);
  const isPrivate = room?.is_dm || room?.is_group;
  const title = room?.is_dm ? (room.dm_with ?? 'DM') : room?.is_group ? room.name : `#${room?.name || roomId}`;

  return (
    <div className="xp-window" style={{ flex: 1, margin: 0, borderRadius: 0, border: 'none', borderLeft: '1px solid #808080' }}>
      <div className="xp-titlebar">
        <button
          className="xp-btn mobile-back"
          style={{ display: 'none', marginRight: 6 }}
          onClick={() => {
            const socket = getSocket();
            if (socket) socket.emit('leave_room', roomId);
            setActiveRoom(null);
          }}
        >←</button>
        <span className="xp-titlebar-text">
          {title}
          {room?.is_group && groupMembers.length > 0 && (
            <span style={{ fontWeight: 'normal', fontSize: 10, opacity: 0.75, marginLeft: 6 }}>
              ({groupMembers.length})
            </span>
          )}
        </span>
        {isPrivate && (
          <div style={{ display: 'flex', gap: 3, marginRight: 4 }}>
            {room?.is_group && (
              <button
                className="xp-btn"
                style={{ width: 'auto', fontSize: 10, padding: '1px 6px' }}
                onClick={invitePickerOpen ? () => setInvitePickerOpen(false) : openInvitePicker}
              >
                + Invite
              </button>
            )}
            <button
              className="xp-btn"
              style={{ width: 'auto', fontSize: 10, padding: '1px 6px' }}
              onClick={() => onLeaveRoom(roomId)}
            >
              Leave
            </button>
          </div>
        )}
        <div className="xp-controls">
          <button className="xp-btn">─</button>
          <button className="xp-btn">□</button>
          <button className="xp-btn close" onClick={() => {
            const socket = getSocket();
            if (socket) socket.emit('leave_room', roomId);
            setActiveRoom(null);
          }}>✕</button>
        </div>
      </div>

      {invitePickerOpen && (
        <div style={{
          background: '#d4d0c8', borderBottom: '1px solid #808080',
          padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{ fontFamily: 'Tahoma', fontSize: 10, color: '#333', fontWeight: 'bold' }}>Invite to group</div>
          {loadingInvite ? (
            <div style={{ fontFamily: 'Tahoma', fontSize: 10, color: '#666' }}>Loading…</div>
          ) : inviteUsers.length === 0 ? (
            <div style={{ fontFamily: 'Tahoma', fontSize: 10, color: '#666' }}>No users to invite</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {inviteUsers.map((u) => (
                <button
                  key={u.id}
                  className="xp-button"
                  style={{ fontSize: 10, padding: '1px 6px', display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => handleInvite(u.id)}
                >
                  {u.image_url
                    ? <img src={u.image_url} style={{ width: 12, height: 12, borderRadius: '50%', objectFit: 'cover' }} />
                    : '👤'
                  }
                  {u.username}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="xp-body">
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {messages.map((msg, i) => {
            const seenBy = msg.user_id !== currentUserId ? [] : Object.entries(readReceipts)
              .filter(([uid, r]) => r.messageId === msg.id && uid !== currentUserId)
              .map(([, r]) => r.username);
            return (
              <div key={msg.id}>
                <Message
                  msg={msg}
                  prevMsg={messages[i - 1]}
                  currentUserId={currentUserId}
                  onReact={(msgId, emoji) => handleReact(msgId, emoji)}
                  onDelete={msg.user_id === currentUserId ? () => onDeleteMessage(roomId, msg.id) : undefined}
                  onReply={handleReply}
                  doubleTapEmoji={doubleTapEmoji}
                  onChangeDoubleTap={handleChangeDoubleTap}
                  isOnline={onlineUserIds.has(msg.user_id)}
                  onUsernameClick={setViewingUserId}
                />
                {seenBy.length > 0 && (
                  <div style={{ padding: '0 8px 4px', fontFamily: 'Tahoma', fontSize: 10, color: '#999', fontStyle: 'italic' }}>
                    seen by {seenBy.join(', ')}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <div className="typing-indicator">
          {displayTyping.length > 0
            ? `${displayTyping.join(', ')} ${displayTyping.length === 1 ? 'is' : 'are'} typing…`
            : ''}
        </div>
        {replyTo && (
          <div className="reply-bar">
            <span>↩ Replying to <strong>{replyTo.username}</strong>: {replyTo.content.length > 50 ? replyTo.content.slice(0, 50) + '…' : replyTo.content}</span>
            <button className="reply-bar-cancel" onClick={() => setReplyTo(null)}>✕</button>
          </div>
        )}
        {pendingImage && (
          <div className="image-preview-bar">
            <img src={pendingImage.previewUrl} alt="preview" className="image-preview-thumb" />
            <span style={{ fontFamily: 'Tahoma', fontSize: 10, color: '#555', flex: 1 }}>{pendingImage.file.name}</span>
            <button className="reply-bar-cancel" onClick={clearPending}>✕</button>
          </div>
        )}
        <div style={{ position: 'relative' }}>
          {emojiSuggestions.length > 0 && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 210,
              background: '#fff', border: '1px solid #808080', boxShadow: '2px 2px 0 #000',
              fontFamily: 'Tahoma', fontSize: 12,
            }}>
              <div style={{ padding: '2px 8px', background: '#d4d0c8', borderBottom: '1px solid #ccc', fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Emoji matching {inputRef.current.match(/:([a-zA-Z0-9_+-]{2,})$/)?.[0] ?? ''}
              </div>
              {emojiSuggestions.map((s, i) => (
                <div
                  key={s.id}
                  onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s.native); }}
                  onMouseEnter={() => setSuggestionIndex(i)}
                  style={{
                    padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                    background: i === suggestionIndex ? '#0a246a' : 'white',
                    color: i === suggestionIndex ? 'white' : '#333',
                  }}
                >
                  <span style={{ fontSize: 20, lineHeight: 1 }}>{s.native}</span>
                  <span>:{s.id}:</span>
                </div>
              ))}
            </div>
          )}
          {emojiPickerOpen && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 190 }}
                onClick={() => setEmojiPickerOpen(false)}
              />
              <div style={{ position: 'absolute', bottom: '100%', right: 0, zIndex: 200 }}>
                <Picker
                  data={data}
                  onEmojiSelect={(emoji: any) => { insertEmoji(emoji.native); setEmojiPickerOpen(false); }}
                  theme="light"
                  previewPosition="none"
                  skinTonePosition="none"
                />
              </div>
            </>
          )}
          <div className="chat-input-area">
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
            <button className="xp-button" onClick={() => fileInputRef.current?.click()} title="Attach image">🖼</button>
            <input
              ref={domInputRef}
              className="xp-input"
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Type a message… or :shortcode:"
              style={{ flex: 1 }}
            />
            <button className="xp-button" onClick={() => setEmojiPickerOpen((v) => !v)} title="Emoji">😊</button>
            <button className="xp-button" onClick={send} disabled={sending}>{sending ? '…' : 'Send'}</button>
          </div>
        </div>
      </div>
      {viewingUserId && (
        <ProfileModal
          userId={viewingUserId}
          onClose={() => setViewingUserId(null)}
          getToken={getToken}
        />
      )}
    </div>
  );
}
