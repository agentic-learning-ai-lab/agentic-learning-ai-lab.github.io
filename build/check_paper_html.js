#!/usr/bin/env node

/**
 * Fail when a paper's full-paper HTML is out of date with its LaTeX source.
 *
 * Every enable_full_paper paper whose LaTeX tarball is on R2 must have a
 * paper-content.json converted from that exact tarball by latexml-lab
 * (`npm run paper:html -- <slug>`). The tarball's manifest URL is content
 * hashed, so a new upload changes it and the recorded `latex_tarball` no
 * longer matches. Papers without a tarball keep arXiv's HTML and are not
 * checked here.
 *
 * Exits 0 when clean, 1 otherwise. Runs in CI and as pre-commit check 11.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');

function audit() {
  const papers = yaml.load(fs.readFileSync(path.join(ROOT, 'data/papers.yaml'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets-manifest.json'), 'utf8'));
  const problems = [];

  for (const paper of papers) {
    if (!paper.enable_full_paper) continue;
    const slug = paper.permalink;
    const tarball = manifest[`/research/${slug}/latex.tar.gz`];
    if (!tarball) continue;

    const file = path.join(ROOT, 'research', slug, 'paper-content.json');
    if (!fs.existsSync(file)) continue; // check_bibliography reports a missing file
    let pc;
    try {
      pc = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue; // and an unparseable one
    }

    if (pc.source !== 'latexml') {
      problems.push(`${slug}: HTML is from arXiv but its LaTeX source is on R2`);
    } else if (pc.latex_tarball !== tarball) {
      problems.push(`${slug}: LaTeX source changed since the HTML was built`);
    }
  }

  if (problems.length) {
    console.error('✗ Full-paper HTML out of date:');
    for (const p of problems) {
      const slug = p.split(':')[0];
      console.error(`   - ${p}\n     Fix: npm run paper:html -- ${slug}`);
    }
    return 1;
  }
  console.log('✓ Full-paper HTML matches its LaTeX source');
  return 0;
}

if (require.main === module) process.exit(audit());

module.exports = { audit };
