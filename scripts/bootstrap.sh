#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP_DIR="$SKILL_DIR/tmp"

mkdir -p "$TMP_DIR"

echo "Setting up Voice Editor..."

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js is not installed."
  echo "Please install Node.js 18+ once, then run this script again."
  exit 1
fi

if ! command -v gog >/dev/null 2>&1; then
  echo "❌ gog CLI is not installed."
  echo "Please install and connect gog once, then run this script again."
  exit 1
fi

cd "$SCRIPT_DIR"
npm install --silent

if gog auth status >/dev/null 2>&1; then
  echo "✅ gog auth looks ready"
else
  echo "⚠️ gog auth is not ready yet."
  echo "Run: gog auth login"
  echo "Then run this script again."
  exit 1
fi

if [[ ! -f "$TMP_DIR/edits.demo.json" ]]; then
  cat > "$TMP_DIR/edits.demo.json" <<'JSON'
[
  ["This is a rough draft paragraph.", "This is a polished draft paragraph with clearer language."],
  ["We should maybe consider this option.", "We should consider this option because it directly supports the goal."]
]
JSON
fi

echo ""
echo "✅ Setup complete"
echo "- Demo edits file ready: $TMP_DIR/edits.demo.json"
echo ""
echo "Next steps:"
echo "1) Open your Google Doc in Chrome"
echo "2) Switch to Suggesting mode"
echo "3) Open Find & Replace (Cmd+Shift+H)"
echo "4) Run: DOC_ID=<google_doc_id> EDITS_PATH=$TMP_DIR/edits.demo.json npm run preflight"
echo "5) Run: DOC_ID=<google_doc_id> EDITS_PATH=$TMP_DIR/edits.demo.json npm run batch-suggest"
