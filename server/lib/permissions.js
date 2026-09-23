const VALID_ROLES = new Set(['member', 'admin']);

function isAdminRole(role) {
  return role === 'admin';
}

// Message deletion is normally author-only; an admin can additionally delete
// anyone's message (moderation), but nothing else bends the rule.
function canDeleteMessage({ authorId, callerId, callerRole }) {
  return authorId === callerId || isAdminRole(callerRole);
}

module.exports = { VALID_ROLES, isAdminRole, canDeleteMessage };
