const fs = require('node:fs');

function validateEditsPayload(payload) {
  const errors = [];

  if (!Array.isArray(payload)) {
    return { ok: false, count: 0, errors: ['edits payload must be an array'] };
  }

  payload.forEach((entry, index) => {
    if (!Array.isArray(entry) || entry.length !== 2) {
      errors.push(`index ${index}: expected [findText, replaceText] pair`);
      return;
    }
    if (typeof entry[0] !== 'string' || typeof entry[1] !== 'string') {
      errors.push(`index ${index}: find and replace values must be strings`);
    }
  });

  return {
    ok: errors.length === 0,
    count: payload.length,
    errors,
  };
}

function readAndValidateEditsFile(editsPath) {
  if (!fs.existsSync(editsPath)) {
    return {
      ok: false,
      count: 0,
      errors: [`missing edits file: ${editsPath}`],
    };
  }

  try {
    const raw = fs.readFileSync(editsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return validateEditsPayload(parsed);
  } catch (err) {
    return {
      ok: false,
      count: 0,
      errors: [`invalid JSON in edits file: ${err.message}`],
    };
  }
}

function summarize(results, options = {}) {
  const strict = !!options.strict;
  const counts = { pass: 0, warn: 0, fail: 0, skip: 0 };

  for (const result of results) {
    if (counts[result.status] !== undefined) counts[result.status] += 1;
  }

  let exitCode = 0;

  if (results.some(r => r.status === 'fail' && r.hard)) {
    exitCode = 1;
  }

  if (strict && results.some(r => r.status === 'warn' || r.status === 'fail')) {
    exitCode = 1;
  }

  return { counts, strict, exitCode };
}

module.exports = {
  validateEditsPayload,
  readAndValidateEditsFile,
  summarize,
};
