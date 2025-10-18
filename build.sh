#!/bin/bash
set -e # exit with nonzero exit code if anything fails

# npm run build-in-place
npm run build

find . -name ".DS_Store" -depth -exec rm {} \;
# rm -rf out
mkdir -p out
cp index.html index.js search.js person.js paper-view.js out/
cp site.webmanifest favicon.ico out/
cp -R people out/
cp -R research research.js out/
cp -R contact out/
cp -R assets out/
cp -R css out/
cp -R areas out/

echo ""
find out/ -print
echo ""
