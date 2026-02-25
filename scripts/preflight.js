#!/usr/bin/env node

const net = require('node:net');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const CDP = require('chrome-remote-interface');
const {
  readAndValidateEditsFile,
  summarize,
} = require('./preflight-lib');

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  return {
    strict: argv.includes('--strict'),
    json: argv.includes('--json'),
  };
}

async function commandExists(command) {
  try {
    await execFileAsync('sh', ['-lc', `command -v ${command}`], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

async function checkGogAuth() {
  const hasGog = await commandExists('gog');
  if (!hasGog) {
    return {
      id: 'tool.gog',
      hard: true,
      status: 'fail',
      message: 'gog CLI is not installed or not on PATH',
      hint: 'Install gog and authenticate before running voice-editor automation.',
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync('gog', ['auth', 'status'], { timeout: 8000 });
    const output = `${stdout}\n${stderr}`.toLowerCase();
    const looksAuthed = /authenticated|logged in|active account|ok/.test(output);

    return {
      id: 'auth.gog',
      hard: true,
      status: looksAuthed ? 'pass' : 'warn',
      message: looksAuthed ? 'gog auth appears ready' : 'could not confirm gog auth state',
      hint: looksAuthed ? undefined : 'Run: gog auth login, then retry preflight.',
    };
  } catch {
    return {
      id: 'auth.gog',
      hard: true,
      status: 'warn',
      message: 'gog auth status command failed',
      hint: 'Run: gog auth login and verify your account is active.',
    };
  }
}

async function checkCdpPort(port = 18800) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1500);

    socket.once('connect', () => {
      socket.destroy();
      resolve({
        id: 'chrome.cdp',
        hard: true,
        status: 'pass',
        message: `CDP reachable on localhost:${port}`,
      });
    });

    const onError = () => {
      socket.destroy();
      resolve({
        id: 'chrome.cdp',
        hard: true,
        status: 'fail',
        message: `Cannot reach Chrome CDP on localhost:${port}`,
        hint: 'Launch Chrome with --remote-debugging-port=18800 and open the target Google Doc.',
      });
    };

    socket.once('error', onError);
    socket.once('timeout', onError);
  });
}

function checkEditsFile(editsPath) {
  const validation = readAndValidateEditsFile(editsPath);

  if (!validation.ok) {
    return {
      id: 'file.edits',
      hard: true,
      status: 'fail',
      message: validation.errors.join('; '),
      hint: 'Generate edits as JSON array of [findText, replaceText] string pairs.',
    };
  }

  return {
    id: 'file.edits',
    hard: true,
    status: 'pass',
    message: `edits file is valid (${validation.count} edit pair(s))`,
  };
}

async function checkDocHints(docId) {
  if (!docId) {
    return {
      id: 'doc.hints',
      hard: false,
      status: 'warn',
      message: 'DOC_ID not provided; skipped document state checks',
      hint: 'Set DOC_ID to validate active tab, suggesting mode, and find/replace dialog state.',
    };
  }

  let client;
  try {
    client = await CDP({
      port: 18800,
      target: targets => targets.find(t => t.url && t.url.includes(docId)),
    });
  } catch {
    return {
      id: 'doc.hints',
      hard: false,
      status: 'warn',
      message: 'Could not connect to target doc tab via CDP',
      hint: 'Open the exact Google Doc in Chrome and keep it focused before running automation.',
    };
  }

  try {
    const { Runtime } = client;
    const evalResult = await Runtime.evaluate({
      expression: `(() => {
        const findDialog = !!document.querySelector('.docs-findandreplacedialog');
        const modeButton = document.querySelector('[aria-label*="Editing"],[aria-label*="Suggesting"],[aria-label*="Viewing"]');
        const modeText = (modeButton && modeButton.getAttribute('aria-label')) || '';
        const suggesting = /suggesting/i.test(modeText);
        return { findDialog, modeText, suggesting };
      })()`,
      returnByValue: true,
    });

    const value = evalResult.result && evalResult.result.value ? evalResult.result.value : {};
    const hints = [];
    if (!value.suggesting) hints.push('Switch doc to Suggesting mode.');
    if (!value.findDialog) hints.push('Open Find and replace (Cmd+Shift+H).');

    return {
      id: 'doc.hints',
      hard: false,
      status: hints.length ? 'warn' : 'pass',
      message: hints.length ? 'Doc UI is reachable but not fully ready' : 'Doc appears ready for batch suggestions',
      hint: hints.join(' '),
      details: { mode: value.modeText || 'unknown', findDialogOpen: !!value.findDialog },
    };
  } catch {
    return {
      id: 'doc.hints',
      hard: false,
      status: 'warn',
      message: 'Unable to inspect document DOM for readiness hints',
    };
  } finally {
    await client.close().catch(() => {});
  }
}

function printResults(results, summary, asJson) {
  if (asJson) {
    console.log(JSON.stringify({ results, summary }, null, 2));
    return;
  }

  for (const r of results) {
    const icon = r.status === 'pass' ? '✅' : r.status === 'warn' ? '⚠️ ' : r.status === 'skip' ? '⏭️ ' : '❌';
    console.log(`${icon} ${r.id}: ${r.message}`);
    if (r.hint) console.log(`   hint: ${r.hint}`);
  }

  console.log(`\nSummary: ${summary.counts.pass} pass, ${summary.counts.warn} warn, ${summary.counts.fail} fail`);
  if (summary.strict) console.log('Strict mode enabled: warnings fail the check.');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const editsPath = process.env.EDITS_PATH || '/tmp/edits.json';
  const docId = process.env.DOC_ID || '';

  const results = [];
  results.push(await checkGogAuth());
  results.push(await checkCdpPort(18800));
  results.push(checkEditsFile(editsPath));
  results.push(await checkDocHints(docId));

  const summary = summarize(results, { strict: args.strict });
  printResults(results, summary, args.json);
  process.exit(summary.exitCode);
}

main().catch(err => {
  console.error('preflight crashed:', err.message);
  process.exit(1);
});
