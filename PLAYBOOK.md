# chatapp — technical playbook

A guided tour of how this app actually works, written to teach the reasoning
behind the code, not just describe it. Each section explains a real system-design
concept using this codebase as the example, then tells you honestly where the
current implementation is solid and where it would break under real load.
There's a prioritized improvement backlog at the end — treat it as a punch
list for leveling this up, and as talking points if you ever have to explain
this project's architecture out loud.

This doc will drift out of date as you change the code, same as `README.md`
did before this session. Treat that as expected, not a failure — update it
when you touch something it describes, the same way you'd update a comment
next to code you just changed.

---

## 1. The one-paragraph mental model

```
                    ┌─────────────┐
        REST (load) │   Express   │──────┐
   ┌───────────────▶│   :3001     │      │
   │                └──────┬──────┘      ▼
┌──────────┐               │        ┌─────────┐
│  React    │◀──────────────┘        │Postgres │ durable data
│  client   │  socket.io (live)      │ (Neon)  │ (users, rooms, messages)
└──────────┘◀──────────────┬────────▶└─────────┘
                            │
                            ▼
                       ┌─────────┐
                       │  Redis  │ ephemeral data
                       │(Upstash)│ (presence, typing, rate limits)
                       └─────────┘
                            ▲
                       ┌────┴────┐
                       │  Clerk  │ optional identity provider (Google)
                       └─────────┘
```

One server process (`server/index.js`) does two jobs on the same port: it's
an Express REST API *and* a socket.io server, sharing one `http.Server`
(`server/index.js:36-38`). REST is for "give me everything" (initial room
list, message history). Sockets are for "tell me what just changed"
(new messages, typing, presence). That split is the core architectural
pattern every real chat app uses — Slack, Discord, Messenger all do a
REST/GraphQL fetch for history + a WebSocket for live deltas, for exactly
the same reason: a WebSocket is bad at "fetch me 200 rows once," and REST
is bad at "push me an event the instant it happens."

---

## 2. Three kinds of state, three storage decisions

The single most important system-design idea in this app, and the one most
worth internalizing: **not all state deserves the same storage.** This
codebase makes three different calls, and the reasoning behind each is the
actual lesson:

| State | Where it lives | Why |
|---|---|---|
| Messages, rooms, users, reactions | **Postgres** | Must survive a server restart. Needs relational integrity (a message belongs to exactly one room, one user). Read patterns benefit from SQL joins. |
| Presence, typing indicators, rate-limit counters | **Redis, with TTLs** | Correctness *doesn't matter if it's lost* — if Redis restarts, worst case someone's typing indicator flickers off for a second. Needs to be fast and shared across server instances (a fact that matters more once you have >1 server — see §7). |
| Active room, unread counts, draft message text | **Zustand (client memory)** | Only relevant to *this browser tab, right now*. Never needs to leave the client, never needs to be durable. |

Notice the tell: every Redis key in this app has either an explicit `EX`
(`server/index.js:612`, typing keys expire after 5s) or gets deleted on
disconnect (`server/index.js:625-626`). That's not an accident — it's the
signature of "this is a cache of ephemeral truth, not a source of truth."
If you ever reach for Redis and can't answer "what happens if this key just
vanishes," that's usually a sign the data belongs in Postgres instead.

---

## 3. Auth: two identity providers, one contract

This app supports both an account-free "anon nickname" flow and Clerk
("Sign in with Google"). Making both providers produce the *same shape* on
the server is the actual engineering trick here.

**Anon tokens** are just `${userId}.${secret}` — a random UUID plus a
random secret, both generated client-side and stashed in `localStorage`
(`client/src/identity.ts:10-30`). There's no password, no email. The only
thing the server checks is "does this secret match what we saw the first
time we heard this userId" (`server/index.js:64-81`):

```js
const { rows } = await pool.query(
  `INSERT INTO users (id, username, secret) VALUES ($1, $2, $3)
   ON CONFLICT (id) DO UPDATE SET id = users.id
   RETURNING secret, (xmax = 0) AS inserted`,
  [userId, username || 'anon', secret]
);
```

