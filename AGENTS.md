# Agent Workflow

This repository uses two tracking layers:
- Local source of truth: `bd` (Beads) for feature/task/subtask planning.
- External collaboration: Linear (`fullchaos` workspace, `Script Manifest` project).

Use Beads first, then mirror work to Linear.

## Project Constants

```bash
export LINEAR_TEAM="CHAOS"
export LINEAR_PROJECT="Script Manifest"
export LINEAR_PROJECT_URL="https://linear.app/fullchaos/project/script-manifest-15384341055a"
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

## Linear: Create Issues with `linear` CLI

Authenticate and confirm status:

```bash
linear auth status
```

If not authenticated:

```bash
linear auth login
```

Initialize default team (once per clone):

```bash
linear init   # Select CHAOS team
```

Create a feature issue in the project:

```bash
linear i create "[Feature] <feature title>" \
  --team CHAOS \
  --project "Script Manifest" \
  --labels feature \
  --priority 2 \
  --description "Tracking in Beads: $FEATURE_ID"
```

Create task/subtask issues (use `--parent` for hierarchy):

```bash
linear i create "[Task] <task title>" \
  --team CHAOS \
  --project "Script Manifest" \
  --labels task \
  --parent CHAOS-<feature-number> \
  --description "Tracking in Beads: $TASK_ID"

linear i create "[Subtask] <subtask title>" \
  --team CHAOS \
  --project "Script Manifest" \
  --labels subtask \
  --parent CHAOS-<task-number> \
  --description "Tracking in Beads: $SUBTASK_ID"
```

Back-link Linear issue IDs into Beads:

```bash
bd update "$TASK_ID" --external-ref "CHAOS-<number>"
bd update "$SUBTASK_ID" --external-ref "CHAOS-<number>"
```

## Operating Rules

- Always create and structure work in Beads first (`feature -> task -> subtask`).
- Mirror work that needs team visibility into Linear issues.
- Add every mirrored issue to the `Script Manifest` project in Linear.
- **NEVER commit or push directly to `main`.** ALL changes go through feature branches + PRs.
  - This applies to every change, no matter how small — config files, one-liners, CI tweaks, everything.
  - Branch format: `codex/phase-<n>-<short-feature-slug>` (example: `codex/phase-1-writer-profiles`).
  - Create from latest default branch: `git fetch origin && git checkout main && git pull --ff-only`.
  - Create branch: `git checkout -b codex/phase-<n>-<short-feature-slug>`.
  - Keep all commits for that feature on its dedicated branch until merged.
  - Open a PR for review before merging.
- Keep status aligned in both systems when work starts/completes.
- Keep Beads IDs and Linear issue IDs cross-linked (`external-ref` + issue description).

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

## Linear

This project uses **Linear** for issue tracking.
Default team: **CHAOS**

### Creating Issues

```bash
# Create a simple issue
linear issues create "Fix login bug" --team CHAOS --priority high

# Create with full details and dependencies
linear issues create "Add OAuth integration" \
  --team CHAOS \
  --description "Integrate Google and GitHub OAuth providers" \
  --parent CHAOS-100 \
  --depends-on CHAOS-99 \
  --labels "backend,security" \
  --estimate 5

# List and view issues
linear issues list
linear issues get CHAOS-123
```

### Claude Code Skills

Available workflow skills (install with `linear skills install --all`):
- `/prd` - Create agent-friendly tickets with PRDs and sub-issues
- `/triage` - Analyze and prioritize backlog
- `/cycle-plan` - Plan cycles using velocity analytics
- `/retro` - Generate sprint retrospectives
- `/deps` - Analyze dependency chains

Run `linear skills list` for details.
