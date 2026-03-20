#!/usr/bin/env node
/**
 * Voice Editor — Preflight Check
 *
 * Verifies everything needed before running batch-suggest.js:
 *   1. Chrome is running with CDP accessible
 *   2. Target Google Doc is open in a tab
 *   3. User is authenticated (not on a login page)
 *   4. gog CLI is available and authed
 *   5. Edits file is valid (if provided)
 *
 * USAGE:
 *   CDP_PORT=9222 DOC_ID=<doc-id> node preflight.js [--strict] [--json]
 *
 * EXIT CODES:
 *   0 = all checks pass (or only soft warnings)
 *   1 = hard failure — cannot proceed
 *
 * If preflight fails, the agent should tell the user immediately.
 * Do NOT silently retry or troubleshoot for more than 60 seconds.
 */

const net = require('node:net');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const CDP = require('chrome-remote-interface');
const { readAndValidateEditsFile, summarize } = require('./preflight-lib');

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

// ── Checks ───────────────────────────────────────────────────────────────────

async function checkChromeRunning() {
  try {
    await execFileAsync('pgrep', ['-x', 'Google Chrome'], { timeout: 2000 });
    return { id: 'chrome.process', hard: true, status: 'pass', message: 'Chrome is running' };
  } catch {
    return {
      id: 'chrome.process', hard: true, status: 'fail',
      message: 'Chrome is not running',
      hint: 'Launch Google Chrome. The user must be logged into their Google account.'
    };
  }
}

async function checkCdpPort(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(2000);

    socket.once('connect', () => {
      socket.destroy();
      resolve({ id: 'chrome.cdp', hard: true, status: 'pass', message: `CDP reachable on port ${port}` });
    });

    const onError = () => {
      socket.destroy();
      resolve({
        id: 'chrome.cdp', hard: true, status: 'fail',
        message: `Cannot reach Chrome CDP on port ${port}`,
        hint: `Try ports 9222, 9223, or 18800. Chrome must have remote debugging enabled or be launched normally (many Chrome versions expose CDP on 9222 by default).`
      });
    };

    socket.once('error', onError);
    socket.once('timeout', onError);
  });
}

async function checkDocTab(docId, cdpPort) {
  if (!docId) {
    return {
      id: 'doc.tab', hard: false, status: 'warn',
      message: 'DOC_ID not set — cannot verify doc is open',
      hint: 'Set DOC_ID env var to the Google Doc ID for full verification.'
    };
  }

  let client;
  try {
    client = await CDP({
      port: cdpPort,
      target: targets => {
        const match = targets.find(t => t.url && t.url.includes(docId));
        if (!match) throw new Error('not found');
        return match;
      }
    });
  } catch {
    return {
      id: 'doc.tab', hard: true, status: 'fail',
      message: 'Google Doc not found in any Chrome tab',
      hint: `Open https://docs.google.com/document/d/${docId}/edit in Chrome.`
    };
  }

  try {
    const { Runtime } = client;

    // Check if we're on a login page
    const authCheck = await Runtime.evaluate({
      expression: `
        (() => {
          const url = window.location.href;
          if (url.includes('accounts.google.com')) return 'login_page';
          if (url.includes('ServiceLogin')) return 'login_page';
          const editor = document.querySelector('.kix-appview-editor');
          if (editor) return 'doc_loaded';
          const body = document.body?.innerText || '';
          if (body.length < 200) return 'possibly_loading';
          return 'loaded_unknown';
        })()
      `
    });

    const state = authCheck.result.value;
    if (state === 'login_page') {
      return {
        id: 'doc.tab', hard: true, status: 'fail',
        message: 'Chrome is on Google login page — not authenticated',
        hint: 'Log into Google in Chrome first, then open the doc.'
      };
    }
    if (state === 'doc_loaded') {
      return { id: 'doc.tab', hard: true, status: 'pass', message: 'Google Doc is open and loaded' };
    }
    return {
      id: 'doc.tab', hard: false, status: 'warn',
      message: `Doc tab found but state unclear (${state})`,
      hint: 'Make sure the doc is fully loaded before running.'
    };
  } finally {
    await client.close().catch(() => {});
  }
}

async function checkGogAuth() {
  const hasGog = await commandExists('gog');
  if (!hasGog) {
    return {
      id: 'tool.gog', hard: false, status: 'warn',
      message: 'gog CLI not found — doc text extraction will not work',
      hint: 'Install gog for Google Docs text extraction. Edits can still be applied without it.'
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync('gog', ['auth', 'status'], { timeout: 8000 });
    const output = `${stdout}\n${stderr}`.toLowerCase();
    const ok = /authenticated|logged in|active account|ok/.test(output);
    return {
      id: 'auth.gog', hard: false,
      status: ok ? 'pass' : 'warn',
      message: ok ? 'gog auth is active' : 'gog auth state unclear',
      hint: ok ? undefined : 'Run: gog auth login'
    };
  } catch {
    return {
      id: 'auth.gog', hard: false, status: 'warn',
      message: 'gog auth check failed',
      hint: 'Run: gog auth login'
    };
  }
}

function checkEditsFile(editsPath) {
  const validation = readAndValidateEditsFile(editsPath);
  if (!validation.ok) {
    return {
      id: 'file.edits', hard: true, status: 'fail',
      message: validation.errors.join('; '),
      hint: 'Generate edits as JSON array of [findText, replaceText] string pairs.'
    };
  }
  return {
    id: 'file.edits', hard: false,
    status: 'pass',
    message: `edits file valid (${validation.count} pairs)`
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

function printResults(results, summary, asJson) {
  if (asJson) {
    console.log(JSON.stringify({ results, summary }, null, 2));
    return;
  }

  for (const r of results) {
    const icon = r.status === 'pass' ? '✅' : r.status === 'warn' ? '⚠️ ' : '❌';
    console.log(`${icon} ${r.id}: ${r.message}`);
    if (r.hint) console.log(`   → ${r.hint}`);
  }

  console.log(`\n${summary.counts.pass} pass, ${summary.counts.warn} warn, ${summary.counts.fail} fail`);
  if (summary.exitCode !== 0) {
    console.log('PREFLIGHT FAILED — fix the issues above before running batch-suggest.js');
  } else {
    console.log('PREFLIGHT PASSED — ready to run batch-suggest.js');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const editsPath = process.env.EDITS_PATH || path.resolve(__dirname, '../tmp/edits.json');
  const docId = process.env.DOC_ID || '';
  const cdpPort = Number(process.env.CDP_PORT || 9222);

  const results = [];
  results.push(await checkChromeRunning());
  results.push(await checkCdpPort(cdpPort));
  results.push(await checkDocTab(docId, cdpPort));
  results.push(await checkGogAuth());

  // Only check edits file if it exists (it may not be generated yet)
  if (process.env.EDITS_PATH || require('node:fs').existsSync(editsPath)) {
    results.push(checkEditsFile(editsPath));
  }

  const summary = summarize(results, { strict: args.strict });
  printResults(results, summary, args.json);
  process.exit(summary.exitCode);
}

main().catch(err => {
  console.error('Preflight crashed:', err.message);
  process.exit(1);
});
