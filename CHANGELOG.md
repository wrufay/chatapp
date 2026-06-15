# Changelog

## [2026-06-15] Add bio and status columns to users table
- What changed: Added `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT` and `status TEXT` to migrate.js
- Files changed: server/migrate.js, TODO.md
- Note: Run `npm run migrate` in the server directory to apply the new columns to your database
