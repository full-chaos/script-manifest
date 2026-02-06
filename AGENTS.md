# Agent Workflow

This repository uses two tracking layers:
- Local source of truth: `bd` (Beads) for feature/task/subtask planning.
- External collaboration: GitHub Issues + GitHub Project (`full-chaos` Project `#2`).

Use Beads first, then mirror work to GitHub.

## Project Constants

Set these before issue operations:

```bash
export ORG="full-chaos"
export PROJECT_NUMBER="2"
export PROJECT_URL="https://github.com/orgs/full-chaos/projects/2"
export REPO="${REPO:-full-chaos/script-manifest}"
```

## Beads: Local Feature/Task/Subtask Database

Initialize once per clone:

```bash
bd init
bd status
```

Create hierarchy:

```bash
# 1) Feature
FEATURE_ID=$(bd create "Phase X: <feature title>" --type feature --priority 2 --silent)

# 2) Task under feature
TASK_ID=$(bd create "<task title>" --type task --parent "$FEATURE_ID" --priority 2 --silent)

# 3) Subtask under task (subtasks are task-type children)
SUBTASK_ID=$(bd create "<subtask title>" --type task --parent "$TASK_ID" --priority 3 --labels subtask --silent)
```

Dependency examples:

```bash
# <blocked-id> depends on <blocker-id>
bd dep add <blocked-id> <blocker-id>
bd dep tree "$FEATURE_ID"
```

Execution cadence:

```bash
bd ready
bd update <id> --status in_progress
bd close <id>
bd sync
```

## GitHub: Create Issues with `gh` and Add to Project #2

Authenticate and confirm scopes:

```bash
gh auth status
```

If project operations fail, refresh token scope:

```bash
gh auth refresh -s project
```

Create a feature issue, then add it to the org project:

```bash
FEATURE_ISSUE_URL=$(gh issue create \
  -R "$REPO" \
  --title "[Feature] <feature title>" \
  --label feature \
  --body $'Tracking in Beads: '"$FEATURE_ID"$'\nProject: '"$PROJECT_URL")

gh project item-add "$PROJECT_NUMBER" --owner "$ORG" --url "$FEATURE_ISSUE_URL"
```

Create task/subtask issues similarly:

```bash
TASK_ISSUE_URL=$(gh issue create \
  -R "$REPO" \
  --title "[Task] <task title>" \
  --label task \
  --body $'Tracking in Beads: '"$TASK_ID"$'\nParent Feature: '"$FEATURE_ID")

SUBTASK_ISSUE_URL=$(gh issue create \
  -R "$REPO" \
  --title "[Subtask] <subtask title>" \
  --label subtask \
  --body $'Tracking in Beads: '"$SUBTASK_ID"$'\nParent Task: '"$TASK_ID")

gh project item-add "$PROJECT_NUMBER" --owner "$ORG" --url "$TASK_ISSUE_URL"
gh project item-add "$PROJECT_NUMBER" --owner "$ORG" --url "$SUBTASK_ISSUE_URL"
```

Back-link GitHub issue numbers into Beads:

```bash
TASK_ISSUE_NUMBER=$(basename "$TASK_ISSUE_URL")
SUBTASK_ISSUE_NUMBER=$(basename "$SUBTASK_ISSUE_URL")

bd update "$TASK_ID" --external-ref "gh-$TASK_ISSUE_NUMBER"
bd update "$SUBTASK_ID" --external-ref "gh-$SUBTASK_ISSUE_NUMBER"
```

## Operating Rules

- Always create and structure work in Beads first (`feature -> task -> subtask`).
- Mirror work that needs team visibility into GitHub Issues.
- Add every mirrored issue to `full-chaos` Project `#2`.
- After Phase 0, create a new feature branch before implementation starts.
  - Branch format: `codex/phase-<n>-<short-feature-slug>` (example: `codex/phase-1-writer-profiles`).
  - Create from latest default branch: `git fetch origin && git checkout main && git pull --ff-only`.
  - Create branch: `git checkout -b codex/phase-<n>-<short-feature-slug>`.
  - Keep all commits for that feature on its dedicated branch until merged.
- Keep status aligned in both systems when work starts/completes.
- Keep Beads IDs and GitHub issue numbers cross-linked (`external-ref` + issue body).

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
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