That `INSERT ... ON CONFLICT DO UPDATE SET id = users.id` is a no-op update
disguised as an upsert, purely so Postgres will report back whether this
row was just inserted (`xmax = 0`) or already existed. This is doing real
work: two requests for a brand-new `userId` (e.g. the socket handshake and
the `/rooms` fetch, which both fire in `App.tsx`'s effect at nearly the same
moment) used to **race** — a naive "check if exists, then insert" would let
both requests see "doesn't exist" and both try to `INSERT`, and the second
one crashes on the primary key. The atomic upsert makes the database itself
resolve the race, instead of trying to coordinate it in application code.
**This is the general fix for check-then-act races: push the check into the
database's atomic operation instead of doing it in two round-trips from the
app.**

**Clerk tokens** are JWTs verified against Clerk's servers
(`server/index.js:508`, `verifyToken`). Different verification path
entirely — but both paths funnel into the same `req.userId` /
`socket.userId`, so every route and socket handler downstream *never has to
know or care* which identity system authenticated this request. That
normalization boundary is the actual architecture lesson: **the one place
that knows about the two auth systems is `parseAuthToken`
(`server/lib/authToken.js`) and the two call sites that branch on
`parsed.mode`; nothing else in the ~500 lines of business logic below it
does.** That's why it was safe to extract `parseAuthToken` into a pure,
unit-tested function (`server/test/authToken.test.js`) — it was already
architecturally isolated, the refactor just made that isolation visible in
the file structure too.

Layered rate limiting is the other auth-adjacent thing worth naming:
Express's own middleware (`server/index.js:51-56`) caps the whole REST API
at 120 req/min/IP, but socket.io attaches directly to the raw `http.Server`
*before* Express's middleware chain runs (a genuinely non-obvious fact about
how socket.io and Express share a port), so socket connections and
`send_message` get their own Redis-backed limiter (`checkRateLimit`,
`server/index.js:490-494`, applied at `:499` and `:580`). Two different
enforcement points for two different transports carrying the same kind of
risk (someone hammering the server) — that's intentional defense in depth,
not duplication.

---

## 4. Tracing one message end to end

The clearest way to actually understand a real-time system is to follow one
event through the whole stack. Here's `send_message`, start to finish:

1. **Client types and hits enter** → `ChatPanel.tsx:206` calls
   `socket.emit('send_message', { roomId, content, replyToId, imageUrl })`.
   Note this is fire-and-forget over the wire, but the client *does* pass an
   `ack` callback (`server/index.js:577`, `(..., ack) =>`) — socket.io
   supports request/response semantics on top of its pub/sub model, and
   this app uses that to let the server say "too fast, slow down"
   (`:581`) or "not a member" (`:589`) back to the *specific sender*,
   without broadcasting anything.
2. **Server validates, in order**: rate limit (`:580`) → room exists
   (`:582-583`) → if it's a DM/group, is this user actually a member
   (`:584-589`). Every check can bail out early via `ack?.({ error })`
   before anything touches the database.
3. **Insert into Postgres** (`:591-594`), then a second query to hydrate
   `reply_to_username`/`reply_to_content` if this was a reply (`:596-602`) —
   a denormalized read-time join, done in application code instead of SQL,
   because it's conditional (only replies need it).
4. **Broadcast to the room**: `io.to(`room:${roomId}`).emit('new_message', msg)`
   (`:603`) — scoped to socket.io's room concept, so only sockets that
   called `join_room` for this specific room receive it. (Contrast this
   with §7 — not every emit in this file is scoped this carefully.)
5. **Every other client's `App.tsx`** has a `socket.on('new_message', ...)`
   listener registered once, at the top level (`App.tsx:104-111`). It calls
   `addMessage(msg)` (a Zustand action), and if the message isn't from you
   and you're not currently looking at that room, `incrementUnread`.
6. **Zustand's `addMessage`** (`store.ts:48-52`) does an immutable append:
   `{ ...s.messages, [msg.room_id]: [...existing, msg] }`. That's not
   stylistic — Zustand (and React) detect changes by reference, not deep
   equality. Mutating the existing array in place would mean React never
   re-renders, because the object reference `s.messages` didn't change.
7. **`ChatPanel`** is subscribed to exactly this room's message slice
   (`ChatPanel.tsx:24`), so it re-renders and the new message appears.

