// Local, dictionary-based check -- runs entirely in this process, no network
// call, no message content ever leaves the server. Deliberately not an LLM:
// this only needs to catch a fixed vocabulary, not understand meaning, and a
// dictionary check is faster, free, and fully auditable.
const { checkProfanity } = require('glin-profanity');

function isProfane(text) {
  if (!text) return false;
  return checkProfanity(text, { detectLeetspeak: true }).containsProfanity;
}

module.exports = { isProfane };
