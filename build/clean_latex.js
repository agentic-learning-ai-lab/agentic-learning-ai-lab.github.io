#!/usr/bin/env node

/**
 * Strip author comments from a paper's LaTeX source.
 *
 * Almost never run directly — `latex:pack` and `latex:update` both call
 * cleanLatexSource() before tarring, which is the actual privacy
 * boundary. This CLI is a hand-tool for inspecting cleaning behavior on
 * a dropped-in tree without going through the upload flow.
 *
 * Usage:
 *   npm run latex:clean -- <slug>
 *   npm run latex:clean -- <path-to-latex-dir>
 *
 * See cleanLatexSource() in build/latex_lib.js for the why and what.
 */

const fs = require('fs-extra');
const path = require('path');
const { cleanLatexSource } = require('./latex_lib.js');

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node build/clean_latex.js <slug-or-path>');
    process.exit(1);
  }

  // Treat as slug if it doesn't contain a path separator AND doesn't exist as a dir on disk.
  let latexDir;
  if (arg.includes('/') || arg.includes(path.sep)) {
    latexDir = path.resolve(arg);
  } else {
    latexDir = path.resolve(__dirname, '..', 'research', arg, 'latex');
  }

  if (!await fs.pathExists(latexDir)) {
    console.error(`No LaTeX dir at ${latexDir}`);
    process.exit(1);
  }

  await cleanLatexSource(latexDir);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
