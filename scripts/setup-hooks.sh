#!/usr/bin/env bash
# setup-hooks.sh: enable the repo's shared git hooks for the current clone
# and any existing worktrees.
#
# Run once after cloning, and once per new worktree.
#
# What it does:
#   1. Points git at .githooks/ for hook resolution (instead of .git/hooks/).
#   2. Switches push.default to `current`, so `git push` always targets a
#      same-named branch on the remote and never the tracked upstream
#      (defends against worktrees created with `-b <branch> origin/main`,
#      see CHAOS-1006).
#   3. Makes hook scripts executable.

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [ ! -d .githooks ]; then
    echo "error: .githooks/ not found in $repo_root" >&2
    exit 1
fi

chmod +x .githooks/* 2>/dev/null || true

git config core.hooksPath .githooks
git config push.default current

cat <<EOF
[setup-hooks] OK
  core.hooksPath  = $(git config --get core.hooksPath)
  push.default    = $(git config --get push.default)

Active hooks:
$(ls -1 .githooks | sed 's/^/  - /')

Re-run this script after creating each new worktree:
    git worktree add ../script-manifest-<feature> -b <branch> origin/main
    cd ../script-manifest-<feature>
    scripts/setup-hooks.sh
EOF
