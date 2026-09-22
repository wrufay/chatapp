# Chat App — Agent Instructions

## What We're Building

Adding user profiles to an existing real-time chat app. Read `CLAUDE.md` fully before touching any file — it contains critical conventions, gotchas, and the full stack/architecture.

## Tech Stack

- Frontend: React 19 + Vite, Zustand, Socket.io-client, Tailwind, Clerk
- Backend: Node.js + Express 5, Socket.io, @clerk/express
- Database: PostgreSQL (pg)
- Realtime presence: Redis (ioredis)
- Auth: Clerk

## Project Structure

```
chatapp/
├── server/
│   ├── index.js      ← entire backend: REST routes + socket.io events
│   ├── db.js         ← postgres pool
│   ├── redis.js      ← redis client
│   └── migrate.js    ← creates/alters tables
└── client/src/
    ├── App.jsx        ← root, socket listeners
    ├── Sidebar.jsx    ← room list
    ├── ChatPanel.jsx  ← chat window
    ├── Message.jsx    ← single message row
    ├── store.js       ← zustand store
    └── socket.js      ← socket.io client
```

## Critical Rules

- Every backend route needs `requireAuth` middleware
- New DB columns go in `migrate.js` — note in CHANGELOG that user must run `npm run migrate`
- New frontend state goes in `store.js`
- Socket listeners stay in `App.jsx` only
- Never use `|| []` inside a zustand selector (causes infinite renders)
- Server is CommonJS (`require`), client is ESM (`import`)

## Verification

After each ticket:
```bash
cd server && node -e "require('./index.js')" 2>&1 | head -5
cd client && npm run build
```
