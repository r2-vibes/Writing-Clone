---
name: voice-editor
description: |
  Clone your writing voice, then edit Google Docs as if you wrote the changes yourself.
  
  Phase 1: Feed the bot your writing — articles, essays, blog posts, podcast transcripts.
  It analyzes your voice and builds a profile of how you write.
  
  Phase 2: Share a Google Doc. The bot does a full editorial pass in YOUR voice —
  paragraph-level rewrites as inline suggestions (tracked changes) with comments.
  
  Phase 3: Over time, corrections make it better. It learns from every edit you accept or reject.
  
  Use when:
  (1) First time: "Learn my voice" — send writing samples
  (2) Ongoing: Share a Google Doc for editorial review
  (3) After review: Tell the bot what it got wrong so it improves
---

# Voice Editor

An AI editorial assistant that learns YOUR writing voice and edits Google Docs as you would.

## How It Works

### First Time: Voice Learning

When a user first activates this skill, start the onboarding flow:

1. **Ask for writing samples:**
   > "I'd love to learn how you write. Send me as much of your published work as you can — articles, essays, blog posts, newsletters, anything with your voice in it. Links, files, or pasted text all work. The more I read, the better I'll get."

2. **Ask for podcasts/talks (optional):**
   > "Got any podcast appearances or talks? Send me links — I'll transcribe them and learn your speaking voice too. Speaking and writing voices are different, but both help me understand how you think."

3. **Analyze and build the voice profile:**
   - Read every sample carefully
   - Generate `references/voice-profile.md` using the Voice Analysis Framework below
   - Save it

4. **Confirm with the user:**
   > "I've analyzed [X] pieces of your writing. Here's what I see in your voice:
   > 
   > [2-3 paragraph summary of their style, tone, and signature patterns]
   > 
   > Does this feel right? Tell me what I'm missing or getting wrong."

5. **Refine based on feedback**, then confirm:
   > "Got it. I'm ready to edit. Share a Google Doc anytime and I'll review it in your voice — tracked changes and comments, just like a human editor."

### Ongoing: Editorial Review

When the user shares a Google Doc:

1. **Pull the text:**
   ```bash
   gog docs cat <DOC_ID> > /tmp/draft.txt
   ```

2. **Read `references/voice-profile.md`** to load the user's voice.

3. **Do a full editorial pass** — draft paragraph-level rewrites:
   - For EACH paragraph that needs editing, write a complete rewrite
   - Don't just tighten sentences — restructure, combine, reorder
   - Add conceptual framing and original thinking in the user's voice
   - Replace vague language with specifics
   - Cut throat-clearing, hedging, passive voice, corporate jargon
   - Connect ideas to their "so what" — why does this matter?
   - Output as JSON: `[[original_paragraph, rewritten_paragraph], ...]`
   - Save to `/tmp/edits.json`

4. **Apply tracked suggestions via browser automation:**
   - Open the doc in Chrome (`openclaw` browser profile)
   - Switch to **Suggesting mode** (click the mode dropdown → "Suggesting")
   - Open **Find & Replace** (⌘+Shift+H)
   - Run `scripts/batch-suggest.js` — applies all edits as inline tracked changes
   - Each edit becomes a proper suggestion the user can accept/reject

5. **Add inline comments via browser (NOT the API):**
   
   The Google Docs comments API (`--quoted`) does NOT visually anchor comments to highlighted text. Use this browser-based method instead:
   
   For each comment:
   1. Open Find & Replace (⌘+Shift+H)
   2. Use the browser `type` action to type anchor text into the search field
   3. Press Enter to find (highlights the text in the doc)
   4. Close the Find & Replace dialog
   5. Press ⌘+Option+M to open the comment dialog (anchored to the found text)
   6. Use the browser `type` action on the comment draft textbox
   7. Click the "Comment" button to submit
   
   **Critical:** Always use the browser `type` action, never raw CDP `insertText` — the latter types into the document body instead of the input field.

6. **Verify and notify** — take a screenshot to confirm suggestions and comments are visible, then tell the user with a summary of changes.

### After Review: Learning Loop

When the user provides corrections (accepts some suggestions, rejects others, or makes their own changes):

1. Compare the user's final version against your suggestions
2. Note every difference — what they changed, what they kept, what they added
3. Update `references/voice-profile.md` with new lessons
4. Update `references/correction-log.md` with specific corrections
5. Tell the user what you learned

