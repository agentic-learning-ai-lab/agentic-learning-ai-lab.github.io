const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/**
 * File name an asset gets on R2 (the URL is <hash>/<name>), so a
 * download is named for what it is:
 *   research/<slug>/paper.pdf      → <slug>-<year>.pdf  (year from papers.yaml)
 *   research/<slug>/latex.tar.gz   → <slug>.tar.gz
 * Everything else keeps its own name.
 */
let paperYears = null;
function cdnBasename(relPath) {
  const rel = relPath.replace(/^\//, '').split(path.sep).join('/');
  let m = rel.match(/^research\/([^/]+)\/paper\.pdf$/);
  if (m) {
    if (!paperYears) {
      const yaml = require('js-yaml');
      paperYears = {};
      for (const p of yaml.load(fs.readFileSync(path.join(ROOT, 'data/papers.yaml'), 'utf8'))) {
        const y = new Date(p.date).getUTCFullYear();
        if (p.permalink && y) paperYears[p.permalink] = y;
      }
    }
    return paperYears[m[1]] ? `${m[1]}-${paperYears[m[1]]}.pdf` : `${m[1]}.pdf`;
  }
  m = rel.match(/^research\/([^/]+)\/latex\.tar\.gz$/);
  if (m) return `${m[1]}.tar.gz`;
  return path.basename(rel);
}

module.exports = { cdnBasename };
