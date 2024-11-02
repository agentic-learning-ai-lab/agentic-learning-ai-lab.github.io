#!/bin/bash
set -e # exit with nonzero exit code if anything fails

npm run build-in-place

mkdir -p out/styles/
cp index.html index.js out/
cp people.html out/
cp research.html research.js out/
cp -R assets css out/

echo ""
find out/ -print
echo ""
