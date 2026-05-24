# hey, welcome to the codebase 👋

## tldr

- install node, postgres, redis, and make a clerk account
- copy `.env.example` to `.env` in both `server/` and `client/` and fill them in
- `createdb chatapp` then `cd server && npm run migrate`
- run `cd server && npm run dev` in one terminal, `cd client && npm run dev` in another
- open `http://localhost:5173` in your browser
- **always work on a branch**, never commit to main directly
- to test multiple users: open chrome + firefox, or normal + incognito window
- if something's broken: check both terminals first, the error is almost always printed there
- don't be scared of errors, they're normal 🙂

---

ok so fay asked me to write this for you. don't be scared — this is a pretty normal full-stack app and once you get it running locally everything will make sense. errors are normal, debugging is normal, you're not doing anything wrong if things break. just read the error message carefully and 90% of the time it tells you exactly what's wrong.

let's get you set up.

---

## what this app actually is

it's a real-time chat app that looks like windows xp lol. here's the stack:

- **frontend** — react + vite (the client/ folder). this is what your friends see in the browser.
- **backend** — node.js + express + socket.io (the server/ folder). handles messages, rooms, auth, etc.
- **postgres** — stores users, rooms, and messages permanently
- **redis** — stores who's online and who's typing (temporary stuff)
- **clerk** — handles all the login / signup stuff so we don't have to build it ourselves

the frontend and backend are two completely separate apps. they talk to each other over http (for fetching rooms/messages) and websockets (for real-time stuff like new messages and typing indicators).

---

## before you start — install these

you need all of these on your computer:

**node.js** (v18 or higher)
- check if you have it: `node --version`
- if not, download from nodejs.org

**homebrew** (mac package manager, you probably have it)
- check: `brew --version`
- if not: go to brew.sh and follow the one-liner install

**postgresql**
- check: `psql --version`
- install: `brew install postgresql@15`
- start it: `brew services start postgresql@15`

**redis**
- check: `redis-server --version`
- install: `brew install redis`
- start it: `brew services start redis`

**a clerk account**
- go to clerk.com and make a free account
- create an application (call it whatever)
- you'll need the publishable key and secret key from the dashboard → api keys

---

## getting the code

```bash
git clone <repo url>
cd chatapp
```

---

## setting up your .env files

there are TWO separate .env files you need. one for the server, one for the client.

### server/.env

```bash
cd server
cp .env.example .env
```

open `server/.env` and fill it in:

```
PORT=3001
DATABASE_URL=postgresql://YOUR_MAC_USERNAME@localhost:5432/chatapp
REDIS_URL=redis://localhost:6379
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
CLIENT_URL=http://localhost:5173
```

to find your mac username: open terminal and type `whoami`

for `DATABASE_URL` — if your username is `jackson` it would be:
`postgresql://jackson@localhost:5432/chatapp`

no password needed if you installed postgres fresh with homebrew.

### client/.env

```bash
cd client
cp .env.example .env
```

open `client/.env`:

```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_SERVER_URL=http://localhost:3001
```

both keys come from your clerk dashboard.

---

## setting up the database

you need to create the database and run the migration (which creates the tables).

```bash
# create the database
createdb chatapp

# run the migration
cd server
npm install
npm run migrate
```

you should see `Migration complete`. if you see `database "chatapp" already exists` that's fine, just run the migration.

---

## running the app

you need TWO terminal windows open at the same time.

**terminal 1 — backend:**
```bash
cd server
npm run dev
```
you should see `Server running on 3001`

**terminal 2 — frontend:**
```bash
cd client
npm install
npm run dev
```
you should see something like `Local: http://localhost:5173`

open that url in your browser, sign up, and you're in.

---

## how the codebase is structured

```
chatapp/
├── server/
│   ├── index.js      ← the whole backend (routes + socket events)
│   ├── db.js         ← postgres connection
│   ├── redis.js      ← redis connection
│   └── migrate.js    ← creates the database tables
│
└── client/
    └── src/
        ├── App.jsx         ← main component, handles auth + socket setup
        ├── Sidebar.jsx     ← room list on the left
        ├── ChatPanel.jsx   ← the chat window on the right
        ├── Message.jsx     ← individual message component
        ├── store.js        ← global state (zustand)
        ├── socket.js       ← socket.io client setup
        ├── notification.js ← plays the ding sound
        └── Clock.jsx       ← the clock in the taskbar
```

### how state works

the app uses **zustand** for global state (think of it like a shared variable store that any component can read from). the store lives in `store.js` and holds:
- `rooms` — list of all rooms
- `messages` — messages per room, keyed by room id
- `typingUsers` — who's typing per room
- `activeRoomId` — which room you're currently in

### how real-time works

when you open the app, `App.jsx` connects to the server via socket.io. then:
- when someone sends a message → server emits `new_message` → client adds it to the store
- when someone types → server emits `typing_update` → client shows the indicator
- when a room is created → server emits `room_created` → client adds it to the sidebar

---

## making changes — work on a branch

**never commit directly to main.** always make a branch:

```bash
git checkout -b your-feature-name
```

make your changes, then to test them locally just run the app like normal (the two terminal windows thing above). your branch runs exactly the same as main, just with your changes.

when you're done:
```bash
git add .
git commit -m "what you did"
git push origin your-feature-name
```

then open a pull request on github so fay can review it before it goes to main.

---

## debugging — don't panic

errors are normal. here's how to read them:

**backend errors** show up in terminal 1 (where you ran `npm run dev` in the server folder). read the first line of the error — it usually tells you exactly what went wrong.

**frontend errors** show up in the browser console (right click → inspect → console tab). red errors are bad, yellow warnings are usually fine to ignore.

