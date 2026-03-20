#!/usr/bin/env node
/**
 * Voice Editor — Batch Find & Replace as Google Docs Suggestions
 *
 * Connects to Chrome via CDP, switches to Suggesting mode, opens Find & Replace,
 * enables Match Case, and applies each edit pair as a tracked suggestion.
 *
 * PREREQUISITES (handled by preflight.js or the agent):
 *   - Chrome running with remote debugging (or default CDP on 9222)
 *   - Target Google Doc open and loaded in a Chrome tab
 *   - User is authenticated into Google (can edit the doc)
 *
 * The script handles Suggesting mode, Find & Replace dialog, and Match Case
 * automatically — the agent does NOT need to open these manually.
 *
 * USAGE:
 *   CDP_PORT=9222 DOC_ID=<google-doc-id> EDITS_PATH=../tmp/edits.json node batch-suggest.js
 *
 * EDITS FORMAT (edits.json):
 *   [["original text to find", "replacement text"], ...]
 */

const fs = require('node:fs');
const path = require('node:path');
const CDP = require('chrome-remote-interface');
const { readAndValidateEditsFile } = require('./preflight-lib');

const DEFAULT_EDITS_PATH = path.resolve(__dirname, '../tmp/edits.json');
const editsPath = process.env.EDITS_PATH || DEFAULT_EDITS_PATH;
const cdpPort = Number(process.env.CDP_PORT || 9222);
const docId = process.env.DOC_ID || '';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Helpers ──────────────────────────────────────────────────────────────────
// Google Docs uses Google Closure UI which swallows CDP-level Input events.
// All interaction MUST go through Runtime.evaluate (JS-level event dispatch).
// Standard CDP Input.dispatchKeyEvent / Input.dispatchMouseEvent do NOT work
// for typing into Google Docs input fields or clicking Closure UI widgets.

/**
 * Set a text input's value using the native HTMLInputElement setter.
 * This bypasses Closure's event interception and sets the value directly.
 * We then fire an 'input' event so the Closure listener picks it up.
 */
async function setInputValue(Runtime, selector, text) {
  const escaped = JSON.stringify(text);
  return Runtime.evaluate({
    expression: `
      (() => {
        const input = document.querySelector('${selector}');
        if (!input) return 'not found';
        input.focus();
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        ).set;
        nativeSetter.call(input, ${escaped});
        input.dispatchEvent(new Event('input', {bubbles: true, cancelable: true}));
        return 'ok';
      })()
    `
  });
}

/**
 * Trigger a search by dispatching Enter keydown on the find input.
 * The native value setter alone doesn't trigger search — Enter is required.
 */
async function triggerSearch(Runtime) {
  return Runtime.evaluate({
    expression: `
      (() => {
        const input = document.querySelector('#docs-findandreplacedialog-input');
        if (!input) return 'not found';
        input.focus();
        input.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
        }));
        input.dispatchEvent(new KeyboardEvent('keypress', {
          key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
        }));
        input.dispatchEvent(new KeyboardEvent('keyup', {
          key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
        }));
        return 'ok';
      })()
    `
  });
}

/**
 * Read the match count from the Find & Replace dialog.
 * Returns text like "1 of 3" or empty string if no matches.
 */
async function getMatchCount(Runtime) {
  const result = await Runtime.evaluate({
    expression: `document.querySelector('.docs-findinput-count')?.textContent?.trim() || ''`
  });
  return result.result.value;
}

/**
 * Click a button in the Find & Replace dialog by its text label.
 * Uses JS-level mousedown/mouseup/click (CDP mouse events don't work on Closure UI).
 */
async function clickDialogButton(Runtime, label) {
  const result = await Runtime.evaluate({
    expression: `
      (() => {
        const btns = document.querySelectorAll('.docs-findandreplacedialog [role=button]');
        for (const b of btns) {
          if (b.textContent.trim() === '${label}') {
            if (b.classList.contains('jfk-button-disabled') || b.getAttribute('aria-disabled') === 'true') {
              return 'disabled';
            }
            const rect = b.getBoundingClientRect();
            ['mousedown', 'mouseup', 'click'].forEach(type => {
              b.dispatchEvent(new MouseEvent(type, {
                bubbles: true, cancelable: true, view: window,
                clientX: rect.x + rect.width/2, clientY: rect.y + rect.height/2,
                button: 0, detail: 1
              }));
            });
            return 'clicked';
          }
        }
        return 'not found';
      })()
    `
  });
  return result.result.value;
}

