#!/usr/bin/env bash
# update-cli.sh — Check and update @anthropic-ai/claude-code in package/

set -euo pipefail

PACKAGE_JSON="$(dirname "$0")/package/package.json"

# --- Read current version ---
if [[ ! -f "$PACKAGE_JSON" ]]; then
  echo "Error: $PACKAGE_JSON not found."
  exit 1
fi

CURRENT=$(node -e "console.log(require('$PACKAGE_JSON').version)" 2>/dev/null)
if [[ -z "$CURRENT" ]]; then
  echo "Error: Could not read version from $PACKAGE_JSON"
  exit 1
fi

echo "Current version : $CURRENT"
echo -n "Checking latest version on npm..."

LATEST=$(npm show @anthropic-ai/claude-code version 2>/dev/null)
if [[ -z "$LATEST" ]]; then
  echo ""
  echo "Error: Could not reach npm registry."
  exit 1
fi

echo " $LATEST"

# --- Compare ---
if [[ "$CURRENT" == "$LATEST" ]]; then
  echo "Already up to date."
  exit 0
fi

echo ""
echo "New version available: $CURRENT → $LATEST"
read -r -p "Update package/ to v$LATEST? [y/N] " answer

case "$answer" in
  [yY]|[yY][eE][sS])
    ;;
  *)
    echo "Skipped."
    exit 0
    ;;
esac

# --- Download & extract ---
TARBALL="anthropic-ai-claude-code-${LATEST}.tgz"
PACKAGE_DIR="$(dirname "$0")/package"

echo "Downloading v$LATEST..."
npm pack "@anthropic-ai/claude-code@$LATEST" --quiet

echo "Extracting into package/..."
# npm pack extracts into a 'package/' subdirectory inside the tarball
# We extract to a temp dir then move to the target
TMP_DIR=$(mktemp -d)
tar -xzf "$TARBALL" -C "$TMP_DIR"

# Replace package/ contents
rm -rf "$PACKAGE_DIR"
mv "$TMP_DIR/package" "$PACKAGE_DIR"
rm -rf "$TMP_DIR" "$TARBALL"

NEW_VER=$(node -e "console.log(require('$PACKAGE_JSON').version)" 2>/dev/null)
echo ""
echo "Updated: $CURRENT → $NEW_VER"
