---
name: GitHub push authentication
description: Safe recovery when GitHub rejects pushes despite a configured secret or OAuth connection.
---

When GitHub rejects `git push`, a present `GITHUB_TOKEN` or healthy OAuth connection does not prove that the Git CLI can authenticate to the target repository. Check the worktree and branch relationship first; do not expose credentials, place a token in the remote URL, create an empty commit, or force-push to work around authentication. If the supported GitHub connection still cannot authorize the CLI, stop and have the user refresh the connection or replace the token with one that can write to the repository.

**Why:** In this workspace, GitHub rejected pushes even though a token existed and the OAuth connection reported healthy repository scope.

**How to apply:** Verify the actual remote and whether the local branch is a safe fast-forward. Try the supported auth path once; if GitHub still rejects it, leave local commits untouched and ask the user to refresh authorization through Replit.
