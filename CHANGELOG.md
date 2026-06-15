# Changelog

## [2026-06-15] Add GET /api/users/:id public profile route
- What changed: Added `GET /api/users/:id` to server/index.js — returns id, username, image_url, bio, and status for any user by their Clerk user ID; requires auth
- Files changed: server/index.js, TODO.md
- Note: No migration required

## [2026-06-15] Add ProfileModal component
- What changed: Created client/src/ProfileModal.tsx — an XP-styled modal that fetches the current user's profile (avatar, username, bio, status) via GET /api/me and allows editing bio and status via PATCH /api/me. Wired into App.tsx with a "My Profile" button in the Start menu taskbar.
- Files changed: client/src/ProfileModal.tsx, client/src/App.tsx, TODO.md
- Note: No migration required; uses existing bio and status columns

## [2026-06-15] Add GET /api/me and PATCH /api/me profile routes
- What changed: Added two REST routes to server/index.js — GET /api/me returns the current user's id, username, image_url, bio, and status; PATCH /api/me allows partial updates to bio and/or status
- Files changed: server/index.js, TODO.md
- Note: Requires bio and status columns to exist — run `npm run migrate` if not done already

## [2026-06-15] Add bio and status columns to users table
- What changed: Added `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT` and `status TEXT` to migrate.js
- Files changed: server/migrate.js, TODO.md
- Note: Run `npm run migrate` in the server directory to apply the new columns to your database
