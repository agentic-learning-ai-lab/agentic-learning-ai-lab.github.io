#!/usr/bin/env node

/**
 * Strip author comments from a paper's LaTeX source.
 *
 * For papers fetched from arXiv this runs automatically inside
 * ensureLatexSource() in build_arxiv_papers.js. This CLI is for
 * position papers (no arxiv URL, source dropped in by hand) — author
 * runs it once before committing.
 *
 * Usage:
 *   npm run latex:clean -- <slug>
 *   npm run latex:clean -- <path-to-latex-dir>
 *
 * Examples:
 *   npm run latex:clean -- conceptual-creativity
 *   npm run latex:clean -- research/conceptual-creativity/latex
 *
 * See cleanLatexSource() in build_arxiv_papers.js for the why and what.
 */

const fs = require('fs-extra');
const path = require('path');
const { cleanLatexSource } = require('./build_arxiv_papers.js');

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
