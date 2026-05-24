import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { getSocket } from './socket';
import Message from './Message';

const API = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export default function ChatPanel({ roomId, currentUserId, currentUsername, getToken }) {
  const messages = useStore((s) => s.messages[roomId]) ?? [];
  const typingUsers = useStore((s) => s.typingUsers[roomId]) ?? [];
  const setMessages = useStore((s) => s.setMessages);
  const updateReaction = useStore((s) => s.updateReaction);
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);
  const typingTimer = useRef(null);
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
      setMessages(roomId, data);
    }
    load();
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleInput(e) {
    const val = e.target.value;
    setInput(val);
    inputRef.current = val;
    const socket = getSocket();
    if (!socket) return;
    if (val.trim()) {
      socket.emit('typing_start', { roomId });
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        if (!inputRef.current.trim()) socket.emit('typing_stop', { roomId });
      }, 1500);
    } else {
      clearTimeout(typingTimer.current);
      socket.emit('typing_stop', { roomId });
    }
  }

  function handleKeyDown(e) {
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
    clearTimeout(typingTimer.current);
    setInput('');
  }

  async function handleReact(messageId, emoji) {
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
          <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
          Select a room to start chatting
        </div>
      </div>
    );
  }

  const displayTyping = typingUsers.filter((u) => u !== currentUsername);

  return (
    <div className="xp-window" style={{ flex: 1, margin: 0, borderRadius: 0, border: 'none', borderLeft: '1px solid #808080' }}>
      <div className="xp-titlebar">
        <span className="xp-titlebar-text">#{room?.name || roomId}</span>
        <div className="xp-controls">
          <button className="xp-btn">─</button>
          <button className="xp-btn">□</button>
          <button className="xp-btn close">✕</button>
        </div>
      </div>
      <div className="xp-body">
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {messages.map((msg, i) => (
            <Message
              key={msg.id}
              msg={msg}
              prevMsg={messages[i - 1]}
              currentUserId={currentUserId}
              onReact={(msgId, emoji) => handleReact(msgId, emoji)}
            />
          ))}
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
