---
name: issue
description: Work a GitHub issue end to end in this repo - questions up front, branch, build with full tests, PR, CI and review rounds - following AGENTS.md. Use when the user says "/issue N" or "let's do GH issue N".
argument-hint: <issue number>
---

Work GitHub issue #$ARGUMENTS from start to a PR that is ready to merge. AGENTS.md is the standard for every step; this is only the order to do it in.

1. **Read.** `gh issue view $ARGUMENTS --comments`, plus any issue it links (parent, blocked-by, "see #M"). Read the code it touches.
2. **Ask once.** Put every open question in a single AskUserQuestion round, each with a recommended option. Skip anything you can settle from the code, AGENTS.md or a sensible default; say in the final message which defaults you picked. If the issue has a Decisions section, write the answers there (`gh issue edit`).
3. **Build.** `git switch main && git pull`, then `git switch -c <type>/<short-name>`. Make the change with tests in every layer it touches (AGENTS.md "Testing", e2e included) and show each new test can fail.
4. **Check.** `make check` before every commit; `make e2e` (or `make check-full`) before the PR.
5. **Open the PR.** Push and `gh pr create`. Put `Closes #$ARGUMENTS` in the body only if the PR completes the issue. `gh pr checks --watch` until the required checks pass; fix failures on the same branch.
6. **Review rounds.** Wait for the `Claude review` comment, then follow AGENTS.md's review bullets: act on each point, post the decisions comment, and stop once a round has nothing blocking.
7. **Hand over.** Self-review the whole diff, then end with the review table (point | assessment | action), what was verified, and a merge recommendation. Don't merge.
