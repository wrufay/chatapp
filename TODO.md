# Chat App — User Profiles Feature

## Tickets

- [done] Add `bio` and `status` columns to the `users` table in migrate.js
- [done] Add `GET /api/me` and `PATCH /api/me` REST routes to update bio and status
- [done] Add a profile modal component (ProfileModal.jsx) — shows avatar, username, bio, status with an edit form
- [todo] Add `GET /api/users/:id` route to fetch another user's public profile
- [todo] Add online indicator dot to usernames in the sidebar and message list using existing Redis presence data
- [todo] Wire up profile modal to open when clicking a username in the message list
