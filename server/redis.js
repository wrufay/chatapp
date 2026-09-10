const Redis = require('ioredis');

// Usage in this app is plain key/value + sets (get/set/sadd/smembers/srem/del,
// keys with EX for typing-indicator expiry) — no pub/sub, no blocking
// commands. That means Upstash's TCP (ioredis-compatible) endpoint is a
// drop-in here: just paste Upstash's `rediss://...` connection string into
// REDIS_URL. ioredis auto-enables TLS for `rediss://` URLs, so no code
// change is required for the swap itself.
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Without a listener, ioredis rethrows connection errors as uncaught
// exceptions and crashes the process. Log instead so a transient blip
// against a new provider doesn't take the whole server down.
redis.on('error', (err) => {
  console.error('[redis] connection error:', err.message);
});

module.exports = redis;
