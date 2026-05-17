#!/usr/bin/env node

/**
 * Refresh a paper's LaTeX source from arXiv and republish it to R2.
 *
 *   arXiv e-print → research/<slug>/latex/ (transient) → clean → tar.gz → R2
 *
 * Then invalidates research/<slug>/paper.pdf so the next
 * `npm run build:arxiv:pdf` compiles a fresh PDF.
 *
 * Usage:
 *   node build/latex_update.js <slug>
 *
 * Author workflow when an arXiv version bumps:
 *   1. npm run latex:update <slug>
 *   2. npm run build:arxiv:pdf
 *   3. commit paper.pdf + assets-manifest.json
 */

const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

const { ROOT } = require('./r2_lib');
const { ensureLatexSource } = require('./build_arxiv_papers');
const { packOne } = require('./latex_pack');

const PAPERS_YAML = path.join(ROOT, 'data/papers.yaml');

async function readPaper(slug) {
  const papers = yaml.load(await fs.readFile(PAPERS_YAML, 'utf-8'));
  const p = papers.find(x => x.permalink === slug);
  if (!p) throw new Error(`No paper with permalink "${slug}" in data/papers.yaml`);
  return p;
}

async function updateOne(slug) {
  const paper = await readPaper(slug);
  if (!paper.arxiv) {
    throw new Error(
      `Paper "${slug}" has no arxiv URL. For a position paper, drop a tree at ` +
      `research/${slug}/latex/ and run latex:pack ${slug} instead.`
    );
  }

  const latexDir = path.join(ROOT, 'research', slug, 'latex');
  // Force re-fetch even if a local tree exists (author is explicitly
  // asking for an arXiv refresh — local state may be stale).
  if (await fs.pathExists(latexDir)) {
    console.log(`   ⤳  removing existing local research/${slug}/latex/ before re-fetch`);
    await fs.remove(latexDir);
  }

  console.log(`⬇️  ${slug}: fetching from arXiv (${paper.arxiv})`);
  await ensureLatexSource(paper.arxiv, latexDir, { force: true });

  // packOne re-cleans (idempotent), tars, uploads, updates manifest, deletes local.
  const result = await packOne(slug);
  console.log(`✅  ${slug}: published ${result.cdnUrl}`);

  // Invalidate the compiled PDF so the next build recompiles from the new source.
  const pdfPath = path.join(ROOT, 'research', slug, 'paper.pdf');
  if (await fs.pathExists(pdfPath)) {
    await fs.remove(pdfPath);
    console.log(`   🗑️  ${slug}: removed research/${slug}/paper.pdf (next build will recompile)`);
  }
  // Also drop the gs-compressed marker so compress runs again post-recompile.
  await fs.remove(pdfPath + '.gs-compressed').catch(() => {});
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith('-')) {
    console.error('Usage: latex:update <slug>');
    process.exit(1);
  }
  await updateOne(args[0]);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Update failed:', err.message);
    process.exit(1);
  });
}

module.exports = { updateOne };
