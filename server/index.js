require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { clerkMiddleware, getAuth } = require('@clerk/express');
const { verifyToken } = require('@clerk/backend');
const rateLimit = require('express-rate-limit');
const pool = require('./db');
const redis = require('./redis');

const clerkEnabled = !!(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY);

// cloudinary reads CLOUDINARY_URL from the environment automatically - no
// explicit .config() call needed.
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'chatapp',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
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
if (clerkEnabled) app.use(clerkMiddleware());

// Blunt per-IP cap across the whole REST API. Doesn't cover socket.io (it
// attaches to the raw http.Server before Express's middleware chain runs),
// so send_message and the connection handshake get their own Redis-backed
// limiters further down instead.
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
}));

// No accounts: identity is just a client-generated id + secret, both
// persisted in the browser's localStorage. First request for an id wins and
// registers the secret; every later request for that id must present the
// same secret. This isn't real auth (nothing stops someone from reading
// their own localStorage and impersonating themselves elsewhere), it just
// stops a stranger from casually hijacking someone else's id.
async function verifyIdentity(userId, secret, username) {
  // Atomic upsert instead of check-then-insert: two first requests for the
  // same brand-new userId (e.g. the socket handshake and the /rooms fetch
  // firing close together) used to race and violate the id primary key.
  // `xmax = 0` is postgres's standard tell for "this row was just inserted
  // by this statement" vs. "this hit the ON CONFLICT branch".
  const { rows } = await pool.query(
    `INSERT INTO users (id, username, secret) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET id = users.id
     RETURNING secret, (xmax = 0) AS inserted`,
    [userId, username || 'anon', secret]
  );
  const row = rows[0];
  if (row.inserted) return true;
  if (row.secret !== secret) return false;
  if (username) await pool.query('UPDATE users SET username = $1 WHERE id = $2', [username, userId]);
  return true;
}

// Clerk accounts (signed in with Google) live in the same `users` table as
// anonymous ones; `secret` just stays NULL for them since Clerk verifies
// identity on its own.
async function upsertClerkUser(userId, username, imageUrl) {
  await pool.query(
    `INSERT INTO users (id, username, image_url) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET username = $2, image_url = $3`,
    [userId, username, imageUrl]
  );
}

// Anon tokens are `${userId}.${secret}` (2 dot-segments); Clerk session
// tokens are JWTs (always 3). That's enough to tell the two auth modes
// apart without a separate flag on the wire.
async function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  if (token.split('.').length === 3) {
    if (!clerkEnabled) return res.status(401).json({ error: 'Unauthorized' });
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    req.userId = userId;
    return next();
  }
  const [userId, secret] = token.split('.');
  if (!userId || !secret) return res.status(401).json({ error: 'Unauthorized' });
  const ok = await verifyIdentity(userId, secret);
  if (!ok) return res.status(403).json({ error: 'Forbidden' });
  req.userId = userId;
  next();
}

// REST: POST /upload
app.post('/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image' });
  res.json({ url: req.file.path });
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
      ) END) AS dm_with_image,
      (CASE WHEN r.is_dm THEN (
        SELECT u.id FROM room_members rm JOIN users u ON u.id = rm.user_id
        WHERE rm.room_id = r.id AND rm.user_id != $1 LIMIT 1
      ) END) AS dm_with_id
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

// Keep in sync with the keys of COLOR_SCHEMES in client/src/colorSchemes.ts —
// there's no shared-types package between client and server in this repo.
const VALID_COLOR_SCHEMES = new Set(['slate', 'mint', 'sunset', 'ocean', 'rose', 'citrus']);

function sanitizeCustomFields(input) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 3)
    .map((f) => ({
      label: String(f?.label ?? '').trim().slice(0, 30),
      value: String(f?.value ?? '').trim().slice(0, 60),
    }))
    .filter((f) => f.label || f.value);
}

