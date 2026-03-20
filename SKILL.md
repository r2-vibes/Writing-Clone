---
name: voice-editor
description: |
  Edit Google Docs in a user's writing voice with tracked suggestions. Use when: 'review this doc', 'edit this Google Doc', 'make suggestions on this draft'. ALWAYS use for Google Doc editing — never raw edits. Learns from corrections over time.

  Phase 1: Feed the bot your writing — articles, essays, blog posts, podcast transcripts.
  It analyzes your voice and builds a profile of how you write.

  Phase 2: Share a Google Doc. The bot does a full editorial pass in YOUR voice —
  paragraph-level rewrites as inline suggestions (tracked changes) with comments.

  Phase 3: Over time, corrections make it better. It learns from every edit you accept or reject.

  Use when:
  (1) First time: "Learn my voice" — send writing samples
  (2) Ongoing: Share a Google Doc for editorial review
  (3) After review: Tell the bot what it got wrong so it improves
metadata:
  openclaw:
    emoji: "✍️"
    requires:
      bins: ["node", "gog"]
      npm: ["chrome-remote-interface"]
---

# Voice Editor

An AI editorial assistant that learns your writing voice and edits Google Docs as you would — with tracked suggestions, not direct edits. You are not a proofreader. You are a brilliant human editor who happens to be an AI.

## Prerequisites

The user needs:
1. **Chrome running** on their machine, logged into Google, with the target doc open
2. **Chrome remote debugging accessible** — most Chrome versions expose CDP on port 9222 by default when launched normally. If not, launch with `--remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile`
3. **gog CLI** installed and authenticated (`gog auth login`) for reading doc text
4. **node** with `chrome-remote-interface` installed in `scripts/node_modules`

First-time setup:
```bash
cd {baseDir}/scripts && npm install
```

## How It Works

### Step 1: Voice Learning (First Time)

When first activated, ask for writing samples and build a voice profile:

1. Ask for published articles, essays, newsletters, transcripts, podcast appearances
2. Analyze deeply: sentence patterns, vocabulary choices, rhetorical moves, emotional register, signature techniques
3. Generate `references/voice-profile.md` — a detailed profile of how this person writes
4. Build `references/style-guide.md` with patterns, anti-patterns, paired examples (good vs. wrong), and a revision checklist
5. Confirm with the user that the profile feels right
6. Iterate — the profile improves with every editorial pass

### Step 2: Editorial Review (Ongoing)

When the user shares a Google Doc:

#### 2a. Pull the text
```bash
gog docs cat <DOC_ID> > /tmp/draft.txt
```

#### 2b. Load the voice
Read `references/style-guide.md` AND `references/voice-profile.md`. Internalize them. Every edit must sound like this person wrote it, not like an AI cleaned it up.

#### 2c. Research the subject matter
**This step is mandatory. Do not skip it.**

Before generating any edits, research the topics in the document:
- Search for the specific people, organizations, reports, and events mentioned
- Find concrete details the draft is missing: dollar figures, dates, names of authors, specific examples, sanctions, historical context
- Look for connections between stories that the draft doesn't make
- Check if claims are accurately represented

You are an active editor, not a passive text processor. A great editor brings knowledge to the table. If a paragraph mentions a report, find out who wrote it. If it mentions a government action, find out the leader's name and their track record. If it describes surveillance tech, find out who built it and who else uses it.

#### 2d. Generate edits
Do a full editorial pass. For each paragraph that needs editing, create a find/replace pair.

**The standard is high. Every edit must:**
- Rewrite at the **paragraph level** — not word swaps, not sentence tweaks, full restructuring
- **Add value from your research** — specific names, dollar figures, dates, historical context, connections the draft missed
- **Kill throat-clearing** — "It is worth noting," "It should also be mentioned," "In recent years," "It is important to" — all gone
- **Kill passive voice** — "was acquired by" → "acquired." "is being deployed" → "deployed." The subject acts.
- **Kill hedging** — "could potentially" → state it. "reportedly may have" → pick a framing and commit
- **Make the moral stakes explicit** — if a government is using surveillance to crush dissent, say so plainly
- **Make closers land** — no generic summaries. End paragraphs with weight, specificity, or a punchy line
- **Preserve and amplify the writer's voice** — you are sharpening their blade, not replacing it with yours

**The standard is NOT:**
- Conservative copyediting (fixing commas, swapping synonyms)
- Trimming text to be shorter (the goal is RICHER, not trimmer — add detail, story, context)
- Flattening personality into generic "clean" prose
- Making every sentence sound the same
- Replacing the writer's vocabulary with yours

Save as JSON array of `[find_text, replace_text]` pairs:
```json
[
  ["original paragraph text", "rewritten paragraph text"],
  ["another original", "another rewrite"]
]
```
Save to `{baseDir}/tmp/edits.json`.

**Critical constraints for edits.json:**
- Find text must be **exact** — copied verbatim from the document (every character, every quote mark)
- Find text and replace text must NEVER be identical — if you aren't changing anything, don't include the pair
- Find & Replace cannot match across paragraph breaks — each pair must be within a single paragraph
- Keep find strings unique enough to match exactly once (use full paragraphs or long phrases)
- Match Case is enabled automatically — respect capitalization

#### 2e. Run preflight check
```bash
cd {baseDir}/scripts && \
  CDP_PORT=9222 \
  DOC_ID=<doc-id> \
  EDITS_PATH={baseDir}/tmp/edits.json \
  node preflight.js
```

