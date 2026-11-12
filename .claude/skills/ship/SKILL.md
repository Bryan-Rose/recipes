---
name: ship
description: Merge the current branch's PR, tidy up, and suggest what to work on next. Use when the user says "/ship", "merge it" or "ship it".
argument-hint: "[PR number]"
---

Typing `/ship` is the maintainer asking to merge. Use PR #$ARGUMENTS, or the current branch's PR if no number is given (`gh pr view`).

1. **Close out the review.** If the last review round's decisions aren't posted on the PR yet, post them (AGENTS.md "Record the decisions on the PR"). If CI is failing or a Blocking point is still open, stop and say so instead of merging.
2. **Merge.** `gh pr merge <N> --squash --delete-branch`, then `git switch main && git pull`.
3. **Tick the parent.** For each issue the PR closed, find its parent: the `parent` field in `gh issue view`, or an open issue whose checklist has `- [ ] #<issue>`. Tick that line with `gh issue edit --body-file`, changing nothing else.
4. **Suggest what's next.** From `gh issue list`: open issues labelled `next` first, then the rest of the parent's checklist, then other open issues that aren't blocked. Recommend one with a one-line reason, and offer to bundle it with another if both are small and touch the same code. Don't start it.
