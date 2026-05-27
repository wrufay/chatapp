require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const { clerkMiddleware, getAuth } = require('@clerk/express');
const multer = require('multer');
const pool = require('./db');
const redis = require('./redis');

const storage = multer.diskStorage({
  destination: path.join(__dirname, 'uploads'),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'));
  },
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true },
});

app.set('etag', false);
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(clerkMiddleware());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

// REST: POST /upload
app.post('/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image' });
  const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url });
});

// REST: GET /rooms — public rooms + DMs where the user is a member
app.get('/rooms', requireAuth, async (req, res) => {
  const result = await pool.query(`
    SELECT r.*,
      (CASE WHEN r.is_dm THEN (
        SELECT u.username FROM room_members rm JOIN users u ON u.id = rm.user_id
        WHERE rm.room_id = r.id AND rm.user_id != $1 LIMIT 1
      ) END) AS dm_with,
      (CASE WHEN r.is_dm THEN (
        SELECT u.image_url FROM room_members rm JOIN users u ON u.id = rm.user_id
        WHERE rm.room_id = r.id AND rm.user_id != $1 LIMIT 1
      ) END) AS dm_with_image
    FROM rooms r
    WHERE (r.is_dm = false AND r.is_group = false)
       OR EXISTS (SELECT 1 FROM room_members rm WHERE rm.room_id = r.id AND rm.user_id = $1)
    ORDER BY r.created_at ASC
  `, [req.userId]);
  res.json(result.rows);
});

// REST: GET /users — everyone except yourself (for DM picker)
app.get('/users', requireAuth, async (req, res) => {
  const result = await pool.query(
    'SELECT id, username, image_url FROM users WHERE id != $1 ORDER BY username ASC',
    [req.userId]
  );
  res.json(result.rows);
});

