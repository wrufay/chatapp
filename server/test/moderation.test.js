const test = require('node:test');
const assert = require('node:assert/strict');
const { isProfane } = require('../lib/moderation');

test('passes clean text', () => {
  assert.equal(isProfane('hey, how is everyone doing today?'), false);
});

test('passes empty/undefined text', () => {
  assert.equal(isProfane(''), false);
  assert.equal(isProfane(undefined), false);
});

test('flags a profane word', () => {
  assert.equal(isProfane('what the fuck is going on'), true);
});

test('flags leetspeak-obfuscated profanity', () => {
  assert.equal(isProfane('this is such b1tch behavior'), true);
});
