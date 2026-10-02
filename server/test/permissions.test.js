const test = require('node:test');
const assert = require('node:assert/strict');
const { isAdminRole, canDeleteMessage } = require('../lib/permissions');

test('isAdminRole is true only for the admin role', () => {
  assert.equal(isAdminRole('admin'), true);
  assert.equal(isAdminRole('member'), false);
  assert.equal(isAdminRole(undefined), false);
});

test('authors can delete their own message', () => {
  assert.equal(
    canDeleteMessage({ authorId: 'u1', callerId: 'u1', callerRole: 'member' }),
    true
  );
});

test('a member cannot delete someone else\'s message', () => {
  assert.equal(
    canDeleteMessage({ authorId: 'u1', callerId: 'u2', callerRole: 'member' }),
    false
  );
});

test('an admin can delete anyone\'s message', () => {
  assert.equal(
    canDeleteMessage({ authorId: 'u1', callerId: 'u2', callerRole: 'admin' }),
    true
  );
});
