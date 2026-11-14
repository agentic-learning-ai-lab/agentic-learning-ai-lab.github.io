#!/usr/bin/env node

/**
 * Fail when a paper's full-paper HTML is out of date with its LaTeX source.
 *
 * Every enable_full_paper paper whose LaTeX tarball is on R2 must have a
 * paper-content.json converted from that exact tarball by latexml-lab
 * (`npm run paper:build -- <slug>`). The tarball's manifest URL is content
 * hashed, so a new upload changes it and the recorded `latex_tarball` no
 * longer matches. Likewise paper.pdf must be the one CI compiled from that
 * tarball (`pdf_sha256`), unless papers.yaml sets `pdf_override:` or a
 * Zenodo `doi:`. Papers without a tarball keep arXiv's HTML and are not
 * checked here.
 *
 * Exits 0 when clean, 1 otherwise. Runs in CI and as pre-commit check 11.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const { zenodoId } = require('./pdf_lock');

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
    } else if (!paper.pdf_override && !(zenodoId(paper) && pc.pdf_frozen === paper.doi)) {
      // The PDF must be the one CI compiled from this tarball. A published
      // Zenodo report's PDF is frozen for its DOI (pdf_frozen) and checked
      // against Zenodo instead (check_zenodo_pdfs.js); a new DOI from
      // tr:revise, or a reserved draft, is checked here like any paper.
      const pdf = manifest[`/research/${slug}/paper.pdf`] || '';
      if (!pc.pdf_sha256) {
        problems.push(`${slug}: no CI-built PDF recorded for this source`);
      } else if (!pdf.includes(`/${pc.pdf_sha256.slice(0, 16)}/`)) {
        problems.push(`${slug}: paper.pdf on R2 is not the PDF CI built from this source`);
      }
    }
  }

  if (problems.length) {
    console.error('✗ Full-paper HTML or PDF out of date:');
    for (const p of problems) {
      const slug = p.split(':')[0];
      console.error(`   - ${p}\n     Fix: npm run paper:build -- ${slug} && npm run upload`);
    }
    return 1;
  }
  console.log('✓ Full-paper HTML and PDF match their LaTeX source');
  return 0;
}

if (require.main === module) process.exit(audit());

module.exports = { audit };