async function getMessageStats(userId) {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM messages WHERE user_id = $1) AS user_count,
       (SELECT COUNT(*) FROM messages) AS total_count`,
    [userId]
  );
  const userCount = Number(rows[0].user_count);
  const totalCount = Number(rows[0].total_count);
  return {
    messageCount: userCount,
    messagePercent: totalCount > 0 ? Math.round((userCount / totalCount) * 1000) / 10 : 0,
  };
}

// REST: GET /api/me — get current user's profile
app.get('/api/me', requireAuth, async (req, res) => {
  const result = await pool.query(
    'SELECT id, username, image_url, bio, status, color_scheme, custom_fields FROM users WHERE id = $1',
    [req.userId]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
  const stats = await getMessageStats(req.userId);
  res.json({ ...result.rows[0], ...stats });
});

// REST: PATCH /api/me — update bio, status, color scheme, and/or custom fields
app.patch('/api/me', requireAuth, async (req, res) => {
  const bio = 'bio' in req.body ? (req.body.bio?.trim() || null) : undefined;
  const status = 'status' in req.body ? (req.body.status?.trim() || null) : undefined;
  // Unknown scheme keys are silently ignored (no update), not rejected --
  // only an explicit falsy value actually clears it.
  let colorScheme;
  if ('color_scheme' in req.body) {
    if (!req.body.color_scheme) colorScheme = null;
    else if (VALID_COLOR_SCHEMES.has(req.body.color_scheme)) colorScheme = req.body.color_scheme;
  }
  const customFields = 'custom_fields' in req.body ? sanitizeCustomFields(req.body.custom_fields) : undefined;
  const updates = [];
  const values = [];
  let i = 1;
  if (bio !== undefined) { updates.push(`bio = $${i++}`); values.push(bio); }
  if (status !== undefined) { updates.push(`status = $${i++}`); values.push(status); }
  if (colorScheme !== undefined) { updates.push(`color_scheme = $${i++}`); values.push(colorScheme); }
  if (customFields !== undefined) { updates.push(`custom_fields = $${i++}`); values.push(JSON.stringify(customFields)); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  values.push(req.userId);
  const result = await pool.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, username, image_url, bio, status, color_scheme, custom_fields`,
    values
  );
  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
  const stats = await getMessageStats(req.userId);
  res.json({ ...result.rows[0], ...stats });
});

// REST: GET /api/users/:id — fetch another user's public profile
app.get('/api/users/:id', requireAuth, async (req, res) => {
  const result = await pool.query(
    'SELECT id, username, image_url, bio, status, color_scheme, custom_fields FROM users WHERE id = $1',
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
  const stats = await getMessageStats(req.params.id);
  res.json({ ...result.rows[0], ...stats });
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
      u.username AS dm_with, u.image_url AS dm_with_image, u.id AS dm_with_id
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

  const existing = await pool.query('SELECT reactions, room_id FROM messages WHERE id = $1', [msgId]);
  if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });
  const roomId = existing.rows[0].room_id;

  const roomRow = await pool.query('SELECT is_dm, is_group FROM rooms WHERE id = $1', [roomId]);
  if (roomRow.rows[0]?.is_dm || roomRow.rows[0]?.is_group) {
    const member = await pool.query(
      'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2',
      [roomId, userId]
    );
    if (!member.rows.length) return res.status(403).json({ error: 'Forbidden' });
  }

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
  io.to(`room:${roomId}`).emit('reaction_updated', { roomId, messageId: parseInt(msgId), reactions });
  res.json({ reactions });
});

// Fixed-window rate limit backed by redis (INCR + EXPIRE) -- covers the
// socket.io paths, which never pass through Express's middleware chain
// (and therefore the express-rate-limit instance above) since socket.io
// attaches directly to the raw http.Server ahead of Express's router.
async function checkRateLimit(key, limit, windowSeconds) {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds);
  return count <= limit;
}

// Socket.io
io.use(async (socket, next) => {
  const ip = socket.handshake.address || 'unknown';
  const withinLimit = await checkRateLimit(`ratelimit:connect:${ip}`, 30, 60).catch(() => true);
  if (!withinLimit) return next(new Error('Too many connection attempts'));

  const { token, username, imageUrl } = socket.handshake.auth;
  if (!token) return next(new Error('No identity'));
  if (token.split('.').length === 3) {
    if (!clerkEnabled) return next(new Error('Clerk not configured'));
    try {
      const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
      await upsertClerkUser(payload.sub, username, imageUrl).catch(() => {});
      socket.userId = payload.sub;
      socket.username = username;
    } catch {
      return next(new Error('Identity mismatch'));
    }
    return next();
  }
  const [userId, secret] = token.split('.');
  if (!userId || !secret) return next(new Error('No identity'));
  const ok = await verifyIdentity(userId, secret, username).catch(() => false);
  if (!ok) return next(new Error('Identity mismatch'));
  socket.userId = userId;
  socket.username = username;
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
      const withinLimit = await checkRateLimit(`ratelimit:msg:${socket.userId}`, 15, 10).catch(() => true);
      if (!withinLimit) return ack?.({ error: 'Sending too fast, slow down' });
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