/**
 * Switch to Suggesting mode.
 * Opens the mode dropdown and clicks "Suggesting" — all in one Runtime.evaluate
 * call with a setTimeout, because the menu closes if you break out between
 * opening and clicking.
 */
async function switchToSuggestingMode(Runtime) {
  const result = await Runtime.evaluate({
    expression: `
      new Promise(resolve => {
        const btn = document.querySelector('#docs-toolbar-mode-switcher');
        if (!btn) return resolve('no mode switcher found');

        const label = btn.getAttribute('aria-label') || '';
        if (/suggesting/i.test(label)) return resolve('already suggesting');

        // Open the dropdown with full click sequence
        const rect = btn.getBoundingClientRect();
        ['mousedown', 'mouseup', 'click'].forEach(type => {
          btn.dispatchEvent(new MouseEvent(type, {
            bubbles: true, cancelable: true, view: window,
            clientX: rect.x + rect.width / 2,
            clientY: rect.y + rect.height / 2,
            button: 0, detail: 1
          }));
        });

        // Wait for dropdown to render, then click Suggesting
        setTimeout(() => {
          const items = document.querySelectorAll('.goog-menuitem');
          let found = false;
          for (const item of items) {
            if (item.textContent.trim().startsWith('Suggesting')) {
              const iRect = item.getBoundingClientRect();
              if (iRect.width > 0 && iRect.height > 0) {
                ['mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click'].forEach(type => {
                  item.dispatchEvent(new MouseEvent(type, {
                    bubbles: true, cancelable: true, view: window,
                    clientX: iRect.x + iRect.width / 2,
                    clientY: iRect.y + iRect.height / 2,
                    button: 0, detail: 1
                  }));
                });
                found = true;
                break;
              }
            }
          }

          setTimeout(() => {
            const mode = document.querySelector('#docs-toolbar-mode-switcher')
              ?.getAttribute('aria-label') || 'unknown';
            resolve(found ? 'switched to: ' + mode : 'suggesting item not found');
          }, 1000);
        }, 800);
      })
    `,
    awaitPromise: true
  });
  return result.result.value;
}

/**
 * Open the Find & Replace dialog via the Edit menu.
 * Uses JS-level click events on the Edit menubar item and the Find and replace menu item.
 */
async function openFindAndReplace(Runtime) {
  const result = await Runtime.evaluate({
    expression: `
      new Promise(resolve => {
        // Click Edit menu
        const menuItems = document.querySelectorAll('[role=menuitem]');
        let editClicked = false;
        for (const item of menuItems) {
          if (item.textContent.trim() === 'Edit') {
            const rect = item.getBoundingClientRect();
            ['mousedown', 'mouseup', 'click'].forEach(type => {
              item.dispatchEvent(new MouseEvent(type, {
                bubbles: true, cancelable: true, view: window,
                clientX: rect.x + rect.width/2, clientY: rect.y + rect.height/2,
                button: 0, detail: 1
              }));
            });
            editClicked = true;
            break;
          }
        }
        if (!editClicked) return resolve('edit menu not found');

        // Wait for menu to open, then click Find and replace
        setTimeout(() => {
          const items = document.querySelectorAll('.goog-menuitem, [role=menuitem]');
          for (const item of items) {
            if (item.textContent.trim().includes('Find and replace')) {
              const rect = item.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                ['mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click'].forEach(type => {
                  item.dispatchEvent(new MouseEvent(type, {
                    bubbles: true, cancelable: true, view: window,
                    clientX: rect.x + rect.width/2, clientY: rect.y + rect.height/2,
                    button: 0, detail: 1
                  }));
                });
                setTimeout(() => {
                  const dialog = document.querySelector('.docs-findandreplacedialog');
                  const visible = dialog && dialog.getBoundingClientRect().width > 0;
                  resolve(visible ? 'opened' : 'clicked but dialog not visible');
                }, 1000);
                return;
              }
            }
          }
          resolve('find and replace item not found');
        }, 800);
      })
    `,
    awaitPromise: true
  });
  return result.result.value;
}

