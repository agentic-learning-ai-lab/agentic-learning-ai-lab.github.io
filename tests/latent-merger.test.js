'use strict';
// Run after npm run build:cf. Regression coverage for PR review findings.
const assert = require('assert');
const fs = require('fs');
const yaml = require('js-yaml');
const postcss = require('postcss');
const papers = yaml.safeLoad(fs.readFileSync('data/papers.yaml', 'utf8'));
const paper = papers.find(p => p.permalink === 'latent-merger');
assert(paper.tags.length > 0);
assert(!paper.research_areas);
for (const tag of paper.tags) {
  assert(fs.readFileSync(`out/tags/${tag}/index.html`, 'utf8').includes('latent-merger'));
}
const page = fs.readFileSync('out/latent-merger/index.html', 'utf8');
const manifest = JSON.parse(fs.readFileSync('assets-manifest.json', 'utf8'));
for (const ext of ['png', 'webp']) {
  const url = manifest[`/assets/projects/latent-merger/method-overview.${ext}`];
  assert(url && page.includes(url), `Missing CDN diagram ${ext}`);
}
const css = postcss.parse(fs.readFileSync('css/index.css', 'utf8'));
const expected = {
  '.lm-results': {color: 'var(--fg)', background: 'var(--bg)'},
  '.lm-results caption': {color: 'var(--fg)', background: 'var(--card-bg)'},
  '.lm-results thead': {color: 'var(--fg)', background: 'var(--card-bg)'},
  '.lm-results .lm-ours': {color: 'var(--fg)', background: 'var(--accent-soft)'},
};
for (const [selector, properties] of Object.entries(expected)) {
  const actual = {};
  css.walkRules(selector, rule => rule.walkDecls(d => actual[d.prop] = d.value));
  for (const [property, value] of Object.entries(properties)) assert.equal(actual[property], value, `${selector} ${property}`);
}
console.log('Latent Merger: theme-aware tables, built tag listings, and CDN diagram passed.');