Thirteen words of code (`io.to(room).emit(...)`) hide most of the interesting
system design in this app. Being able to narrate a trace like this for your
own systems — "here's the exact sequence of validate → persist → broadcast →
receive → reconcile local state" — is one of the most senior-sounding things
you can do in an interview, and it costs nothing but reading your own code
closely once.

---

## 5. Database design decisions (and their tradeoffs)

```sql
users        (id TEXT PK, username, image_url, secret, bio, status,
              color_scheme, custom_fields JSONB, created_at)
rooms        (id SERIAL PK, name UNIQUE, created_by, is_dm, is_group, created_at)
room_members (room_id, user_id)          -- join table
messages     (id SERIAL PK, room_id, user_id, username, content, image_url,
              reactions JSONB, reply_to_id, created_at)
```

**`room_members` as a join table, instead of `dm_user_a`/`dm_user_b`
columns on `rooms`**, is the single best schema decision in this app. A
naive first pass at "add DMs" often adds two nullable user-id columns
directly to `rooms`. That works for exactly two people and falls apart the
moment you need groups. Modeling membership as its own table means DMs and
groups are *the same feature* with a different member count — `is_dm` and
`is_group` are just flags for UI labeling, not different data shapes. This
is the general lesson: **when you're tempted to add "one more special-case
column" for a relationship, check whether it's actually a one-to-many or
many-to-many relationship in disguise** — those almost always want their own
table.