**The bot gets better with every review cycle.**

## Voice Analysis Framework

When analyzing writing samples, build the voice profile around these dimensions:

### Tone
- Where on the spectrum: formal ↔ conversational?
- Authoritative ↔ exploratory?
- Urgent ↔ measured?
- Emotional ↔ analytical?

### Sentence Structure
- Average sentence length and variation
- Short punchy sentences vs. long analytical ones — what's the ratio?
- How do they open paragraphs?
- How do they close paragraphs?
- Active vs. passive voice ratio

### Argument Structure
- How do they build a case? (story first? data first? thesis first?)
- How do they handle counterarguments?
- How do they conclude? (conviction? open question? call to action?)

### Vocabulary & Phrasing
- Preferred terms and phrases
- Words they'd NEVER use
- Jargon level — do they explain technical terms or assume knowledge?
- Punctuation preferences (em dashes, colons, semicolons, parentheses)

### Signature Patterns
- Recurring rhetorical moves
- How they use examples and evidence
- How they handle attribution and sourcing
- Formatting preferences (paragraph length, headers, lists)

### What They Would Never Write
- Phrases, constructions, or framings that would feel wrong in their voice
- Tone they'd avoid (too salesy, too academic, too hedging, etc.)

## File Structure

```
skills/voice-editor/
├── SKILL.md                          # This file
├── references/
│   ├── voice-profile.md              # Generated from writing samples (THE key file)
│   └── correction-log.md             # Every correction, building over time
└── scripts/
    └── batch-suggest.js              # CDP automation for Google Docs suggestions
```

## Google Docs Technical Details

### Browser Setup
1. Navigate to the doc URL in the `openclaw` browser profile
2. Switch to **Suggesting mode**: click the mode button → select "Suggesting"
3. Open **Find & Replace**: Edit menu → Find and replace (⌘+Shift+H)

### Batch Suggest Script
`scripts/batch-suggest.js` connects to Chrome via CDP (port 18800) and automates F&R:

```bash
cd scripts && DOC_ID=<doc_id> node batch-suggest.js
```

Requirements:
- Chrome open to the doc in suggesting mode with F&R dialog open
- `/tmp/edits.json` with `[[find_text, replace_text], ...]` pairs
- `chrome-remote-interface` npm package (run `npm install` in scripts/ directory)

Key technical notes:
- F&R cannot match across paragraph breaks — split multi-paragraph edits into separate pairs
- Enable "Match case" for precision
- The script uses `mousedown/mouseup/click` dispatch (not `.click()`) because Google Docs ignores simple click events
- Wait 1.2s between edits for Google Docs to process
- Press Enter after typing in the find field to trigger search

### Inline Comments (Browser Method)

**Do NOT use the Google Docs comments API** (`gog docs comments add --quoted`). It creates comments that exist in the API but do not visually anchor/highlight text in the document.

Instead, use browser automation to add comments the same way a human would:

1. **Find the anchor text** — Open F&R, type the text you want to comment on, press Enter to highlight it
2. **Close F&R** — Click the X button to close the dialog (the highlight persists)
3. **Open comment dialog** — Press ⌘+Option+M (the comment box opens anchored to the highlighted text)
4. **Type the comment** — Use the browser `type` action on the comment draft textbox
5. **Submit** — Click the "Comment" button

This produces comments identical to what a human creates — text is highlighted in the document with the comment anchored in the sidebar.

**Warning:** Never use raw CDP `Input.insertText` or `Input.dispatchKeyEvent` to type text in Google Docs. These methods type into the document body (the canvas), not into input fields like F&R or comment boxes. Always use the browser tool's `type` action which properly targets the input element by ref.

## Quality Standards

A good editorial pass:
- Rewrites at the **paragraph level**, not just sentence swaps
- **Adds value** — original thinking, conceptual framing, specific details
- **Cuts** throat-clearing, hedging, passive voice, redundancy
- **Preserves** the writer's voice while making it sharper
- Every suggestion is something the writer would say "yes, that's better" to
- Comments address **structural** issues, not just word choices

A bad editorial pass:
- Conservative sentence-by-sentence tweaks that don't restructure
- Removing personality or flattening voice into generic "clean" prose
- Adding the bot's style instead of the writer's
- Missing the forest for the trees — fixing commas while the argument is broken
