# Voice Editor

Give your agent writing samples (and interviews) so it can learn a writing voice, then edit Google Docs with tracked suggestions and inline comments.

This skill is designed to be **operator-driven** (you keep control of document content and account access) and **privacy-safe by default** (local scripts, no hard-coded identities, no credential storage in repo).

## Prerequisites

- Node.js 18+
- Google Docs access through `gog` CLI (already authenticated)
- Chrome running with remote debugging enabled on port `18800`
- Target Google Doc open in Chrome
- Generated edits file at `/tmp/edits.json` (or custom `EDITS_PATH`)

Expected `edits.json` format:

```json
[
  ["find this text", "replace with this text"],
  ["another paragraph", "rewritten paragraph"]
]
```

## Setup

```bash
cd skills/voice-editor/scripts
npm install
```

## Quickstart

1. Generate paragraph rewrites and save them to `/tmp/edits.json`.
2. Open the Google Doc in Chrome.
3. Switch doc mode to **Suggesting**.
4. Open **Find and replace** (`Cmd+Shift+H`).
5. Run preflight:

```bash
DOC_ID=<google_doc_id> npm run preflight
```

6. If preflight passes hard checks, run:

```bash
DOC_ID=<google_doc_id> npm run batch-suggest
```

## Preflight checks

`npm run preflight` validates:

- `gog` is installed and auth appears available
- Chrome CDP endpoint is reachable on `localhost:18800`
- edits file exists and has valid JSON pair structure
- (optional hints) doc tab readiness: suggesting mode + find/replace dialog

Useful flags:

- `--strict` → warnings also fail
- `--json` → machine-readable output

Examples:

```bash
DOC_ID=<id> EDITS_PATH=/tmp/edits.json npm run preflight -- --strict
DOC_ID=<id> npm run preflight -- --json
```

## Common failure modes

- **`Cannot reach Chrome CDP on localhost:18800`**
  - Relaunch Chrome with `--remote-debugging-port=18800`.
- **`missing edits file` or `invalid JSON`**
  - Regenerate `edits.json`; ensure each item is exactly `[find, replace]`.
- **`Could not connect to target doc tab via CDP`**
  - Open the exact doc URL in Chrome and keep it active.
- **Doc readiness warnings**
  - Switch to Suggesting mode and reopen Find and replace.

## Safety & privacy notes

- No credentials are stored in this repo.
- No personal account identifiers are hard-coded.
- Scripts operate only on the currently open browser/doc context you provide.

## Development

Run tests (red/green TDD expected for new logic):

```bash
cd scripts
npm test
```
