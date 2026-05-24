# chatapp — claude context

this is a real-time chat app with a windows xp aesthetic. read this entire file before doing anything.

---

## how to work in this repo

- **always read the relevant files before editing them** — don't guess at structure
- **always work on a feature branch**, never commit directly to main
- **before starting any task**: check what files are involved, read them, then make a plan
- **after making changes**: make sure the app still runs — start both server and client and verify nothing is broken
- **if adding a new backend route**: it needs `requireAuth` middleware, follow the pattern in `server/index.js`
- **if adding a new socket event**: add the server handler in `server/index.js` and the client listener in `App.jsx`
- **if adding new persistent data**: update `migrate.js` with the new table/column, tell the user to run `npm run migrate`
- **if adding new client state**: add it to `store.js` with a proper action, don't use local component state for shared data
- **never put socket listeners inside child components** — keep them in `App.jsx`
- **never do `|| []` inside a zustand selector** — see state management section below
- **check both terminals for errors** — backend errors show in the server terminal, frontend errors in the browser console
- when in doubt about a design decision, ask before implementing

---

## stack

| layer | tech |
|-------|------|
| frontend | react 19 + vite, zustand, socket.io-client, tailwind, clerk-react |
| backend | node.js + express 5, socket.io, @clerk/express |
| database | postgresql (pg) |
| realtime presence | redis (ioredis) |
| auth | clerk |

---

## repo structure

```
chatapp/
├── server/
│   ├── index.js      ← entire backend: REST routes + socket.io events
│   ├── db.js         ← postgres pool (uses DATABASE_URL)
│   ├── redis.js      ← redis client (uses REDIS_URL)
│   └── migrate.js    ← creates tables (run once: npm run migrate)
│
└── client/
    └── src/
        ├── App.jsx         ← root: auth, socket init, top-level socket listeners
        ├── Sidebar.jsx     ← room list + create room
        ├── ChatPanel.jsx   ← chat window, message list, input, typing indicator
                ├── Message.jsx     ← single message row, reactions, emoji picker
        ├── store.js        ← zustand store (rooms, messages, typingUsers, activeRoomId)
        ├── socket.js       ← socket.io client, connectSocket / getSocket helpers
        ├── notification.js ← web audio api ding sound on new message
        └── Clock.jsx       ← taskbar clock
```

---

## running locally

two terminals required:

```bash
# terminal 1 — backend (auto-reloads on .js changes, NOT on .env changes)
cd server && npm run dev

# terminal 2 — frontend (hot reloads automatically)
cd client && npm run dev
```

frontend default: http://localhost:5173 (may shift to 5174, 5175, etc. if port is taken)
backend always: http://localhost:3001

### required env files

**server/.env**
```
PORT=3001
DATABASE_URL=postgresql://<your_mac_username>@localhost:5432/chatapp
REDIS_URL=redis://localhost:6379
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
CLIENT_URL=http://localhost:5173
```

**client/.env**
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_SERVER_URL=http://localhost:3001
```

important: `CLIENT_URL` and `VITE_SERVER_URL` must have NO trailing slash or cors will break.

if the frontend starts on a different port (e.g. 5174), update `CLIENT_URL` in `server/.env` and restart the server manually (ctrl+c → npm run dev).

### local services
```bash
brew services start redis
brew services start postgresql@15
```

### first time database setup
```bash
createdb chatapp
cd server && npm run migrate
```

---

## architecture notes

### auth flow
- clerk handles all auth on the frontend
- the frontend gets a session token via `getToken()` and passes it as `Authorization: Bearer <token>` on every http request and in the socket handshake
- the server uses `clerkMiddleware()` + `getAuth(req)` to verify requests
- **both** `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` are required in `server/.env` — missing the publishable key causes a 500 on every request

### real-time architecture
- socket.io is used for: new messages, typing indicators, presence (who's in a room), room creation
- REST (fetch) is used for: loading rooms on init, loading message history when joining a room, posting reactions
- redis stores typing state (`room:{id}:typing:{userId}` with 5s TTL) and room presence (`room:{id}:members` as a set)
- typing state auto-expires in redis after 5s as a safety net

### state management
zustand store in `store.js`. selectors that return new object/array references on every call (e.g. `s.messages[roomId] || []`) cause infinite render loops — always do the fallback OUTSIDE the selector:
```js
// correct
const messages = useStore((s) => s.messages[roomId]) ?? [];
// wrong — creates new [] reference on every snapshot check
const messages = useStore((s) => s.messages[roomId] || []);
```

### database schema
```sql
users     (id TEXT PK, username TEXT, image_url TEXT, created_at TIMESTAMPTZ)
rooms     (id SERIAL PK, name TEXT UNIQUE, created_by TEXT → users.id, created_at TIMESTAMPTZ)
messages  (id SERIAL PK, room_id INT → rooms.id, user_id TEXT → users.id,
           username TEXT, content TEXT, reactions JSONB DEFAULT '{}', created_at TIMESTAMPTZ)
```

reactions are stored as `{ "👍": ["userId1", "userId2"], "❤️": ["userId1"] }` in jsonb.

---

## known gotchas

- **server doesn't reload on .env changes** — must restart manually after editing .env
- **cors breaks with trailing slash** — `CLIENT_URL=https://example.com/` fails, must be `https://example.com`
- **clerk needs both keys on the server** — `CLERK_SECRET_KEY` alone is not enough, `CLERK_PUBLISHABLE_KEY` also required
- **typing indicator filter uses username not userId** — `typingUsers` array contains usernames (strings), not clerk user ids. filter with `currentUsername` prop
- **consecutive messages** — `Message.jsx` receives `prevMsg` prop and skips rendering the username/time header if `prevMsg.user_id === msg.user_id`
- **port conflicts** — if server won't start, run `lsof -ti :3001 | xargs kill`

---

## conventions

- always work on a feature branch, never commit directly to main
- server is commonjs (`require`), client is esm (`import`)
- no comments unless the why is genuinely non-obvious
- don't add abstractions for things that only happen once
- keep socket event handlers in `App.jsx` (top level), not in child components
- keep all zustand state mutations in `store.js` actions, not inline in components

---

## deployment

- **backend** → railway (root directory set to `server/`)
- **frontend** → vercel (root directory set to `client/`)
- railway auto-provides `DATABASE_URL` and `REDIS_URL` if you add postgres/redis plugins
- after deploying, run `node migrate.js` once from the railway shell
- update `CLIENT_URL` on railway to match the vercel url (no trailing slash)
- update `VITE_SERVER_URL` on vercel to match the railway url (no trailing slash)
