# Build log

A running record of work done on this app: what changed, how, and what
effect it has. Newest entries at the bottom.

---

## 2026-09-23 — Removed hardcoded friend-group names from message colors

**What:** `Message.tsx`'s `getAccentColor` special-cased three specific
usernames (`jackson`, `justin`, `fay`) with fixed colors before falling back
to a hash-based color for everyone else — leftover from this app's origin
as a friend-group project.

**How:** Deleted the three `if (h.includes(...))` branches. Every username
now goes straight to the hash-based fallback, so color assignment is
uniform and username-agnostic.

**Impact:** Removes the last piece of the old friend-group backstory still
live in the code. No visible behavior change for anyone whose username
wasn't one of those three; those three usernames now get a hash-based color
like everyone else instead of a fixed one.

---

## 2026-09-23 — Added local profanity filtering to `send_message`

**What:** Public rooms accepted messages from anyone with just a nickname,
no content moderation beyond rate limiting. Added a check that blocks a
message if it contains profanity.

**How:** `server/lib/moderation.js` wraps `glin-profanity`'s `checkProfanity`
(with leetspeak detection on). Wired into the `send_message` socket handler
right after the rate-limit check, before any database write — a flagged
message returns an `ack` error to the sender and is never inserted or
broadcast. Deliberately not an LLM/cloud API: this check runs entirely
in-process, no message content is ever sent to a third party.

Also ran `npm audit fix` while touching `server/package.json` — fixed 7 of
9 known vulnerabilities in the existing dependency tree (socket.io/`ws`
memory-exhaustion advisories) via a non-breaking bump. Left the remaining
`cloudinary` advisory alone; its fix is a major version bump (1.x → 2.x)
that needs deliberate testing against the upload flow, not a blind bump
right before launch.

**Impact:** Public/anonymous rooms now have a real (if basic) content
safety net instead of none. Adds one new dependency (`glin-profanity`).
4 new unit tests (`server/test/moderation.test.js`).

---

## 2026-09-23 — Added CI

**What:** No CI existed. Added a GitHub Actions workflow.

**How:** `.github/workflows/ci.yml`, two jobs, both running commands that
already existed and already passed locally — no new scripts had to be
written. `server` job: `npm ci` + `npm test`. `client` job: `npm ci` +
`eslint` + `tsc --noEmit` + `vite build`. Triggers on push to `main` and on
every pull request.

**Impact:** Every future push/PR now gets automatic pass/fail feedback on
tests, types, lint, and build — a safety net for the simplification and
feature work still ahead, and a real (if small) signal of engineering
practice for anyone looking at the repo.

---

## 2026-09-23 — Added role-based admin permissions

**What:** There was no way to moderate a room beyond "delete your own
message" — no admin concept at all. Added a `role` column on `users`
(`member` default, `admin`) and let admins delete *any* message, not just
their own.

**How:**
- `server/migrate.js`: `ALTER TABLE users ADD COLUMN IF NOT EXISTS role
  TEXT NOT NULL DEFAULT 'member';` (needs `npm run migrate` to apply).
- `server/lib/permissions.js`: pure, unit-tested functions —
  `isAdminRole(role)` and `canDeleteMessage({ authorId, callerId,
  callerRole })` — kept dependency-free (no DB access) so the actual
  authorization *logic* is testable without a live database, matching the
  pattern already established by `lib/authToken.js` and `lib/reactions.js`.
- `server/index.js`: added `getUserRole(userId)` (one DB lookup) and a
  `requireAdmin` middleware for admin-only routes. `DELETE
  /rooms/:id/messages/:msgId` now allows the message's author *or* an
  admin. Added `PATCH /api/users/:id/role` (admin-only) to promote/demote
  other users — **there is no self-service promotion endpoint**; the first
  admin has to be set directly in the database (`UPDATE users SET role =
  'admin' WHERE id = '<your-user-id>';`), otherwise anyone could grant
  themselves admin.
- `GET /api/me` and `GET /api/users/:id` now both return `role`, so the
  client can tell whether the logged-in user (or whoever's profile is open)
  is an admin.
- Client: `App.tsx` fetches `/api/me` once at init (alongside the existing
  `/rooms` fetch) and stores `isAdmin`, passed down to `ChatPanel`, which
  now shows the delete button on every message when `isAdmin` is true, not
  just the sender's own. `ProfileModal` shows a small "★ Admin" badge next
  to the username on any admin's profile (viewing your own or someone
  else's).

**Impact:** Real moderation capability for the first time — an admin can
now clean up a room instead of every message being permanently stuck once
posted (short of an admin having deleted *their own* message). This is the
groundwork for the "themed rooms + admins, not an ML classifier" approach
to keeping public rooms usable, decided on instead of a semantic-similarity
theme-enforcement bot (see conversation history — cosine similarity was
ruled out for that specific job as a bad match for short, low-signal chat
text). 5 new unit tests (`server/test/permissions.test.js`). Requires a
migration run before deploying (`npm run migrate` in `server/`) and a
manual one-time SQL update to bootstrap the first admin.

---

## 2026-10-02 — Merged pre-launch-hardening into main, bootstrapped the first admin

**What:** Merged `chore/pre-launch-hardening` (the 6 commits above) into
`main` locally, then deployed the role column to the live database and
made the first admin account real.

**How:** Re-ran the full verification suite (server tests, client
tsc/lint/build) on the branch tip first, including a commit that wasn't
mine (`fc09d9b`, an empty-name-field error message), since it hadn't been
checked yet — all green, then `git merge --no-ff`. Ran `npm run migrate`
against the live Neon database (the `role` column didn't exist there yet).
Queried `users` directly to find the right row before touching anything —
the table has ~49 rows, almost all leftover test/security-probe accounts
(`idorA`, `verifyuser...`, `readonlyA...`, etc.) plus a handful of real
friend accounts. Confirmed with the user which row was actually theirs
(`Fay`, the Clerk/Google account, oldest real entry) before running the
`UPDATE users SET role = 'admin'`.

**Impact:** `main` now has everything from the hardening branch, still
only local (not pushed to `origin` yet). The live production database now
has a real admin (`Fay`) who can delete any message in any room — the
admin-roles feature shipped in code earlier is now actually usable on the
deployed app, not just locally.
