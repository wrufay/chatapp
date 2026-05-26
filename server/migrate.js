require('dotenv').config();
const pool = require('./db');

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      image_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_by TEXT REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id),
      username TEXT NOT NULL,
      content TEXT NOT NULL,
      reactions JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_dm BOOLEAN DEFAULT false;
    ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT false;

    CREATE TABLE IF NOT EXISTS room_members (
      room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (room_id, user_id)
    );
  `);
  await pool.query(`
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES messages(id);
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url TEXT;
  `);
  console.log('Migration complete');
  await pool.end();
}

migrate().catch(err => { console.error(err); process.exit(1); });
