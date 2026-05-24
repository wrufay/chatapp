import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { getSocket } from './socket';
import Message from './Message';
import { i6 } from './assets/images';

const API = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface Props {
  roomId: string | null;
  currentUserId: string;
  currentUsername: string;
  getToken: () => Promise<string | null>;
}

export default function ChatPanel({ roomId, currentUserId, currentUsername, getToken }: Props) {
  const messages = useStore((s) => (roomId ? s.messages[roomId] : undefined)) ?? [];
  const typingUsers = useStore((s) => (roomId ? s.typingUsers[roomId] : undefined)) ?? [];
  const readReceipts = useStore((s) => (roomId ? s.readReceipts[roomId] : undefined)) ?? {};
  const setMessages = useStore((s) => s.setMessages);
  const setActiveRoom = useStore((s) => s.setActiveRoom);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef('');

  const rooms = useStore((s) => s.rooms);
  const room = rooms.find((r) => r.id === roomId);

  useEffect(() => {
    if (!roomId) return;
    async function load() {
      const token = await getToken();
      const res = await fetch(`${API}/rooms/${roomId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMessages(roomId!, data);
    }
    load();
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (!roomId || !messages.length) return;
    const lastId = messages[messages.length - 1].id;
    const socket = getSocket();
    if (socket) socket.emit('mark_read', { roomId, messageId: lastId });
  }, [messages]);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function send() {
    const content = input.trim();
    if (!content) return;
    const socket = getSocket();
    if (!socket) return;
    socket.emit('send_message', { roomId, content });
    socket.emit('typing_stop', { roomId });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    setInput('');
  }

  async function handleReact(messageId: string, emoji: string) {
    const token = await getToken();
    await fetch(`${API}/rooms/${roomId}/messages/${messageId}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ emoji }),
    });
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
        <span className="xp-titlebar-text">#{room?.name || roomId}</span>
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
      <div className="xp-body">
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {messages.map((msg, i) => {
            const seenBy = Object.entries(readReceipts)
              .filter(([uid, r]) => r.messageId === msg.id && uid !== currentUserId)
              .map(([, r]) => r.username);
            return (
              <div key={msg.id}>
                <Message
                  msg={msg}
                  prevMsg={messages[i - 1]}
                  currentUserId={currentUserId}
                  onReact={(msgId, emoji) => handleReact(msgId, emoji)}
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
        <div className="chat-input-area">
          <input
            className="xp-input"
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            style={{ flex: 1 }}
          />
          <button className="xp-button" onClick={send}>Send</button>
        </div>
      </div>
    </div>
  );
}
