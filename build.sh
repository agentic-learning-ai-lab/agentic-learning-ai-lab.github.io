#!/bin/bash
# Build wrapper used by ./deploy.sh staging. Delegates to `npm run build`,
# which now includes build:assemble as its final step — so out/ contains
# the deployable bundle after this exits.
#
# Kept as a separate script (rather than calling npm run build from
# deploy.sh directly) for the .DS_Store cleanup, which is convenient on
# macOS authors' working copies.

set -e

npm run build

find . -name ".DS_Store" -depth -exec rm {} \;

echo ""
find out/ -print
echo ""