/**
 * Enable the "Match case" checkbox if not already enabled.
 */
async function enableMatchCase(Runtime) {
  const result = await Runtime.evaluate({
    expression: `
      (() => {
        const checkboxes = document.querySelectorAll('.docs-findandreplacedialog [role=checkbox]');
        // First checkbox is Match case
        if (checkboxes[0] && checkboxes[0].getAttribute('aria-checked') === 'false') {
          checkboxes[0].click();
          return 'enabled';
        }
        return checkboxes[0] ? 'already enabled' : 'not found';
      })()
    `
  });
  return result.result.value;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Validate edits file
  const validation = readAndValidateEditsFile(editsPath);
  if (!validation.ok) {
    console.error('Invalid edits file:', editsPath);
    for (const err of validation.errors) console.error(' -', err);
    process.exit(2);
  }
  const edits = JSON.parse(fs.readFileSync(editsPath, 'utf8'));

  // Connect to Chrome
  let client;
  try {
    client = await CDP({
      port: cdpPort,
      target: targets => {
        const match = targets.find(t =>
          docId ? t.url.includes(docId) : t.url.includes('docs.google.com/document')
        );
        if (!match) throw new Error('No Google Doc tab found' + (docId ? ` matching ${docId}` : ''));
        return match;
      }
    });
  } catch (e) {
    console.error('CDP connection failed:', e.message);
    console.error('Make sure Chrome is running and the Google Doc is open.');
    process.exit(1);
  }

  const { Runtime } = client;

  // ── Setup: Suggesting mode, Find & Replace, Match Case ──
  console.log('Setting up...');

  const modeResult = await switchToSuggestingMode(Runtime);
  console.log('  Mode:', modeResult);
  if (!/suggesting/i.test(modeResult)) {
    console.error('FATAL: Could not switch to Suggesting mode.');
    process.exit(1);
  }

  await sleep(500);

  const frResult = await openFindAndReplace(Runtime);
  console.log('  Find & Replace:', frResult);
  if (frResult !== 'opened') {
    console.error('FATAL: Could not open Find & Replace dialog.');
    process.exit(1);
  }

  await sleep(500);

  const mcResult = await enableMatchCase(Runtime);
  console.log('  Match case:', mcResult);

  await sleep(500);

  // ── Process edits ──
  console.log(`\nProcessing ${edits.length} edits...\n`);
  const startTime = Date.now();
  let success = 0, failed = 0;

  for (let i = 0; i < edits.length; i++) {
    const [find, replace] = edits[i];

    // Set find text
    await setInputValue(Runtime, '#docs-findandreplacedialog-input', find);
    await sleep(300);

    // Trigger search
    await triggerSearch(Runtime);
    await sleep(2000);

    // Check matches
    let count = await getMatchCount(Runtime);
    if (!count || count === '0 of 0' || count === '') {
      await sleep(1500);
      count = await getMatchCount(Runtime);
    }

    if (!count || count === '0 of 0' || count === '') {
      console.log(`[${i+1}/${edits.length}] SKIP (0 matches): ${find.substring(0, 60)}...`);
      failed++;
      continue;
    }

    // Set replace text (second text input in the dialog)
    await Runtime.evaluate({
      expression: `
        (() => {
          const dialog = document.querySelector('.docs-findandreplacedialog');
          const inputs = dialog.querySelectorAll('input[type=text]');
          const input = inputs[1];
          if (!input) return 'not found';
          input.focus();
          const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
          ).set;
          nativeSetter.call(input, ${JSON.stringify(replace)});
          input.dispatchEvent(new Event('input', {bubbles: true, cancelable: true}));
          return 'ok';
        })()
      `
    });
    await sleep(500);

    // Click Replace All
    const replaceResult = await clickDialogButton(Runtime, 'Replace all');
    await sleep(2000);

    if (replaceResult === 'clicked') {
      console.log(`[${i+1}/${edits.length}] OK (${count}): ${find.substring(0, 60)}...`);
      success++;
    } else {
      console.log(`[${i+1}/${edits.length}] FAIL (${replaceResult}): ${find.substring(0, 60)}...`);
      failed++;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone! ${success} succeeded, ${failed} failed/skipped in ${elapsed}s`);

  await client.close();
  process.exit(failed > 0 && success === 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
