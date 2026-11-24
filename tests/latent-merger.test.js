'use strict';
// Run after npm run build:cf. Regression coverage for PR review findings.
const assert = require('assert');
const fs = require('fs');
const yaml = require('js-yaml');
const papers = yaml.safeLoad(fs.readFileSync('data/papers.yaml', 'utf8'));
const paper = papers.find(p => p.permalink === 'latent-merger');
assert(paper.tags.length > 0);
assert(!paper.research_areas);
for (const tag of paper.tags) {
  assert(fs.readFileSync(`out/tags/${tag}/index.html`, 'utf8').includes('latent-merger'));
}
const page = fs.readFileSync('out/latent-merger/index.html', 'utf8');
const manifest = JSON.parse(fs.readFileSync('assets-manifest.json', 'utf8'));
const reader = fs.readFileSync('out/research/latent-merger/index.html', 'utf8');
const pdf = manifest['/research/latent-merger/paper.pdf'];
assert(pdf && reader.includes(pdf) && page.includes(pdf), 'Project and reader must use the rebuilt paper PDF');
for (const ext of ['png', 'webp']) {
  const url = manifest[`/assets/projects/latent-merger/method-overview.${ext}`];
  assert(url && page.includes(url), `Missing CDN diagram ${ext}`);
}
console.log('Latent Merger: built tag listings and CDN diagram passed.');
