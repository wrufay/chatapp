# chatapp

a real-time chat app with a windows xp aesthetic. react + vite on the frontend, node/express + socket.io on the backend, postgres for storage, redis for presence/typing, and clerk for auth.

## what you need

- node 18+
- postgres running locally, or a connection string (recommended for deploys: [neon](https://neon.tech) - free tier, scales to zero when idle)
- redis running locally (`redis-server`), or a connection string (recommended for deploys: [upstash](https://upstash.com) - free tier, pay-per-request)
- a [clerk](https://clerk.com) account

---

## server setup

```bash
cd server
cp .env.example .env
# fill in DATABASE_URL, REDIS_URL, CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY
npm install
npm run migrate   # creates tables
npm run dev       # starts on port 3001
```

### server/.env

| key | what it's for |
|-----|---------------|
| `PORT` | http port (default 3001) |
| `DATABASE_URL` | postgres connection string |
| `REDIS_URL` | redis connection string (default redis://localhost:6379) |
| `CLERK_SECRET_KEY` | from clerk dashboard → api keys |
| `CLERK_PUBLISHABLE_KEY` | from clerk dashboard → api keys |
| `CLIENT_URL` | your frontend url, used for cors (no trailing slash) |

---

## hosting: neon (postgres) + upstash (redis)

Railway bills for uptime even when the app is idle, which is overkill for a
portfolio-scale demo. Neon and Upstash are usage-based and both have a free
tier that comfortably covers demo traffic. Neither requires a code change —
`DATABASE_URL` and `REDIS_URL` work exactly the same way, you're just
pointing them at a different provider.

**Postgres → Neon**

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the connection string from the dashboard — prefer the **pooled**
   one (hostname contains `-pooler`). This app runs a long-lived socket.io
   process that can hold several concurrent DB queries at once, and Neon's
   free-tier *direct* connection limit is low; the pooled endpoint (PgBouncer)
   avoids "too many connections" errors.
3. Paste it into `server/.env` as `DATABASE_URL`. It already includes
   `?sslmode=require` — `server/db.js` detects that and enables SSL
   automatically, so nothing else to change.
4. Run `npm run migrate` (from `server/`) once, against the new database, to
   create the tables.
5. Note: Neon's free tier scales the compute to zero after a period of
   inactivity. The first query after idling pays a cold-start (~ up to a
   second or few) before the connection is ready — fine for a demo, just
   don't expect Railway-like always-warm latency on the first request.

**Redis → Upstash**

1. Create a Redis database at [upstash.com](https://upstash.com).
2. This app only does plain key/value and set operations (`get`, `set` with
   `EX`, `sadd`, `smembers`, `srem`, `del`, `keys`) for presence and typing
   indicators — no pub/sub, no blocking commands. That means Upstash's
   **TCP endpoint** (ioredis-compatible, `rediss://...`) is a drop-in swap;
   use that connection string, not the REST URL/token pair.
3. Paste it into `server/.env` as `REDIS_URL`. `server/redis.js` already
   works with `rediss://` URLs (ioredis auto-enables TLS for that scheme).
4. Free-tier plans cap monthly commands and concurrent connections — check
   Upstash's current limits if you expect more than light demo traffic.

Railway's `DATABASE_URL`/`REDIS_URL` still work unchanged if you don't swap
them — this is a drop-in provider change, not a required migration.

---

## client setup

```bash
cd client
cp .env.example .env
# fill in VITE_CLERK_PUBLISHABLE_KEY and VITE_SERVER_URL
npm install
npm run dev       # starts on port 5173
```

### client/.env

| key | what it's for |
|-----|---------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | from clerk dashboard → api keys |
| `VITE_SERVER_URL` | your backend url (no trailing slash) |

---

## clerk setup

1. create an app at [clerk.com](https://clerk.com)
2. copy the **publishable key** → `client/.env`
3. copy the **secret key** → `server/.env`
4. if deploying, make sure `CLIENT_URL` on the server matches your frontend url exactly (no trailing slash)

---

## features

- create rooms + real-time messaging via socket.io
- typing indicators (redis-backed, expire after 5s)
- message reactions (toggle on/off, stored in jsonb)
- presence tracking per room
- clerk auth (sign up / sign in)
- windows xp aesthetic — titlebars, beveled borders, tahoma font

---

## bug fixes

- [x] cors trailing slash causing socket.io to fail on deploy
- [x] zustand selector returning new array ref on every render causing infinite loop in chatpanel

---

## todos

- [ ] direct messages
- [ ] file/image uploads
- [ ] message editing + deletion
- [ ] user profiles
- [ ] notifications

---

## database schema

```sql
users     (id TEXT PK, username, image_url, created_at)
rooms     (id SERIAL PK, name UNIQUE, created_by, created_at)
messages  (id SERIAL PK, room_id, user_id, username, content, reactions JSONB, created_at)
```