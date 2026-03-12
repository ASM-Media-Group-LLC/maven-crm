

## Plan: Change mention style from blue to bold

**What**: In `MentionAutocomplete.tsx`, line 55, the `renderTextWithMentions` function renders mentions with `className="text-primary font-semibold"` (blue + bold). Change this to just bold text without color change.

**Change**:
- File: `src/pages/messenger/components/MentionAutocomplete.tsx`, line 55
- From: `className="text-primary font-semibold"`
- To: `className="font-bold"`

This ensures mentions in group chat bubbles appear as **@Name** in bold (inheriting the bubble's text color) instead of standing out in blue, which clashes with the primary-colored bubbles.

