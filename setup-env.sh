#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
export PATH="$SCRIPT_DIR/.tools/node:$PATH"
echo "Added $SCRIPT_DIR/.tools/node to PATH for this session."
node --version
npm --version
