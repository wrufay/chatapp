# chatapp

Real-time chat with a Windows XP aesthetic. React + Vite frontend, Node/Express + Socket.io backend, PostgreSQL, Redis, Clerk auth.

## Prerequisites

- Node 18+
- PostgreSQL running locally (or a connection string)
- Redis running locally (`redis-server`)
- A [Clerk](https://clerk.com) account

---

## Server setup

```bash
cd server
cp .env.example .env
# fill in DATABASE_URL, REDIS_URL, CLERK_SECRET_KEY
npm install
npm run migrate   # creates tables
npm run dev       # starts on port 3001
```

### server/.env fields

| Key | Description |
|-----|-------------|
| `PORT` | HTTP port (default 3001) |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string (default redis://localhost:6379) |
| `CLERK_SECRET_KEY` | From Clerk dashboard → API Keys |
| `CLIENT_URL` | Frontend origin for CORS (default http://localhost:5173) |

---

## Client setup

```bash
cd client
cp .env.example .env
# fill in VITE_CLERK_PUBLISHABLE_KEY
npm install
npm run dev       # starts on port 5173
```

### client/.env fields

| Key | Description |
|-----|-------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | From Clerk dashboard → API Keys |
| `VITE_SERVER_URL` | Backend URL (default http://localhost:3001) |

---

## Clerk configuration

1. Create an application at [clerk.com](https://clerk.com)
2. Copy the **Publishable Key** → `client/.env`
3. Copy the **Secret Key** → `server/.env`
4. In Clerk dashboard → **JWT Templates** is not needed — we use the default session token
5. In Clerk dashboard → **Paths**, make sure the sign-in/sign-up redirect URLs match your frontend origin

---

## Features

- Room list + create rooms
- Real-time messaging via Socket.io
- Typing indicators (Redis-backed, auto-expire in 5s)
- Message reactions (6 emoji, toggle on/off, stored in JSONB)
- Presence tracking per room
- Clerk authentication (sign up / sign in)
- Windows XP aesthetic — chrome titlebars, beveled borders, Tahoma font

---

## Database schema

```sql
users     (id TEXT PK, username, image_url, created_at)
rooms     (id SERIAL PK, name UNIQUE, created_by, created_at)
messages  (id SERIAL PK, room_id, user_id, username, content, reactions JSONB, created_at)
```
