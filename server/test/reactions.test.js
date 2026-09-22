const test = require('node:test');
const assert = require('node:assert/strict');
const { toggleReaction } = require('../lib/reactions');

test('adds a reaction from an empty map', () => {
  assert.deepEqual(toggleReaction({}, '👍', 'u1'), { '👍': ['u1'] });
});

test('adds a second user to an existing reaction', () => {
  const before = { '👍': ['u1'] };
  assert.deepEqual(toggleReaction(before, '👍', 'u2'), { '👍': ['u1', 'u2'] });
});

test('removes a user who already reacted (toggle off)', () => {
  const before = { '👍': ['u1', 'u2'] };
  assert.deepEqual(toggleReaction(before, '👍', 'u1'), { '👍': ['u2'] });
});

test('deletes the emoji key once the last user un-reacts', () => {
  const before = { '👍': ['u1'] };
  assert.deepEqual(toggleReaction(before, '👍', 'u1'), {});
});

test('does not mutate the input object', () => {
  const before = { '👍': ['u1'] };
  toggleReaction(before, '👍', 'u2');
  assert.deepEqual(before, { '👍': ['u1'] });
});
