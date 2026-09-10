const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

// Managed providers like Neon require SSL and put `sslmode=require` in the
// connection string; Railway's default strings don't set it and don't need
// it. Detect it from the URL (or an explicit override) so the same
// DATABASE_URL env var works for either provider with no other changes.
const requiresSsl =
  /[?&]sslmode=require/i.test(connectionString || '') ||
  process.env.PGSSLMODE === 'require' ||
  process.env.DATABASE_SSL === 'true';

const pool = new Pool({
  connectionString,
  ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
});

module.exports = pool;
