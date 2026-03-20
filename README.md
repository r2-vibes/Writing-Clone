# Voice Editor — OpenClaw Skill

An AI editorial assistant that learns your writing voice and edits Google Docs with tracked suggestions (Google Docs "Suggesting" mode). Not a grammar checker. A full editorial partner that researches, restructures, and rewrites in YOUR voice.

## What It Does

1. **Learns your voice** from published writing samples (articles, essays, newsletters)
2. **Edits Google Docs** as paragraph-level tracked suggestions — the way a brilliant human editor would
3. **Researches the subject matter** — adds specific names, dates, dollar figures, context
4. **Improves over time** — learns from every correction

## Setup

### Prerequisites
- [OpenClaw](https://github.com/openclaw/openclaw) installed and running
- Google Chrome (logged into Google)
- [gog CLI](https://github.com/nextonhq/gog) for Google Workspace access
- Node.js

### Install
```bash
# From your OpenClaw workspace
cd skills/voice-editor/scripts
npm install
```

### First Run
1. Tell your OpenClaw agent: "Learn my voice" and share 3-5 published writing samples
2. The agent builds `references/style-guide.md` and `references/voice-profile.md`
3. Review and confirm the profile feels right

### Editorial Pass
1. Open a Google Doc in Chrome
2. Tell your agent: "Edit this doc" and share the link
3. The agent pulls the text, researches the topics, generates edits, and applies them as tracked suggestions
4. Review and accept/reject — the agent learns from your choices

## How It Works

The skill uses Chrome DevTools Protocol (CDP) to automate Google Docs' Find & Replace in Suggesting mode. This is the only reliable way to create tracked suggestions programmatically — the Google Docs API does not support creating suggestions.

### Technical Architecture
- `scripts/batch-suggest.js` — CDP automation (Suggesting mode, Find & Replace, Match Case, edit application)
- `scripts/preflight.js` — Pre-run checks (Chrome running, CDP accessible, doc open, auth valid)
- `scripts/preflight-lib.js` — Shared validation utilities

### Why CDP + Find & Replace?

Google Docs uses Google Closure UI, which swallows standard browser events. The script uses `Runtime.evaluate` with JS-level event dispatch (native value setters + MouseEvent dispatch) instead of CDP Input events. This is documented extensively in `batch-suggest.js`.

## File Structure

```
voice-editor/
├── SKILL.md                              # Agent instructions
├── README.md                             # This file
├── references/
│   ├── style-guide.example.md            # Template — replaced with your style guide
│   ├── voice-profile.example.md          # Template — replaced with your voice profile
│   └── correction-log.md                 # Grows over time
├── scripts/
│   ├── batch-suggest.js                  # CDP automation
│   ├── preflight.js                      # Connectivity checks
│   ├── preflight-lib.js                  # Shared utilities
│   └── package.json                      # Dependencies
└── tmp/                                  # Generated edit files (gitignored)
```

## Editorial Philosophy

This is not a proofreader. It is an editor that:
- **Restructures paragraphs** — not just swaps words
- **Adds value from research** — finds names, dates, figures the draft is missing
- **Kills throat-clearing** — "It is worth noting" is deleted, not tweaked
- **Makes moral stakes explicit** — if something matters, says so plainly
- **Preserves and amplifies voice** — sharpens the writer's blade, doesn't replace it

## License

MIT
