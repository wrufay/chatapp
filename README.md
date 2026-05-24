# chatapp

a real-time chat app with a windows xp aesthetic. react + vite on the frontend, node/express + socket.io on the backend, postgres for storage, redis for presence/typing, and clerk for auth.

## what you need

- node 18+
- postgres running locally (or a connection string)
- redis running locally (`redis-server`)
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