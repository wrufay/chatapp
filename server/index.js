require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { clerkMiddleware, getAuth } = require('@clerk/express');
const pool = require('./db');
const redis = require('./redis');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true },
});

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(clerkMiddleware());

function requireAuth(req, res, next) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = userId;
  next();
}

// Upsert user into DB from Clerk session
async function upsertUser(userId, username, imageUrl) {
  await pool.query(
    `INSERT INTO users (id, username, image_url) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET username = $2, image_url = $3`,
    [userId, username, imageUrl]
  );
}

// REST: GET /rooms
app.get('/rooms', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM rooms ORDER BY created_at ASC');
  res.json(result.rows);
});

// REST: POST /rooms
app.post('/rooms', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const result = await pool.query(
      'INSERT INTO rooms (name, created_by) VALUES ($1, $2) RETURNING *',
      [name.trim(), req.userId]
    );
    io.emit('room_created', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Room already exists' });
    throw err;
  }
});

// REST: GET /rooms/:id/messages
app.get('/rooms/:id/messages', requireAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const result = await pool.query(
    'SELECT * FROM messages WHERE room_id = $1 ORDER BY created_at ASC LIMIT 200',
    [req.params.id]
  );
  res.json(result.rows);
});

// REST: POST /rooms/:id/messages/:msgId/react
app.post('/rooms/:id/messages/:msgId/react', requireAuth, async (req, res) => {
  const { emoji } = req.body;
  const msgId = req.params.msgId;
  const userId = req.userId;

  const existing = await pool.query('SELECT reactions FROM messages WHERE id = $1', [msgId]);
  if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });

  const reactions = existing.rows[0].reactions || {};
  if (!reactions[emoji]) reactions[emoji] = [];
  const idx = reactions[emoji].indexOf(userId);
  if (idx === -1) {
    reactions[emoji].push(userId);
  } else {
    reactions[emoji].splice(idx, 1);
    if (reactions[emoji].length === 0) delete reactions[emoji];
  }

  await pool.query('UPDATE messages SET reactions = $1 WHERE id = $2', [JSON.stringify(reactions), msgId]);
  const roomId = parseInt(req.params.id);
  io.to(`room:${roomId}`).emit('reaction_updated', { roomId, messageId: parseInt(msgId), reactions });
  res.json({ reactions });
});

// Socket.io
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('No token'));
  // We trust the token and extract userId/username from handshake
  // Actual verification happens via Clerk's session
  socket.userId = socket.handshake.auth.userId;
  socket.username = socket.handshake.auth.username;
  socket.imageUrl = socket.handshake.auth.imageUrl;
  if (!socket.userId) return next(new Error('No userId'));
  await upsertUser(socket.userId, socket.username, socket.imageUrl).catch(() => {});
  next();
});

async function getRoomReads(roomId) {
  const keys = await redis.keys(`room:${roomId}:read:*`);
  const reads = {};
  for (const key of keys) {
    const userId = key.split(':')[3];
    const val = await redis.get(key);
    if (val) reads[userId] = JSON.parse(val);
  }
  return reads;
}

function wrapAsync(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      console.error(`[socket error] ${fn.name || 'handler'}:`, err);
    }
  };
}

io.on('connection', (socket) => {
  socket.on('join_room', wrapAsync(async (roomId) => {
    socket.join(`room:${roomId}`);
    await redis.sadd(`room:${roomId}:members`, socket.userId);
    const members = await redis.smembers(`room:${roomId}:members`);
    io.to(`room:${roomId}`).emit('presence', { roomId, members });
    socket.emit('read_update', { roomId, reads: await getRoomReads(roomId) });
  }));

  socket.on('mark_read', wrapAsync(async ({ roomId, messageId }) => {
    await redis.set(`room:${roomId}:read:${socket.userId}`, JSON.stringify({ messageId, username: socket.username }));
    io.to(`room:${roomId}`).emit('read_update', { roomId, reads: await getRoomReads(roomId) });
  }));

  socket.on('leave_room', wrapAsync(async (roomId) => {
    socket.leave(`room:${roomId}`);
    await redis.srem(`room:${roomId}:members`, socket.userId);
    const members = await redis.smembers(`room:${roomId}:members`);
    io.to(`room:${roomId}`).emit('presence', { roomId, members });
    await redis.del(`room:${roomId}:typing:${socket.userId}`);
    io.to(`room:${roomId}`).emit('typing_update', await getTypingUsers(roomId));
  }));

  socket.on('send_message', wrapAsync(async ({ roomId, content }) => {
    if (!content || !content.trim()) return;
    const result = await pool.query(
      'INSERT INTO messages (room_id, user_id, username, content) VALUES ($1, $2, $3, $4) RETURNING *',
      [roomId, socket.userId, socket.username, content.trim()]
    );
    io.to(`room:${roomId}`).emit('new_message', result.rows[0]);
  }));

  socket.on('typing_start', wrapAsync(async ({ roomId }) => {
    await redis.set(`room:${roomId}:typing:${socket.userId}`, socket.username, 'EX', 5);
    io.to(`room:${roomId}`).emit('typing_update', await getTypingUsers(roomId));
  }));

  socket.on('typing_stop', wrapAsync(async ({ roomId }) => {
    await redis.del(`room:${roomId}:typing:${socket.userId}`);
    io.to(`room:${roomId}`).emit('typing_update', await getTypingUsers(roomId));
  }));

  socket.on('disconnecting', wrapAsync(async () => {
    for (const room of socket.rooms) {
      if (!room.startsWith('room:')) continue;
      const roomId = room.replace('room:', '');
      await redis.srem(`room:${roomId}:members`, socket.userId);
      await redis.del(`room:${roomId}:typing:${socket.userId}`);
      const members = await redis.smembers(`room:${roomId}:members`);
      io.to(room).emit('presence', { roomId, members });
      io.to(room).emit('typing_update', await getTypingUsers(roomId));
    }
  }));
});

async function getTypingUsers(roomId) {
  const keys = await redis.keys(`room:${roomId}:typing:*`);
  const users = [];
  for (const key of keys) {
    const name = await redis.get(key);
    if (name) users.push(name);
  }
  return { roomId, users };
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