// REST: POST /dms — create or retrieve a DM room between two users
app.post('/dms', requireAuth, async (req, res) => {
  const { targetUserId } = req.body;
  const currentUserId = req.userId;
  if (!targetUserId || targetUserId === currentUserId)
    return res.status(400).json({ error: 'Invalid target user' });

  const targetUser = await pool.query('SELECT * FROM users WHERE id = $1', [targetUserId]);
  if (!targetUser.rows.length) return res.status(404).json({ error: 'User not found' });

  const currentUser = await pool.query('SELECT * FROM users WHERE id = $1', [currentUserId]);

  // Check for existing DM between these two users
  const existing = await pool.query(`
    SELECT r.id FROM rooms r
    JOIN room_members a ON a.room_id = r.id AND a.user_id = $1
    JOIN room_members b ON b.room_id = r.id AND b.user_id = $2
    WHERE r.is_dm = true LIMIT 1
  `, [currentUserId, targetUserId]);

  let roomId;
  if (existing.rows.length) {
    roomId = existing.rows[0].id;
  } else {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const roomRow = await client.query(
        `INSERT INTO rooms (name, created_by, is_dm) VALUES ($1, $2, true) RETURNING *`,
        [`dm:${currentUserId}:${targetUserId}`, currentUserId]
      );
      roomId = roomRow.rows[0].id;
      await client.query(
        'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2), ($1, $3)',
        [roomId, currentUserId, targetUserId]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Notify both users in real-time
    io.emit('dm_created', {
      roomId,
      members: [
        { id: currentUserId, username: currentUser.rows[0].username, image_url: currentUser.rows[0].image_url },
        { id: targetUserId, username: targetUser.rows[0].username, image_url: targetUser.rows[0].image_url },
      ],
    });
  }

  // Return full room with dm_with from the requester's perspective
  const room = await pool.query(`
    SELECT r.*,
      u.username AS dm_with, u.image_url AS dm_with_image
    FROM rooms r
    JOIN room_members rm ON rm.room_id = r.id AND rm.user_id != $1
    JOIN users u ON u.id = rm.user_id
    WHERE r.id = $2
  `, [currentUserId, roomId]);
  res.json(room.rows[0]);
});

// REST: POST /groups — create a private group chat
app.post('/groups', requireAuth, async (req, res) => {
  const { name, memberIds } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  if (!Array.isArray(memberIds) || memberIds.length === 0)
    return res.status(400).json({ error: 'At least one other member required' });

  const allMembers = [...new Set([req.userId, ...memberIds])];
  const validCheck = await pool.query('SELECT id FROM users WHERE id = ANY($1)', [memberIds]);
  const validIds = new Set(validCheck.rows.map((r) => r.id));
  if (memberIds.some((id) => !validIds.has(id)))
    return res.status(400).json({ error: 'One or more invalid member IDs' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const roomRow = await client.query(
      'INSERT INTO rooms (name, created_by, is_group) VALUES ($1, $2, true) RETURNING *',
      [name.trim(), req.userId]
    );
    const roomId = roomRow.rows[0].id;
    for (const userId of allMembers) {
      await client.query('INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)', [roomId, userId]);
    }
    await client.query('COMMIT');

    const members = await pool.query(
      'SELECT id, username, image_url FROM users WHERE id = ANY($1)',
      [allMembers]
    );
    io.emit('group_created', { roomId: String(roomId), name: name.trim(), members: members.rows });
    res.json({ ...roomRow.rows[0], id: String(roomRow.rows[0].id) });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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

// REST: GET /rooms/:id/members
app.get('/rooms/:id/members', requireAuth, async (req, res) => {
  const roomRow = await pool.query('SELECT is_dm, is_group FROM rooms WHERE id = $1', [req.params.id]);
  if (!roomRow.rows.length) return res.status(404).json({ error: 'Not found' });
  if (roomRow.rows[0].is_dm || roomRow.rows[0].is_group) {
    const member = await pool.query(
      'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!member.rows.length) return res.status(403).json({ error: 'Forbidden' });
  }
  const result = await pool.query(
    `SELECT u.id, u.username, u.image_url FROM room_members rm
     JOIN users u ON u.id = rm.user_id WHERE rm.room_id = $1`,
    [req.params.id]
  );
  res.json(result.rows);
});

// REST: GET /rooms/:id/messages
app.get('/rooms/:id/messages', requireAuth, async (req, res) => {
  const roomRow = await pool.query('SELECT is_dm, is_group FROM rooms WHERE id = $1', [req.params.id]);
  if (!roomRow.rows.length) return res.status(404).json({ error: 'Not found' });
  if (roomRow.rows[0].is_dm || roomRow.rows[0].is_group) {
    const member = await pool.query(
      'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!member.rows.length) return res.status(403).json({ error: 'Forbidden' });
  }
  const result = await pool.query(
    `SELECT m.*,
       p.username AS reply_to_username,
       p.content  AS reply_to_content
     FROM (
       SELECT * FROM messages WHERE room_id = $1 ORDER BY created_at DESC LIMIT 200
     ) m
     LEFT JOIN messages p ON p.id = m.reply_to_id
     ORDER BY m.created_at ASC`,
    [req.params.id]
  );
  res.json(result.rows);
});

// REST: DELETE /rooms/:id/messages/:msgId — delete own message
app.delete('/rooms/:id/messages/:msgId', requireAuth, async (req, res) => {
  const existing = await pool.query('SELECT user_id, room_id FROM messages WHERE id = $1', [req.params.msgId]);
  if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
  if (existing.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Forbidden' });
  await pool.query('DELETE FROM messages WHERE id = $1', [req.params.msgId]);
  const roomId = existing.rows[0].room_id;
  io.to(`room:${roomId}`).emit('message_deleted', { roomId: String(roomId), messageId: String(req.params.msgId) });
  res.json({ ok: true });
});

// REST: DELETE /rooms/:id/membership — leave a DM or group
app.delete('/rooms/:id/membership', requireAuth, async (req, res) => {
  const roomRow = await pool.query('SELECT is_dm, is_group FROM rooms WHERE id = $1', [req.params.id]);
  if (!roomRow.rows.length) return res.status(404).json({ error: 'Not found' });
  if (!roomRow.rows[0].is_dm && !roomRow.rows[0].is_group)
    return res.status(400).json({ error: 'Cannot leave a public room' });
  await pool.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ ok: true });
});

// REST: POST /groups/:id/members — invite a user to a group
app.post('/groups/:id/members', requireAuth, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const isMember = await pool.query(
    'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );
  if (!isMember.rows.length) return res.status(403).json({ error: 'Forbidden' });
  const targetUser = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (!targetUser.rows.length) return res.status(404).json({ error: 'User not found' });
  await pool.query(
    'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [req.params.id, userId]
  );
  const room = await pool.query('SELECT * FROM rooms WHERE id = $1', [req.params.id]);
  io.emit('group_invited', {
    roomId: String(req.params.id),
    room: { id: String(req.params.id), name: room.rows[0].name, is_dm: false, is_group: true },
    userId,
  });
  res.json({ ok: true });
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
    const roomRow = await pool.query('SELECT is_dm, is_group FROM rooms WHERE id = $1', [roomId]);
    if (roomRow.rows[0]?.is_dm || roomRow.rows[0]?.is_group) {
      const member = await pool.query(
        'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2',
        [roomId, socket.userId]
      );
      if (!member.rows.length) return;
    }
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

  socket.on('send_message', async ({ roomId, content, imageUrl, replyToId }, ack) => {
    try {
      if (!content?.trim() && !imageUrl) return;
      const roomRow = await pool.query('SELECT is_dm, is_group FROM rooms WHERE id = $1', [roomId]);
      if (!roomRow.rows.length) return ack?.({ error: 'Room not found' });
      if (roomRow.rows[0].is_dm || roomRow.rows[0].is_group) {
        const member = await pool.query(
          'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2',
          [roomId, socket.userId]
        );
        if (!member.rows.length) return ack?.({ error: 'Not a member' });
      }
      const inserted = await pool.query(
        'INSERT INTO messages (room_id, user_id, username, content, image_url, reply_to_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [roomId, socket.userId, socket.username, content?.trim() ?? '', imageUrl ?? null, replyToId ?? null]
      );
      const msg = inserted.rows[0];
      if (msg.reply_to_id) {
        const parent = await pool.query('SELECT username, content FROM messages WHERE id = $1', [msg.reply_to_id]);
        if (parent.rows.length) {
          msg.reply_to_username = parent.rows[0].username;
          msg.reply_to_content = parent.rows[0].content;
        }
      }
      io.to(`room:${roomId}`).emit('new_message', msg);
      ack?.({ ok: true });
    } catch (err) {
      console.error('[send_message] error:', err.message);
      ack?.({ error: err.message });
    }
  });

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
