// Toggles userId's reaction for a given emoji: adds it if absent, removes it
// if present, and drops the emoji key entirely once its list is empty.
function toggleReaction(reactions, emoji, userId) {
  const next = { ...reactions };
  const users = next[emoji] ? [...next[emoji]] : [];
  const idx = users.indexOf(userId);
  if (idx === -1) {
    users.push(userId);
  } else {
    users.splice(idx, 1);
  }
  if (users.length === 0) {
    delete next[emoji];
  } else {
    next[emoji] = users;
  }
  return next;
}

module.exports = { toggleReaction };