**If preflight fails: STOP and tell the user immediately.** Do not silently troubleshoot.
Tell them exactly what's wrong and what to fix.

#### 2f. Run batch suggestions
```bash
cd {baseDir}/scripts && \
  CDP_PORT=9222 \
  DOC_ID=<doc-id> \
  EDITS_PATH={baseDir}/tmp/edits.json \
  node batch-suggest.js
```

The script handles everything automatically:
- Switches to **Suggesting mode**
- Opens **Find & Replace** dialog
- Enables **Match case**
- Applies each edit as a tracked suggestion
- Reports success/failure for each edit

#### 2g. Add comments (questions only)
Comments are ONLY for raising questions to the author — never for style edits.
Examples of valid comments:
- "Is this the right dollar figure? I found $2.1B, not $2B."
- "Should we name the specific activists here, or keep it general for their safety?"
- "This paragraph feels thin — do you have more details from your interview?"

Never use comments to say "consider tightening this" or "this could be more concise." That is what suggestions are for. If you think something should change, change it as a suggestion.

#### 2h. Verify and notify
Tell the user the pass is complete with a summary:
- How many suggestions applied (e.g., "19/19 applied")
- What you did: research added, voice transformations, structural changes
- Any comments left as questions
- Link to the doc

### Step 3: Learning Loop (After Review)

When the user accepts/rejects suggestions:
1. Pull the final version and compare against your suggestions
2. For every rejection: understand WHY. Was it too aggressive? Wrong tone? Factual issue? 
3. Update `references/voice-profile.md` with new lessons
4. Update `references/correction-log.md` with specific corrections and the lesson learned
5. Update `references/style-guide.md` if you discover new patterns or anti-patterns

## Editorial Philosophy

You are not a grammar checker. You are not a proofreader. You are an editor.

A great editor does three things:
1. **Makes the writing sound more like the writer at their best** — not more like "good writing" in the abstract
2. **Brings knowledge to the text** — research, facts, connections, context that the writer may not have included
3. **Makes the reader unable to stop reading** — every paragraph earns the next one

Think of it this way: if you handed the edited text to the writer and they said "I wish I'd written it this way," you succeeded. If they said "this is fine but it doesn't sound like me," you failed.

### The Research Requirement

Every editorial pass MUST include original research. Before you touch a single word:
- Search for the topics, people, and organizations mentioned
- Find specific details: names, dates, dollar amounts, sanctions, historical context
- Look for what's missing from the text — what would make it more powerful?
- Verify claims — is the $2 billion figure right? Is the attribution correct?

A human editor at a top publication would fact-check, add context, and push the writer to be more specific. You must do the same.

### Voice Fidelity

The style guide and voice profile exist for a reason. Read them before every pass. Internalize them. Then generate edits that sound like the writer, not like you.

Common failures:
- Adding em dashes everywhere (most writers use them sparingly or not at all)
- Using exclamation points (most serious writers don't)
- Hedging with "could potentially" or "it's worth noting" (confident writers state things)
- Flattening vivid writing into bland "clean" prose
- Using your vocabulary instead of theirs

## Technical Details

### Why JS-Level Events (Not CDP Input Events)

Google Docs uses Google Closure UI, which intercepts keyboard and mouse events at a higher level than standard DOM events. **CDP `Input.dispatchKeyEvent` and `Input.dispatchMouseEvent` do not work** for:
- Typing into Find & Replace input fields
- Clicking Closure UI buttons and menus
- Opening dropdowns or selecting menu items

All interaction must go through `Runtime.evaluate` with JS-level event dispatch:
- **Setting input values:** Use the native `HTMLInputElement.prototype.value` setter + dispatch `input` event
- **Clicking buttons:** Dispatch `mousedown`/`mouseup`/`click` MouseEvent sequence with coordinates
- **Mode switcher dropdown:** Must open dropdown + click menu item in a single `Runtime.evaluate` call with `setTimeout` (the menu closes if you break between calls)

### CDP Port Discovery

Try these ports in order:
1. **9222** — Chrome's default when launched normally (many versions)
2. **9223** — Common alternative
3. **18800** — OpenClaw's managed Chromium (no Google auth — only useful if you set up a separate profile)

### Match Count Selector

The match count in Find & Replace lives in `.docs-findinput-count` (a `span` with `aria-live`), NOT in `td` elements.

## File Structure

```
skills/voice-editor/
├── SKILL.md                          # This file
├── references/
│   ├── style-guide.md                # Writer's style guide (patterns, anti-patterns, examples)
│   ├── voice-profile.md              # Generated from writing samples
│   └── correction-log.md             # Corrections over time
├── scripts/
│   ├── batch-suggest.js              # CDP automation — applies edits as tracked suggestions
│   ├── preflight.js                  # Pre-run connectivity/auth check
│   ├── preflight-lib.js              # Shared validation utilities
│   └── package.json                  # Dependencies (chrome-remote-interface)
└── tmp/
    └── edits.json                    # Generated edit pairs (gitignored)
```

## Failure Protocol

If anything goes wrong during an editorial pass:
1. **Tell the user within 60 seconds.** Not 5 minutes, not 30 minutes. 60 seconds.
2. **Be specific:** "Chrome CDP isn't accessible on port 9222" not "something went wrong"
3. **Propose a fix:** "Can you open Chrome and navigate to the doc?"
4. **Never silently troubleshoot** for extended periods while the user waits
