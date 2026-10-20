#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

git config --global user.name "Schwarz Rene"
git config --global user.email "123473580+SchwarzRene@users.noreply.github.com"