### common errors and fixes

**`EADDRINUSE: address already in use :::3001`**
something is already running on port 3001. kill it:
```bash
lsof -ti :3001 | xargs kill
```
then run `npm run dev` again.

**`database "chatapp" does not exist`**
run `createdb chatapp` then `npm run migrate` again.

**`ECONNREFUSED` (redis errors)**
redis isn't running. run `brew services start redis`.

**`Publishable key is missing`**
your `server/.env` is missing `CLERK_PUBLISHABLE_KEY`. make sure both the secret key AND publishable key are in there.

**CORS errors in the browser**
the `CLIENT_URL` in `server/.env` doesn't match where your frontend is actually running. check what port vite says (it'll say `Local: http://localhost:XXXX`) and make sure `CLIENT_URL` matches exactly, no trailing slash.

**`SyntaxError: Unexpected token '<'`**
the server is returning an html error page instead of json. this means the server crashed. check terminal 1 for the actual error.

**changes not showing up**
- backend: it auto-reloads with `--watch`, but `.env` changes require a manual restart (ctrl+c then `npm run dev`)
- frontend: vite hot-reloads automatically, but sometimes you need to hard refresh the browser (cmd+shift+r)

**general rule:** if something is broken, check both terminals first. the error is almost always printed there.

---

## adding a new feature — how to think about it

1. **is it frontend only?** (like changing how something looks, adding a button) → just edit files in `client/src/`
2. **does it need new data from the server?** → you'll need a new route in `server/index.js` AND update the frontend to call it
3. **does it need to be real-time?** → add a new socket event in `server/index.js` and listen for it in `App.jsx`
4. **does it need to store new data?** → add it to the database schema in `migrate.js`, then run `npm run migrate` again

---

## tips for prompting claude

claude is great at this kind of stuff but you gotta be specific. here's what works:

**be specific about what file and what you want:**
> "in client/src/ChatPanel.jsx, add a button next to each message that lets you copy the message text to clipboard"

**give context about what already exists:**
> "we're using zustand for state (store.js) and socket.io for real-time. i want to add unread message counts to the sidebar"

**if something is broken, paste the actual error:**
> don't say "it's not working". paste the exact error message from the terminal or browser console. claude will know what it means.

**ask claude to explain before it codes:**
> "before you write any code, explain how you'd approach adding direct messages to this app"

**if claude's solution breaks something:**
> "that broke X, here's the new error: [paste error]. what went wrong?"

you don't need to understand every line of code to contribute — just have a clear idea of what you want to build and be specific about it.

---

## quick reference

| command | what it does |
|---------|-------------|
| `npm run dev` (in server/) | start the backend |
| `npm run dev` (in client/) | start the frontend |
| `npm run migrate` (in server/) | create/update database tables |
| `brew services start redis` | start redis |
| `brew services start postgresql@15` | start postgres |
| `lsof -ti :3001 \| xargs kill` | kill whatever is on port 3001 |
| `git checkout -b feature-name` | make a new branch |

---

---

## testing with multiple users locally

you don't need multiple computers — just use different browser contexts so clerk treats them as separate sessions:

- **chrome + firefox** at the same time — easiest, sign into different accounts in each
- **normal window + incognito** — two sessions in the same browser
- **two incognito windows** — if you need 3+ users

all of them should point to `http://localhost:5173`. they'll all hit the same local backend so you can see messages, typing indicators, and presence all working in real time.

---

## deploying your changes

once your branch gets merged into main, fay will deploy. but if you want to test a deployment yourself here's how it works.

### the setup

- **backend** lives on [railway](https://railway.app) — it runs the server/ folder
- **frontend** lives on [vercel](https://vercel.com) — it runs the client/ folder
- they talk to each other over the internet just like they do locally, just with real urls instead of localhost

### railway (backend)

the backend is deployed as a railway service with root directory set to `server/`. 

env vars you need to set in railway (under your service → variables):
```
CLERK_SECRET_KEY=...
CLERK_PUBLISHABLE_KEY=...
CLIENT_URL=https://your-frontend.vercel.app     ← no trailing slash!
PORT=3001
```
`DATABASE_URL` and `REDIS_URL` are auto-filled if you add the postgres and redis plugins from the railway dashboard.

**gotchas:**
- if you change env vars, you need to redeploy (railway doesn't auto-restart on var changes)
- after first deploy, open a shell in railway and run `node migrate.js` to create the tables
- if you see 500 errors, check the railway logs — same as checking your terminal locally

### vercel (frontend)

the frontend is deployed as a vercel project with root directory set to `client/`.

env vars to set in vercel (under your project → settings → environment variables):
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_SERVER_URL=https://your-backend.railway.app    ← no trailing slash!
```

**gotchas:**
- vercel rebuilds automatically when main is updated, but NOT when you change env vars — you need to trigger a manual redeploy after changing vars
- if you change `VITE_SERVER_URL`, redeploy the frontend
- if you change `CLIENT_URL` on railway, redeploy the backend

### the trailing slash rule

this one will bite you. cors breaks if there's a trailing slash anywhere:

```
✅ https://chatapp-kappa-puce.vercel.app
❌ https://chatapp-kappa-puce.vercel.app/
```

check both `CLIENT_URL` (railway) and `VITE_SERVER_URL` (vercel) every time you update them.

### if your deployment is broken but local works

9 times out of 10 it's one of these:
1. env var is wrong or missing — double check spelling, no trailing slashes
2. forgot to redeploy after changing an env var
3. migration hasn't been run on the production database yet
4. `CLIENT_URL` on railway doesn't match the actual vercel url

---

good luck and have fun!! don't be scared of errors, they're just the computer telling you what it needs 🙂
