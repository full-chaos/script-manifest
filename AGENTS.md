# Agent Workflow

Linear (`fullchaos` workspace, `Script Manifest` project) is the sole tracking system.

## Project Constants

```bash
export LINEAR_TEAM="CHAOS"
export LINEAR_PROJECT="Script Manifest"
export LINEAR_PROJECT_URL="https://linear.app/fullchaos/project/script-manifest-15384341055a"
```

## Linear: Create Issues with `linear-cli`

> Binary is **`linear-cli`** (Rust). There is no `linear` binary on PATH. The `linear-cli i ...` shortcut maps to `linear-cli issues ...`.

Authenticate and confirm status:

```bash
linear-cli auth status
```

If not authenticated:

```bash
linear-cli auth login
```

> No `init` subcommand exists — `linear-cli init` is a dangerous prefix match for `initiatives`. Pass `--team CHAOS` explicitly on every command, or rely on the auth-time default workspace.

Create a feature issue in the project:

```bash
linear-cli i create "[Feature] <feature title>" \
  --team CHAOS \
  --project "Script Manifest" \
  --labels feature \
  --priority 2
```

Create task/subtask issues (use `--parent` for hierarchy):

```bash
linear-cli i create "[Task] <task title>" \
  --team CHAOS \
  --project "Script Manifest" \
  --labels task \
  --parent CHAOS-<feature-number>

linear-cli i create "[Subtask] <subtask title>" \
  --team CHAOS \
  --project "Script Manifest" \
  --labels subtask \
  --parent CHAOS-<task-number>
```

## Operating Rules

- Mirror work that needs team visibility into Linear issues.
- Add every mirrored issue to the `Script Manifest` project in Linear.
- **NEVER commit or push directly to `main`.** ALL changes go through feature branches + PRs.
  - This applies to every change, no matter how small — config files, one-liners, CI tweaks, everything.
  - **One-time setup per clone**:
    ```bash
    scripts/setup-hooks.sh
    ```
    Activates the shared pre-push hook (blocks `<feature> → origin/main` pushes) and sets `push.default=current`.
  - **Create new worktrees with the helper** (handles upstream tracking + hook activation):
    ```bash
    scripts/new-worktree.sh <branch-name>
    # equivalent to:
    #   git fetch origin
    #   git worktree add ../script-manifest-<branch> -b <branch> origin/main
    #   git branch --unset-upstream <branch>
    #   (cd ../script-manifest-<branch> && scripts/setup-hooks.sh)
    ```
  - Branch format: `<change-type:feat,chore,sec,fix,docs>/<issue>-<short description>` (example: `feat/TICK-111-add-new-thing`).
  - Keep all commits for that feature on its dedicated branch until merged.
  - **Pushing worktree branches**: with `scripts/new-worktree.sh` + `scripts/setup-hooks.sh` applied, `git push` is safe — it targets the same-named remote branch via `push.default=current`, and the pre-push hook refuses any `<feature> → main` push. If you bypass the helpers (raw `git worktree add -b <feature> origin/main`), the worktree tracks `origin/main` and a plain `git push` will target main; use one of the explicit forms instead:
    ```bash
    # CORRECT — gh pr create pushes the branch automatically:
    gh pr create --head <branch-name> --base main --title "..." --body "..."

    # CORRECT — preserve multiline PR bodies/descriptions with heredoc + --body:
    gh pr create --head <branch-name> --base main --title "..." --body "$(cat <<'EOF'
    ## Summary
    - First item
    - Second item

    ## Verification
    - Command output or manual QA evidence
    EOF
    )"

    # WRONG — --body-file can submit literal \n sequences instead of newlines:
    gh pr create --head <branch-name> --base main --title "..." --body-file /tmp/pr-body.md

    # CORRECT — explicit refspec:
    git push origin HEAD:<branch-name>

    # WRONG (only if helpers were skipped) — pushes to tracked upstream (main):
    git push
    git push -u origin <branch-name>
    ```
  - Open a PR for review before merging.
  - Clean up worktrees after the PR is merged:
    ```bash
    git worktree remove ../script-manifest-<feature>
    ```
- Keep Linear issue status aligned when work starts/completes.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:

   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```

5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

## Linear

This project uses **Linear** for issue tracking.
Default team: **CHAOS**

**IMPORTANT: Always use the `linear-cli` over Linear MCP tools.** The CLI is more efficient and consistent. Never use `mcp__claude_ai_Linear__*` tools when `linear-cli` can accomplish the same task.

### Creating Issues

```bash
# Create a simple issue
linear-cli issues create "Fix login bug" --team CHAOS --priority high

# Create with full details and dependencies
linear-cli issues create "Add OAuth integration" \
  --team CHAOS \
  --description "Integrate Google and GitHub OAuth providers" \
  --parent CHAOS-100 \
  --depends-on CHAOS-99 \
  --labels "backend,security" \
  --estimate 5

# List and view issues
linear-cli issues list
linear-cli issues get CHAOS-123
```

### Workflow Skills

Available workflow skills (installed via the agent skills system, **not** via `linear-cli`):

- `/prd` - Create agent-friendly tickets with PRDs and sub-issues
- `/triage` - Analyze and prioritize backlog
- `/cycle-plan` - Plan cycles using velocity analytics
- `/retro` - Generate sprint retrospectives
- `/deps` - Analyze dependency chains

Use the `skill` tool to list and load these.