**Reactions as a JSONB column** (`{"👍": ["userId1", "userId2"]}`,
`server/lib/reactions.js`) is the opposite tradeoff, made deliberately in
the other direction: a normalized `message_reactions (message_id, user_id,
emoji)` table would let the database enforce "one reaction per emoji per
user" and let you efficiently query "which messages has this user reacted
to" — but you'd pay a join on every message-list read, for a feature
(reactions) that's read far more often than the query "what has user X
reacted to" is ever needed. Denormalizing into JSONB trades query
flexibility for read simplicity, and for this feature that trade is
reasonable **at this app's scale**. It stops being reasonable the moment
you need to answer "did user X react to any message" as a first-class
query, or the moment a single message accumulates thousands of reactors
(then you're rewriting a growing JSON blob on every single toggle).

**The repeated authorization check is duplicated logic worth naming.** This
exact shape —

```js
const roomRow = await pool.query('SELECT is_dm, is_group FROM rooms WHERE id = $1', [roomId]);
if (roomRow.rows[0]?.is_dm || roomRow.rows[0]?.is_group) {
  const member = await pool.query(
    'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, userId]
  );
  if (!member.rows.length) return /* 403 */;
}
```

— appears, with minor variations, in five places: `GET /rooms/:id/members`
(`:373-381`), `GET /rooms/:id/messages` (`:392-400`), the react route
(`:470-477`), the `join_room` socket handler (`:548-555`), and
`send_message` (`:582-589`). It's not *wrong* — each call site genuinely
needs this check, and repeating a security check at every entry point is
often the right call over a single shared gate that's easy to forget to
call. But five copies of the same two queries means a bug fix or a schema
change (e.g. adding a `banned` flag on membership) needs five edits. This is
a good, low-risk refactoring exercise for you: extract it into
`async function assertRoomAccess(roomId, userId)` that throws/returns a
403-shaped result, and call it from all five sites. It's exactly the kind of
"go through it yourself" refactor we talked about — small, safe, and it'll
teach you more about *why* each of those five call sites needed the check
than reading them ever will.

**No pagination on message history** (`GET /rooms/:id/messages`,
`:391-413`) is a real scaling gap, not a nitpick: it always loads the most
recent 200 messages, full stop. That's fine for a demo room with a few
hundred messages ever. It breaks the moment you want "scroll up for older
history" as a feature — `LIMIT 200 OFFSET N` gets slower as `N` grows
(Postgres still has to walk past the skipped rows), and it also
double-counts pages if new messages are inserted while you're scrolling. The
standard fix is **keyset/cursor pagination**: `WHERE created_at < $cursor
ORDER BY created_at DESC LIMIT 50`, using the oldest loaded message's
timestamp as the next cursor. Worth knowing even if you don't build it —
"why don't you use OFFSET for pagination" is a genuinely common systems
interview question, and now you have a live example to point to.

---

## 6. Redis usage — and where `KEYS` will bite you

Two functions, `getTypingUsers` (`server/index.js:634-642`) and
`getRoomReads` (`:525-534`), share a pattern:

```js
const keys = await redis.keys(`room:${roomId}:typing:*`);
for (const key of keys) { const name = await redis.get(key); ... }
```

`KEYS` is the one Redis command every Redis-in-production guide tells you
never to call in a hot path. Redis is single-threaded — while `KEYS` scans
the *entire keyspace* looking for matches, every other client's command
waits. At this app's scale (a handful of rooms, a handful of concurrent
typers) it's invisible. At real scale, with thousands of rooms and typing
keys sharing a keyspace with everything else Redis holds, this single
function call would introduce latency spikes for the whole app, not just
this feature. The fix, when it matters: use a Redis **Hash** instead of N
separate string keys — `HSET room:{id}:typing {userId} {timestamp}`,
`HGETALL room:{id}:typing` to read all of them in one O(1)-ish call, and
prune stale entries by comparing timestamps client-side instead of relying
on per-key TTL (Hash fields can't have individual TTLs). Same fix applies
to read receipts. This is a genuinely good "I found a real scaling
bottleneck and know the standard fix" story to have ready.

The **rate limiter** (`checkRateLimit`, `:490-494`) is a *fixed window*
counter: `INCR` a key, `EXPIRE` it on first increment, compare against a
limit. It's simple and it's *honestly fine* for this app's needs — but the
known weakness is the window-boundary burst: someone could send their limit
right at the end of one window and again right at the start of the next,
getting ~2x the intended rate in a short burst around the boundary. The
production-grade fix is a *sliding window* or *token bucket* algorithm.
Naming this tradeoff out loud (rather than either not knowing about it, or
over-engineering a token bucket you don't need yet) is itself the systems-
thinking skill — "I chose the simple thing, I know its exact weakness, and
I know I'd reach for X if it started mattering" is a stronger answer than
either extreme.

---

## 7. The horizontal-scaling reality check

This is the single most important "real world scalable chat architecture"
fact to internalize about this codebase: **it can only ever run as one
server process, as written.**

Socket.io's `io.to('room:5').emit(...)` only reaches sockets connected to
*this process*. Room membership (`socket.join(...)`) lives in this
process's memory. If you ever ran two instances of this server behind a
load balancer (which you'd want for zero-downtime deploys, or just more
capacity), a message sent by a client connected to instance A would never
reach a client connected to instance B, even if they're in the same room.
The standard, well-known fix is the **socket.io Redis adapter**
(`@socket.io/redis-adapter`): it makes every instance publish room events
to a shared Redis pub/sub channel, and every instance subscribes and
re-emits to its own locally-connected sockets. You already have Redis in
this stack for presence/typing — this is the same infrastructure, doing one
more job. Knowing this fact, and that the fix is "one library, three lines
of setup," not "rearchitect everything," is worth more in an interview than
almost anything else in this document.

Related, smaller finding: `io.emit(...)` (broadcast to *every* connected
socket, not just a room) is used for `room_created` (`:363`), `dm_created`
(`:293`), `group_created` (`:344`), and `group_invited` (`:452`) — contrast
with `new_message`/`reaction_updated`/`message_deleted`, which correctly
scope to `io.to(`room:${roomId}`)`. Right now, every connected client
receives a `dm_created` event for *every* DM created anywhere in the app,
and filters it out client-side by checking membership (`App.tsx:164`,
`if (!members.some((m) => m.id === userId)) return;`). Functionally it
works, because the client-side filter is correct — but it means every
client's socket, however uninvolved, receives an event announcing that two
other people just started a private conversation (even though it can't read
their messages, thanks to the server-side membership checks elsewhere).
That's both a scale smell (broadcast traffic grows with total app activity,
not with what any one client actually needs) and a very minor information
leak (existence of a DM/group is visible to everyone, even if content
isn't). The fix: have each socket `join` a personal room on connect
(`socket.join(`user:${socket.userId}`)`), and emit `dm_created` only to
`io.to(`user:${targetUserId}`)` / `io.to(`user:${currentUserId}`)` instead
of everyone.

---

## 8. Frontend architecture

**Zustand is the single source of truth for anything server-driven**
(`store.ts`) — rooms, messages, typing, presence, unread counts. Components
read slices via selectors; nothing keeps a parallel copy of this data in
`useState`. That matters because of where the socket listeners live: all of
them are registered exactly once, in `App.tsx`'s top-level effect
(`:104-205`), never inside `Sidebar`/`ChatPanel`/`Message`. This is a real
convention worth keeping (it's already called out in `CLAUDE.md`), and the
reason is worth internalizing, not just following: if a socket listener
lived inside `ChatPanel` instead, it would be registered every time
`ChatPanel` mounts — switch rooms twice and you'd have two listeners both
calling `addMessage` for the same incoming message, and every message would
appear twice in the UI. This is a genuinely common bug in chat apps built by
people who haven't hit it yet. One owner for the socket connection, one
place all its listeners live, is the fix.

**The `?? []` vs `|| []` Zustand selector gotcha** (already documented in
`CLAUDE.md`, and correctly followed throughout — e.g. `ChatPanel.tsx:24`)
is worth restating because it's a genuinely non-obvious lesson about how
external stores interact with React's render loop: `s.messages[roomId] ||
[]` *inside* a selector creates a brand-new `[]` on every single store
read, even when nothing changed — and Zustand/React compare selector output
by reference to decide whether to re-render. A fresh `[]` every time looks
"changed" every time, so the component re-renders forever. Moving the
fallback *outside* the selector (`useStore((s) => s.messages[roomId]) ??
[]`) means the selector itself returns the *same* `undefined` reference
when there's no data, so no spurious re-render. This class of bug (a
derived-but-unstable value fed into a reference-equality check) shows up
anywhere memoization or external stores are involved, not just Zustand —
recognizing the shape of it is the transferable skill.

**Inline styles vs CSS classes** — this session's live example. `App.tsx`'s
sign-in screen got moved from `style={{...}}` objects into `index.css`
classes (`.signin-body`, `.signin-guest-title`, etc.), which collapsed ~55
lines of nested JSX into ~20 flat lines and stopped Prettier from exploding
every element across 6+ lines every time it ran. `ChatPanel.tsx`,
`Sidebar.tsx`, and `Message.tsx` are still almost entirely inline styles —
they're the natural next targets if you want to keep practicing this same
refactor on your own, file by file, the way we discussed.

**A genuinely worth-fixing inconsistency**: `Message.tsx:7-17`
(`getAccentColor`) computes a username's color with *hardcoded, literal
substring checks* — `if (h.includes('jackson')) return '#53d8fb'`, same for
`'justin'` and `'fay'` — falling back to a hash-of-username scheme for
everyone else. This is leftover from this app's origin as a friend-group
project (see §9) and it's a **second, parallel color system** that exists
alongside `colorSchemes.ts` + `ProfileModal`'s actual per-user
`color_scheme` field, which every user can already set and which is
already persisted in Postgres. Right now a message's username color and
that same user's chosen profile theme color are two completely
unrelated values, computed by two different pieces of code, and can
disagree. The fix is to make `Message`'s username color read from the
sender's own `color_scheme.accent` (would need the message payload or a
client-side user-lookup cache to carry `color_scheme`) and delete
`getAccentColor` and its three hardcoded names entirely. This is a great
one to point to as "I found and unified a duplicated concept" — a concrete
signal of code-review skill, not just feature-building.

---

## 9. Design system: what `STYLING.md` actually is, and how to fix it

Worth saying plainly: **`STYLING.md` is not chatapp's design system.** Read
closely, it documents a *different, sibling project* — a personal
portfolio/"person card" site for a friend group (it references "jackson
huang," "justin fang," a hero section with giant names, draggable desktop
icons, a quote carousel, per-person bios with school/co-op fields). None of
that exists in this codebase. It was very likely copied in as a starting
reference when chatapp's XP aesthetic was first built, and never trimmed
down to just what chatapp actually kept.

What chatapp **actually implements**, cross-referenced against
`index.css`:
- The XP beveled-border pattern, titlebar gradients, taskbar, dialog
  overlay, `Tahoma` for all chrome text — genuinely carried over and in
  active use (`index.css:25-138`).
- `Stack Sans Notch` and `VT323` — also genuinely in use (message content,
  message timestamps, profile stats).
- `Mansalva` — used exactly once, for `.profile-name` (`index.css:359-364`).
- `Londrina Outline` — **imported in the Google Fonts URL
  (`index.css:1`) but never referenced anywhere in chatapp's CSS.** It was
  the sibling project's logo font. This is a small, free win: dropping it
  from the import URL saves a font-loading request for a typeface this app
  never renders.
- The **real, chatapp-specific design token system** is
  `colorSchemes.ts` — six named per-user accent themes (slate/mint/
  sunset/ocean/rose/citrus), each exposing the same eight semantic slots
  (`titleStart`, `titleEnd`, `accent`, `body`, `text`, `textMuted`,
  `border`, `borderLight`) as CSS custom properties on `ProfileModal`'s
  card (`ProfileModal.tsx:132-141`). This is functionally identical *in
  spirit* to `STYLING.md`'s "per-person theme colors" section — just
  user-selectable instead of hardcoded to three specific people — and it's
  the piece that's actually missing proper documentation.
- Hero section, desktop icons, quote carousel, draggable windows, mobile
  icon grid, the three hardcoded person palettes — **none of these exist
  in chatapp.** They're pure carryover noise in the doc.

**Concrete rewrite plan**, if you want chatapp to have an honest design
doc instead of an inherited one:
1. Keep: font roles (Tahoma/Stack Sans Notch/VT323/Mansalva), the XP
   beveled-border + titlebar-gradient recipes, taskbar spec, dialog overlay
   spec, z-index hierarchy, mobile breakpoint rules — all real and in use.
2. Drop entirely: hero section, desktop icons, quote carousel, draggable
   windows, `Londrina Outline`, the three named people's hardcoded
   palettes, "what to carry over to a new app" (that section is *for* the
   sibling project, not for this one).
3. Add, as the new centerpiece: document `colorSchemes.ts`'s eight-slot
   contract as chatapp's actual theming system — what each CSS variable
   controls, which components consume `cardVars`, and how to add a
   seventh scheme. This is the section that's genuinely missing today,
   and it's the one a designer or engineer joining this project would
   actually need.

Doing this rewrite yourself is a good exercise in its own right — writing a
design doc that's *true to what you actually shipped*, instead of aspirational
or inherited, is a real product/design-engineering skill, distinct from
writing the CSS in the first place.

---

## 10. Prioritized improvement backlog

Ranked by "how much systems-thinking signal it demonstrates" relative to
effort, not just severity:

1. **Extract a shared room-access check** (§5) — dedupes 5 copies of the
   same authorization logic into one function. Low effort, teaches you the
   most about *why* each call site needed it.
2. **Scope `dm_created`/`group_created`/`group_invited`/`room_created` to
   actual recipients instead of `io.emit()` broadcast** (§7) — small code
   change, real scale + privacy improvement, good interview story.
3. **Replace Redis `KEYS` scans with Hash-based storage** for typing
   indicators and read receipts (§6) — the single most "I know a classic
   Redis anti-pattern and its fix" item on this list.
4. **Unify the two color systems** — delete `Message.tsx`'s hardcoded
   `getAccentColor` names, read username color from the sender's own
   `color_scheme` instead (§8).
5. **Cursor-based pagination for message history** (§5) — the real fix
   needed before "load older messages" could ever be a feature.
6. **Plan for the socket.io Redis adapter** before ever running more than
   one server instance (§7) — not urgent today, but know it's the very
   next thing that would break.
7. **Rewrite `STYLING.md`** to document chatapp's actual design system
   instead of the sibling portfolio project's (§9).
8. **Finish moving inline `style={{...}}` blocks into `index.css` classes**
   across `ChatPanel.tsx`/`Sidebar.tsx`/`Message.tsx`, continuing the
   pattern started on `App.tsx`'s sign-in screen this session (§8).

Items 1-6 are the ones worth being able to explain out loud, unprompted, if
someone asks "walk me through this app's architecture" — each one is a
specific, correct observation about a real tradeoff, not a vague "it could
be more scalable." That specificity is what systems thinking actually looks
like in an interview: not knowing every pattern that exists, but being able
to point at your own code and say precisely where it would bend and why.
