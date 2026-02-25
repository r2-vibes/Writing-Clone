const test = require('node:test');
const assert = require('node:assert/strict');

const { validateEditsPayload, summarize } = require('../preflight-lib');

test('validateEditsPayload accepts array of [find, replace] string pairs', () => {
  const result = validateEditsPayload([
    ['old text', 'new text'],
    ['A', 'B'],
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
  assert.equal(result.errors.length, 0);
});

test('validateEditsPayload rejects malformed entries', () => {
  const result = validateEditsPayload([
    ['ok', 'still ok'],
    ['missing replacement'],
    [1, 'two'],
  ]);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /index 1/);
  assert.match(result.errors.join('\n'), /index 2/);
});

test('summarize returns failing exit code when hard check fails', () => {
  const summary = summarize([
    { id: 'tool.gog', status: 'pass', hard: true },
    { id: 'file.edits', status: 'fail', hard: true },
    { id: 'doc.hints', status: 'warn', hard: false },
  ]);

  assert.equal(summary.exitCode, 1);
  assert.equal(summary.counts.fail, 1);
  assert.equal(summary.counts.warn, 1);
});

test('summarize ignores non-hard failures in non-strict mode', () => {
  const summary = summarize([
    { id: 'doc.hints', status: 'fail', hard: false },
  ], { strict: false });

  assert.equal(summary.exitCode, 0);
});

test('summarize treats warnings as failures in strict mode', () => {
  const summary = summarize([
    { id: 'doc.hints', status: 'warn', hard: false },
  ], { strict: true });

  assert.equal(summary.exitCode, 1);
});
