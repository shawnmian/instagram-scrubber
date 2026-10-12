const test = require('node:test');
const assert = require('node:assert/strict');
const { formatTime, isValidDuration, clampSeek, keyboardTarget } = require('../extension/media.js');

test('formats times with minutes and hours', () => {
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(3661), '1:01:01');
  assert.equal(formatTime(-1), '0:00');
  assert.equal(formatTime(Infinity), '0:00');
});
test('accepts only positive finite durations', () => {
  assert.equal(isValidDuration(Infinity), false);
  assert.equal(isValidDuration(NaN), false);
  assert.equal(isValidDuration(0), false);
  assert.equal(isValidDuration(0.1), true);
});
test('clamps seeks and chooses closest seekable boundary', () => {
  assert.equal(clampSeek(-4, 30, []), 0);
  assert.equal(clampSeek(44, 30, []), 30);
  assert.equal(clampSeek(14, 30, [[0, 10], [20, 30]]), 10);
  assert.equal(clampSeek(18, 30, [[0, 10], [20, 30]]), 20);
  assert.equal(clampSeek(24, 30, [[0, 10], [20, 30]]), 24);
});
test('maps only supported keyboard shortcuts', () => {
  assert.equal(keyboardTarget('ArrowRight', 12, 38, false), 17);
  assert.equal(keyboardTarget('ArrowRight', 12, 38, true), 13);
  assert.equal(keyboardTarget('ArrowLeft', 0, 38, false), 0);
  assert.equal(keyboardTarget('End', 12, 38, false), 38);
  assert.equal(keyboardTarget('Home', 12, 38, false), 0);
  assert.equal(keyboardTarget('a', 12, 38, false), null);
});
