const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAuthToken } = require('../lib/authToken');

test('rejects an empty token', () => {
  assert.equal(parseAuthToken(''), null);
});

test('recognizes an anon token as userId.secret', () => {
  assert.deepEqual(parseAuthToken('user123.abc456'), {
    mode: 'anon',
    userId: 'user123',
    secret: 'abc456',
  });
});

test('rejects an anon-shaped token missing a secret', () => {
  assert.equal(parseAuthToken('user123.'), null);
});

test('recognizes a 3-segment JWT as a clerk token', () => {
  const jwt = 'header.payload.signature';
  assert.deepEqual(parseAuthToken(jwt), { mode: 'clerk', token: jwt });
});
