#!/usr/bin/env bash
# new-worktree.sh: create a feature worktree with the correct upstream tracking.
#
# Usage:
#   scripts/new-worktree.sh <branch-name> [base-ref]
#
# Example:
#   scripts/new-worktree.sh feat/CHAOS-123-thing
#   scripts/new-worktree.sh fix/CHAOS-456-bug origin/main
#
# What it does (vs. the raw `git worktree add` recipe):
#   1. Creates the worktree at ../script-manifest-<sanitized-branch-name>.
#   2. Branches from origin/main (or the explicit base-ref).
#   3. Explicitly clears the upstream so plain `git push` cannot target
#      origin/main from this worktree (see CHAOS-1006).
#   4. Runs scripts/setup-hooks.sh inside the new worktree so the shared
#      pre-push protection is active immediately.

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "usage: $0 <branch-name> [base-ref]" >&2
    exit 2
fi

branch="$1"
base_ref="${2:-origin/main}"

# Sanitize branch name into a directory suffix (replace / with -).
dir_suffix="$(printf '%s' "$branch" | tr '/' '-')"
repo_root="$(git rev-parse --show-toplevel)"
parent_dir="$(dirname "$repo_root")"
repo_name="$(basename "$repo_root")"
worktree_path="$parent_dir/${repo_name}-${dir_suffix}"

if [ -e "$worktree_path" ]; then
    echo "error: $worktree_path already exists" >&2
    exit 1
fi

echo "[new-worktree] fetching origin..."
git fetch origin

echo "[new-worktree] creating worktree at $worktree_path on branch $branch (from $base_ref)"
git worktree add "$worktree_path" -b "$branch" "$base_ref"

cd "$worktree_path"

# Belt and suspenders: explicitly unset the upstream so `git push` (with
# any push.default) cannot accidentally target origin/main. Push must be
# explicit (`git push origin HEAD:refs/heads/<branch>` or `gh pr create`).
git branch --unset-upstream "$branch" 2>/dev/null || true

# Activate shared hooks + push.default=current in this worktree.
if [ -x scripts/setup-hooks.sh ]; then
    scripts/setup-hooks.sh
else
    echo "[new-worktree] warning: scripts/setup-hooks.sh not executable; run it manually" >&2
fi

cat <<EOF

[new-worktree] OK
  worktree:     $worktree_path
  branch:       $branch
  base:         $base_ref
  upstream:     <unset>  (push must be explicit; pre-push hook also enforced)

Next steps:
    cd $worktree_path
    # ... make changes, commit ...
    gh pr create --head $branch --base main --title "..." --body "..."
EOF
