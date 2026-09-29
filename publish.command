#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

echo "========================================"
echo "  Publish to GitHub Pages"
echo "========================================"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required. Install it with: brew install gh"
  read -r -p "Press Enter to close..."
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Please sign in to GitHub first by running: gh auth login"
  read -r -p "Press Enter to close..."
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "This folder is not a Git repository."
  read -r -p "Press Enter to close..."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Uncommitted changes will be included in the public repository."
  read -r -p "Type COMMIT to stage and commit all changes: " confirmation
  if [[ "$confirmation" != "COMMIT" ]]; then
    echo "Cancelled."
    read -r -p "Press Enter to close..."
    exit 1
  fi
  git add -A
  if ! git diff --cached --quiet; then
    git commit -m "Publish to GitHub Pages"
  fi
fi

if git remote get-url origin >/dev/null 2>&1; then
  repo_slug="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
  is_private="$(gh repo view --json isPrivate --jq .isPrivate)"
  if [[ "$is_private" == "true" ]]; then
    echo "The existing repository $repo_slug is private."
    read -r -p "Type PUBLIC to make it public and continue: " confirmation
    if [[ "$confirmation" != "PUBLIC" ]]; then
      echo "Cancelled."
      read -r -p "Press Enter to close..."
      exit 1
    fi
    gh repo edit --visibility public --accept-visibility-change-consequences
  fi
else
  default_name="$(basename "$PWD")"
  read -r -p "GitHub repository name [$default_name]: " repo_name
  repo_name="${repo_name:-$default_name}"
  gh repo create "$repo_name" --public --source . --remote origin --push
  repo_slug="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
fi

echo "Enabling GitHub Pages for $repo_slug..."
if ! gh api --method POST "repos/$repo_slug/pages" --field build_type=workflow >/dev/null 2>&1; then
  gh api --method PUT "repos/$repo_slug/pages" --field build_type=workflow >/dev/null
fi

git push -u origin HEAD

site_url="https://$(cut -d/ -f1 <<< "$repo_slug").github.io/$(cut -d/ -f2 <<< "$repo_slug")/"
echo
echo "Published source to https://github.com/$repo_slug"
echo "GitHub Pages is building. Your public site will be at:"
echo "$site_url"
echo "The first deployment usually takes a few minutes."
read -r -p "Press Enter to close..."