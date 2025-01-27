#!/bin/bash
set -e # exit with nonzero exit code if anything fails

# npm run build-in-place
npm run build

find . -name ".DS_Store" -depth -exec rm {} \;
# rm -rf out
mkdir -p out
cp index.html index.js out/
cp -R people out/
cp -R research research.js out/
cp -R contact out/
cp -R assets css out/

echo ""
find out/ -print
echo ""
