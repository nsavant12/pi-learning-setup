#!/usr/bin/env bash
# Publish the prepared repository using your normal GitHub CLI sign-in.
set -euo pipefail
repo_dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
cd "$repo_dir"
repository=${1:-nsavant12/pi-learning-setup}
if [[ ! "$repository" =~ ^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$ ]]; then
    echo 'Use an owner/repository name, such as nsavant12/pi-learning-setup.' >&2
    exit 1
fi
command -v gh >/dev/null
if ! gh auth status >/dev/null 2>&1; then
    gh auth login --hostname github.com --git-protocol https --web
fi
if [[ ! -d .git ]]; then
    echo 'The prepared local Git repository is missing. Initialize and review it before publishing.' >&2
    exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet || [[ -n $(git ls-files --others --exclude-standard) ]]; then
    echo 'The repository has uncommitted files. Review and commit them before publishing.' >&2
    exit 1
fi
if gh repo view "$repository" --json name >/dev/null 2>&1; then
    existing_origin=$(git remote get-url origin 2>/dev/null || true)
    expected_origin="https://github.com/$repository.git"
    if [[ -n "$existing_origin" && "$existing_origin" != "$expected_origin" ]]; then
        echo "The existing origin points elsewhere: $existing_origin" >&2
        exit 1
    fi
    if [[ -z "$existing_origin" ]]; then
        git remote add origin "$expected_origin"
    fi
    gh auth setup-git
    git push -u origin main
else
    gh repo create "$repository" --private --source . --remote origin --push \
        --description 'Portable Pi learning harness with Obsidian concept notes, local subagents, visuals, and terminal math'
fi
gh repo view "$repository" --json url --jq .url
