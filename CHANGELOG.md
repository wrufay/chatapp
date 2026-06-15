# Changelog

## [2026-06-15] Add GET /api/me and PATCH /api/me profile routes
- What changed: Added two REST routes to server/index.js — GET /api/me returns the current user's id, username, image_url, bio, and status; PATCH /api/me allows partial updates to bio and/or status
- Files changed: server/index.js, TODO.md
- Note: Requires bio and status columns to exist — run `npm run migrate` if not done already

## [2026-06-15] Add bio and status columns to users table
- What changed: Added `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT` and `status TEXT` to migrate.js
- Files changed: server/migrate.js, TODO.md
- Note: Run `npm run migrate` in the server directory to apply the new columns to your database
