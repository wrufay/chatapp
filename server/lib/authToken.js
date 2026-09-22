// Anon tokens are `${userId}.${secret}` (2 dot-segments); Clerk session
// tokens are JWTs (always 3). That's enough to tell the two auth modes
// apart without a separate flag on the wire.
function parseAuthToken(token) {
  if (!token) return null;
  if (token.split('.').length === 3) return { mode: 'clerk', token };
  const [userId, secret] = token.split('.');
  if (!userId || !secret) return null;
  return { mode: 'anon', userId, secret };
}

module.exports = { parseAuthToken };
