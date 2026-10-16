#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

state_file=".cache/post-merge/npm-dependencies.sha256"
dependency_hash="$(
  {
    sha256sum package.json package-lock.json
    find artifacts lib scripts -type f -name package.json \
      -not -path '*/node_modules/*' \
      -not -path '*/.next*/*' \
      -print0 | sort -z | xargs -0 -r sha256sum
  } | sha256sum | awk '{ print $1 }'
)"

if [[ ! -x node_modules/.bin/next ||
      ! -x node_modules/.bin/tsc ||
      ! -f "$state_file" ||
      "$(cat "$state_file")" != "$dependency_hash" ]]; then
  npm ci --no-audit --no-fund --prefer-offline
  mkdir -p "$(dirname "$state_file")"
  printf '%s\n' "$dependency_hash" > "$state_file"
fi
