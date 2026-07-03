#!/usr/bin/env node

/**
 * Build script: ingest arXiv HTML for the "Full Paper" view, and compile
 * PDFs from LaTeX source that lives as tar.gz on R2 (see
 * notes/latex-tarball-storage.md).
 *
 * HTML path: downloads from arxiv.org/html (with ar5iv fallback),
 * extracts, fixes citation/image paths, writes paper-content.json.
 *
 * PDF path: outer skip on research/<slug>/paper.pdf existing (CI hits
 * this 99% of the time). When recompile is needed, resolves source via
 * resolveLatexSourceForCompile():
 *   1. local research/<slug>/latex/ (gitignored, present mid-edit)
 *   2. R2 tarball via assets-manifest.json (downloaded + extracted to
 *      .cache/latex-build/<slug>/)
 *   3. otherwise, prints a hint to run `npm run latex:update <slug>`.
 *
 * Bootstrap (first-time fetch from arXiv) and re-publish (after edits)
 * are explicit author actions in latex_update.js / latex_pack.js — the
 * build never auto-fetches from arXiv or auto-writes to R2.
 *
 * Usage:
 *   node build/build_arxiv_papers.js              # HTML only
 *   node build/build_arxiv_papers.js --pdf        # HTML + recompile any missing PDFs
 *   node build/build_arxiv_papers.js --force      # Force re-download HTML
 *   node build/build_arxiv_papers.js --pdf --force # Recompile every PDF (downloads
 *                                                   # every tarball from CDN — slow,
 *                                                   # rarely useful in CI)
 *
 * Requirements for PDF compilation:
 *   - latexmk (with pdflatex / xelatex / lualatex backends) installed
 *   - qpdf for post-compile PDF compression + deterministic finalization
 */

const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const https = require('https');
const crypto = require('crypto');
const { promisify } = require('util');

const execAsync = promisify(require('child_process').exec);

const {
  cleanLatexSource,
  findMainTexFile,
  manifestKey,
} = require('./latex_lib');

// Configuration
const PAPERS_YAML = path.join(__dirname, '../data/papers.yaml');
const OUTPUT_DIR = path.join(__dirname, '../research');
const ARXIV_HTML_BASE = 'https://arxiv.org/html/';
const ARXIV_ASSETS_BASE = 'https://arxiv.org/html/';

// Temp compile workdir when source comes from an R2 tarball. Stays out of
// git; `npm run latex:fetch` extracts to research/<slug>/latex/ (also
// gitignored) when the author wants the source persistent for editing.
const COMPILE_CACHE = path.join(__dirname, '..', '.cache', 'latex-build');

/**
 * Download HTML from a URL with retry logic
 */
function downloadHtml(url, retries = 3, delay = 1000) {
  return new Promise((resolve, reject) => {
    const attemptDownload = (attemptsLeft) => {
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          downloadHtml(response.headers.location, retries, delay).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          const error = new Error(`Failed to download: ${response.statusCode}`);
          if (attemptsLeft > 0) {
            console.warn(`  Retrying... (${attemptsLeft} attempts left)`);
            setTimeout(() => attemptDownload(attemptsLeft - 1), delay);
          } else {
            reject(error);
          }
          return;
        }

        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          resolve(data);
        });
      }).on('error', (err) => {
        if (attemptsLeft > 0) {
          console.warn(`  Network error, retrying... (${attemptsLeft} attempts left): ${err.message}`);
          setTimeout(() => attemptDownload(attemptsLeft - 1), delay);
        } else {
          reject(err);
        }
      });
    };

    attemptDownload(retries);
  });
}

/**
 * Download a binary file (like images) with retry logic
 */
function downloadFile(url, outputPath, retries = 3, delay = 1000) {
  return new Promise((resolve, reject) => {
    const attemptDownload = (attemptsLeft) => {
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // arXiv now returns a relative-path Location (e.g., /src/2606.32026).
          // Resolve against the request URL so https.get gets a full URL.
          const nextUrl = new URL(response.headers.location, url).toString();
          downloadFile(nextUrl, outputPath, retries, delay).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          const error = new Error(`Failed to download: ${response.statusCode}`);
          if (attemptsLeft > 0) {
            console.warn(`  Retrying ${path.basename(outputPath)}... (${attemptsLeft} attempts left)`);
            setTimeout(() => attemptDownload(attemptsLeft - 1), delay);
          } else {
            reject(error);
          }
          return;
        }

        const fileStream = fs.createWriteStream(outputPath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', (err) => {
          fs.unlink(outputPath, () => {
            if (attemptsLeft > 0) {
              console.warn(`  File write error, retrying ${path.basename(outputPath)}... (${attemptsLeft} attempts left)`);
              setTimeout(() => attemptDownload(attemptsLeft - 1), delay);
            } else {
              reject(err);
            }
          });
        });
      }).on('error', (err) => {
        if (attemptsLeft > 0) {
          console.warn(`  Network error, retrying ${path.basename(outputPath)}... (${attemptsLeft} attempts left): ${err.message}`);
          setTimeout(() => attemptDownload(attemptsLeft - 1), delay);
        } else {
          reject(err);
        }
      });
    };

    attemptDownload(retries);
  });
}

/**
 * Extract arXiv ID from URL or string
 */
function extractArxivId(arxivUrl) {
  const match = arxivUrl.match(/(\d{4}\.\d{4,5})/);
  return match ? match[1] : null;
}

/**
 * Download and process arXiv HTML paper
 * @param {string} arxivUrl - arXiv URL or ID
 * @param {string} outputPath - Where to save the processed HTML
 */
async function downloadArxivHtml(arxivUrl, outputPath) {
  const arxivId = extractArxivId(arxivUrl);

  if (!arxivId) {
    throw new Error(`Could not extract arXiv ID from ${arxivUrl}`);
  }

  // Try experimental arXiv first, fall back to ar5iv if it fails
  let html;
  let source = 'arxiv-experimental';
  let useAr5iv = false;

  try {
    const experimentalUrl = `${ARXIV_HTML_BASE}${arxivId}`;
    html = await downloadHtml(experimentalUrl);
  } catch (error) {
    // If experimental arXiv fails, try ar5iv as fallback
    console.log(`  Experimental arXiv failed, trying ar5iv fallback...`);
    try {
      const ar5ivUrl = `https://ar5iv.labs.arxiv.org/html/${arxivId}`;
      html = await downloadHtml(ar5ivUrl);
      source = 'ar5iv';
      useAr5iv = true;
    } catch (ar5ivError) {
      throw new Error(`Both experimental arXiv and ar5iv failed: ${error.message}`);
    }
  }

  try {

    // Extract the main article content
    const articleMatch = html.match(/<article[^>]*class="ltx_document[^"]*"[^>]*>([\s\S]*?)<\/article>/);

    if (!articleMatch) {
      throw new Error('Could not find article content in arXiv HTML');
    }

    let content = articleMatch[1];

    // Remove navigation and other elements we don't want
    content = content.replace(/<nav[^>]*class="ltx_page_navbar"[^>]*>[\s\S]*?<\/nav>/g, '');
    content = content.replace(/<div[^>]*class="ltx_page_logo"[^>]*>[\s\S]*?<\/div>/g, '');
    content = content.replace(/<footer[^>]*>[\s\S]*?<\/footer>/g, '');

    // Remove everything before the first section (title, authors, abstract, metadata)
    // Keep only the main content starting from first section
    const firstSectionMatch = content.match(/(<section[^>]*class="ltx_section[^"]*"[^>]*>)/);
    if (firstSectionMatch) {
      const firstSectionIndex = content.indexOf(firstSectionMatch[0]);
      content = content.substring(firstSectionIndex);
    }

    // Download images and update paths
    const assetsDir = path.join(path.dirname(outputPath), 'assets');
    await fs.ensureDir(assetsDir);

    // Find all image references
    // Experimental arXiv uses simple filenames (x1.png), ar5iv uses full paths (/html/.../assets/x.png)
    let imageRegex, images = [];
    let match;

    if (useAr5iv) {
      // ar5iv format: /html/{arxiv_id}/assets/{filename}
      imageRegex = /src="\/html\/(\d{4}\.\d{4,5})\/assets\/([^"]+)"/g;
      while ((match = imageRegex.exec(content)) !== null) {
        images.push({
          arxivId: match[1],
          filename: match[2],
          fullMatch: match[0]
        });
      }
    } else {
      // Experimental arXiv format: filenames like x1.png or paths like 2603.12231v1/x1.png
      // Extract version from base tag
      const baseMatch = html.match(/<base\s+href="\/html\/(\d{4}\.\d{4,5}v\d+)\/"/);
      let versionedId = baseMatch ? baseMatch[1] : null;

      // Match both simple filenames (x1.png) and paths with subdirectories (2603.12231v1/images/foo.png)
      imageRegex = /src="([^"]+\.(?:png|jpg|jpeg|gif|svg))"/gi;
      while ((match = imageRegex.exec(content)) !== null) {
        let filename = match[1];
        // Strip any versioned ID prefix (e.g., "2603.12231v2/x1.png" -> "x1.png")
        // and detect the version from the path if we don't have it from <base>
        const versionMatch = filename.match(/^(\d{4}\.\d{4,5}v\d+)\//);
        if (versionMatch) {
          if (!versionedId) {
            versionedId = versionMatch[1];
          }
          filename = filename.substring(versionMatch[0].length);
        }
        images.push({
          versionedId: versionedId,
          filename: filename,
          originalSrc: match[1],
          fullMatch: match[0]
        });
      }

      // Fallback if no version found anywhere
      if (!versionedId) {
        versionedId = `${arxivId}v1`;
      }
    }

    // Download each unique image
    const downloadedImages = new Set();
    for (const img of images) {
      if (downloadedImages.has(img.filename)) continue;

      // Construct the full image URL based on source
      let imageUrl;
      if (useAr5iv) {
        imageUrl = `https://ar5iv.labs.arxiv.org/html/${img.arxivId}/assets/${img.filename}`;
      } else {
        imageUrl = `${ARXIV_ASSETS_BASE}${img.versionedId}/${img.filename}`;
      }

      const localPath = path.join(assetsDir, img.filename);

      try {
        // Ensure the subdirectory exists for nested paths (e.g., figs/image.png)
        await fs.ensureDir(path.dirname(localPath));
        await downloadFile(imageUrl, localPath);
        downloadedImages.add(img.filename);
      } catch (err) {
        console.warn(`  Warning: Failed to download image ${img.filename}: ${err.message}`);
      }
    }

    // Update image paths to point to local assets
    if (useAr5iv) {
      content = content.replace(/src="\/html\/\d{4}\.\d{4,5}\/assets\/([^"]+)"/g,
        'src="./assets/$1"');
    } else {
      // Replace all image src paths, stripping any versioned ID prefix
      for (const img of images) {
        if (img.originalSrc !== `./assets/${img.filename}`) {
          content = content.split(`src="${img.originalSrc}"`).join(`src="./assets/${img.filename}"`);
        }
      }
    }

    // Fix double commas in citations (common in experimental arXiv HTML)
    content = content.replace(/,,\s*/g, ', ');

    // Convert all arXiv URLs with anchors to relative anchor links
    // e.g., https://arxiv.org/html/2510.05558v1#bib.bib23 -> #bib.bib23
    content = content.replace(/href="https:\/\/arxiv\.org\/html\/[^"]*?(#[^"]*)"/g, 'href="$1"');

    // Normalize citation links: move author names outside of <a> tags
    // Convert: <a>Author et al., Year</a> -> Author et al., <a>Year</a>
    content = content.replace(/<a class="ltx_ref" href="([^"]*)"[^>]*>([^<,]+,\s*)(\d{4}[a-z]?)(,?\s*)<\/a>/g,
      '$2<a class="ltx_ref" href="$1" title="">$3</a>$4');

    // Clean up trailing comma-space before closing parenthesis in citations
    content = content.replace(/,\s+\)/g, ')');

    // Clean up comma-space-semicolon pattern in citations
    content = content.replace(/,\s+;/g, ';');

    // Clean up double comma pattern in cite blocks (especially in tables)
    // Pattern: "Author et al.,<span>, </span><a>year</a>" -> "Author et al., <a>year</a>"
    content = content.replace(/,<span class="ltx_text"[^>]*>,\s*<\/span>/g, ', ');

    // Remove LaTeX table formatting macros that failed to render (like \rowcolor)
    content = content.replace(/<span class="ltx_ERROR undefined">\\rowcolor<\/span>/g, '');
    content = content.replace(/<span class="ltx_ERROR undefined">\\[a-zA-Z]+<\/span>/g, '');

    // Remove [HTML]colorcode patterns that appear in table cells (leftover from \rowcolor)
    content = content.replace(/\[HTML\][a-fA-F0-9]{6}/g, '');

    // Extract inline styles if any
    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
    const styles = styleMatch ? styleMatch.join('\n') : '';

    // Create the output object
    const output = {
      html: content.trim(),
      css: styles,
      arxiv_id: arxivId,
      source: source,
      generated: new Date().toISOString()
    };

    // Ensure output directory exists
    await fs.ensureDir(path.dirname(outputPath));

    // Save the extracted content as JSON
    await fs.writeJson(outputPath, output, { spaces: 2 });

  } catch (error) {
    console.error(`Failed to download arXiv HTML: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch LaTeX source for a paper from arXiv into latexDir.
 *
 * This is the *only* arXiv ingest path. It is called from latex_update.js
 * (author-driven refresh), not from the build — the build resolves
 * source from R2 instead. See notes/latex-tarball-storage.md.
 *
 * For the common tar/gzip e-print path, cleans author comments before
 * returning. For the rare "arXiv served a single .tex" case, the file is
 * renamed to main.tex and returned uncleaned — but that's safe because
 * the caller (latex_update → packOne) always re-cleans before tarring.
 * The privacy boundary lives in packOne, not here.
 *
 * @param {string} arxivUrl
 * @param {string} latexDir - Where to extract (typically research/<slug>/latex/)
 * @returns {Promise<string>} latexDir
 */
async function ensureLatexSource(arxivUrl, latexDir, _opts = {}) {
  if (!arxivUrl) {
    throw new Error('ensureLatexSource requires an arxiv URL');
  }
  const arxivId = extractArxivId(arxivUrl);
  if (!arxivId) {
    throw new Error(`Could not extract arXiv ID from ${arxivUrl}`);
  }

  await fs.ensureDir(latexDir);
  const tarPath = path.join(latexDir, 'source.tar.gz');

  console.log(`    fetching LaTeX source from arxiv.org/e-print/${arxivId}`);
  await downloadFile(`https://arxiv.org/e-print/${arxivId}`, tarPath);

  try {
    // arXiv e-prints are usually gzipped tar, occasionally plain tar,
    // rarely a single .tex, and occasionally a PDF-only submission.
    const fileType = await execAsync(`file "${tarPath}"`);
    const fileInfo = fileType.stdout;
    if (fileInfo.includes('gzip') || fileInfo.includes('tar archive')) {
      const flag = fileInfo.includes('gzip') ? '-xzf' : '-xf';
      await execAsync(`tar ${flag} "${path.basename(tarPath)}"`, { cwd: latexDir });
    } else if (fileInfo.includes('LaTeX') || fileInfo.includes('ASCII') || fileInfo.includes('Unicode text')) {
      await fs.move(tarPath, path.join(latexDir, 'main.tex'), { overwrite: true });
      return latexDir;
    } else {
      throw new Error(`Unexpected e-print payload for ${arxivId}: ${fileInfo.trim()}`);
    }
  } finally {
    await fs.remove(tarPath).catch(() => {});
  }

  if (!await findMainTexFile(latexDir)) {
    throw new Error(`No .tex with \\documentclass found in ${latexDir} after extract`);
  }

  await cleanLatexSource(latexDir);
  return latexDir;
}

// Plain-text source extensions (hashed at any depth). Intermediates
// from latexmk (.aux/.bbl/.fdb_latexmk/...) are deliberately excluded
// so hashing is stable across compiles.
const SOURCE_TEXT_EXT = /\.(tex|bib|sty|cls|bst|bbx|cbx|tikz)$/i;
// Figure binary extensions (hashed only OUTSIDE the top-level dir).
// Authors typically keep figures under fig/, figures/, img/, etc.;
// excluding the top-level avoids picking up latexmk's `main.pdf`
// intermediate (which would otherwise re-bump the epoch every compile).
// Papers that put a figure at top-level miss out on this signal — that
// case is rare, and the determinism story still holds (just the
// metadata /CreationDate stays pinned to the .tex hash).
const SOURCE_FIGURE_EXT = /\.(pdf|png|jpg|jpeg|eps|svg)$/i;

/**
 * Walk a LaTeX source tree and return a deterministic Unix epoch
 * derived from a SHA-256 over the source-file contents. Used as
 * SOURCE_DATE_EPOCH for the mid-edit (persistent-tree) compile path
 * so a given source state yields a byte-identical PDF across re-compiles
 * and across machines — same guarantee as the tarball-driven release path.
 *
 * The 4-byte projection collapses the hash into a uint32 (epoch range
 * 1970-01-01 through 2106-02-07), which is plenty for SOURCE_DATE_EPOCH;
 * the value carries no semantic meaning, just stability.
 */
async function sourceContentEpoch(rootDir) {
  const files = [];
  async function walk(dir, atRoot) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, false);
      else if (entry.isFile()) {
        if (SOURCE_TEXT_EXT.test(entry.name)) files.push(full);
        else if (!atRoot && SOURCE_FIGURE_EXT.test(entry.name)) files.push(full);
      }
    }
  }
  await walk(rootDir, true);
  files.sort();
  const hasher = crypto.createHash('sha256');
  for (const f of files) {
    hasher.update(path.relative(rootDir, f));
    hasher.update('\0');
    hasher.update(await fs.readFile(f));
  }
  return hasher.digest().readUInt32BE(0);
}

/**
 * Resolve LaTeX source for a paper into a compile-ready directory.
 *
 * Priority:
 *   1. research/<slug>/latex/ exists with a .tex containing \documentclass
 *      → use in place (author is mid-edit; respect their working tree).
 *   2. research/<slug>/latex/ exists but has no main .tex → error. This
 *      catches half-extracted / mid-bootstrap state. Silently falling
 *      back to R2 here would compile a *stale* tarball and overwrite the
 *      author's in-progress work as the build output.
 *   3. assets-manifest.json has /research/<slug>/latex.tar.gz → download
 *      from R2 via public CDN (cached in .cache/latex-tarballs/), extract
 *      to .cache/latex-build/<slug>/.
 *   4. Otherwise → throw with a hint pointing at latex:update or latex:pack.
 *
 * The build never auto-fetches from arXiv or auto-uploads to R2.
 * Bootstrapping is an explicit author action.
 *
 * @returns {Promise<string>} absolute path to a directory containing
 *   the .tex with \documentclass.
 */
async function resolveLatexSourceForCompile(slug) {
  // Lazy-require latex_fetch because the build is the only caller of
  // this function — defers loading dotenv / S3 init until actually needed.
  const { loadManifest } = require('./r2_lib');
  const { ensureTarballCached, tarballEpochSeconds } = require('./latex_fetch');

  const persistentDir = path.join(OUTPUT_DIR, slug, 'latex');
  if (await fs.pathExists(persistentDir)) {
    const mainTexFile = await findMainTexFile(persistentDir);
    if (mainTexFile) {
      // No tarball involved → derive a stable epoch from a content hash
      // of the source files. Using mtime here would either drift every
      // compile (dir mtime, bumped by latexmk writing .aux/.bbl/.fdb)
      // or only be stable on one machine (file mtime depends on local
      // install/edit history). Content-hash gives byte-identical output
      // across machines for identical source — same property as the
      // tarball path. Editing any source file changes the hash → new
      // epoch → new PDF, which is exactly the author's expectation.
      const epoch = await sourceContentEpoch(persistentDir);
      return { dir: persistentDir, epoch };
    }
    throw new Error(
      `research/${slug}/latex/ exists but has no .tex with \\documentclass. ` +
      `This looks like a half-bootstrapped tree. Either finish the bootstrap ` +
      `(\`npm run latex:fetch ${slug}\` or \`npm run latex:update ${slug}\`) ` +
      `or remove the directory so the build can resolve source from R2.`
    );
  }

  const manifest = await loadManifest();
  const cdnUrl = manifest[manifestKey(slug)];
  if (!cdnUrl) {
    throw new Error(
      `No LaTeX source available for "${slug}". ` +
      `Run \`npm run latex:update ${slug}\` to bootstrap from arXiv, ` +
      `or drop source at research/${slug}/latex/ and run \`npm run latex:pack ${slug}\`.`
    );
  }

  // Reuse the public-CDN fetch + on-disk cache from latex_fetch. Throws
  // a domain-specific TarballNotFoundError if the manifest references a
  // tarball that's missing from R2.
  const tarPath = await ensureTarballCached(slug, cdnUrl);
  // Drives SOURCE_DATE_EPOCH for the compile — R2 Last-Modified, captured
  // at first download into a .r2-mtime sidecar. Identical across machines
  // for the same tarball version; bumps whenever latex:pack re-uploads.
  const epoch = await tarballEpochSeconds(tarPath);

  const workDir = path.join(COMPILE_CACHE, slug);
  // Wipe stale workdir; tarball extract should produce a fresh tree.
  if (await fs.pathExists(workDir)) await fs.remove(workDir);
  await fs.ensureDir(workDir);

  // Tar was packed with "-C <parent> latex" (basename "latex"). Extracting
  // into workDir gives workDir/latex/<contents>.
  await execAsync(`tar -xzf "${tarPath}" -C "${workDir}"`);
  const innerLatexDir = path.join(workDir, 'latex');
  if (!await fs.pathExists(innerLatexDir) || !await findMainTexFile(innerLatexDir)) {
    throw new Error(`Extracted tarball for ${slug} does not contain a latex/ tree with .tex`);
  }
  return { dir: innerLatexDir, epoch };
}

/**
 * Compile LaTeX in-place from a persistent source directory, copy PDF to output.
 *
 * Uses latexmk (handles bibtex/biber + multi-pass automatically); falls back
 * to a pdflatex/bibtex/pdflatex/pdflatex cycle if latexmk is missing. Build
 * artifacts (.aux/.log/.fls/...) are gitignored under research/*\/latex/, so
 * we leave them in place — latexmk uses them for incremental rebuilds.
 *
 * @param {string} latexDir
 * @param {string} outputPath - Where to copy the compiled PDF
 */
/**
 * Detect which LaTeX engine a source tree needs (pdflatex / xelatex / lualatex).
 *
 * Looked-for signals, in priority order:
 *   1. `%!TEX program = xelatex` / `% !TEX TS-program = xelatex` magic comment
 *      (TeXShop/Overleaf/VSCode convention; lets authors force an engine).
 *   2. Any \usepackage of fontspec, xeCJK, polyglossia, mathspec → xelatex.
 *      These packages won't compile under pdflatex.
 *   3. Default → pdflatex.
 *
 * Only inspects the main .tex (not \input/\include'd files). If a paper
 * hides its engine-specific package behind a subfile, add the magic
 * comment to main.tex.
 */
async function detectLatexEngine(latexDir, mainTexFile) {
  const content = await fs.readFile(path.join(latexDir, mainTexFile), 'utf8');

  const magic = content.match(/^\s*%\s*!TEX\s+(?:TS-)?program\s*=\s*(\w+)/im);
  if (magic) {
    const engine = magic[1].toLowerCase();
    if (engine === 'xelatex' || engine === 'lualatex' || engine === 'pdflatex') return engine;
  }

  // Canonical xelatex-only packages — also catches multi-package braces like
  // \usepackage{fontspec,polyglossia} and \RequirePackage{...} from class files.
  const usePkg = /\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{([^}]*)\}/g;
  for (const match of content.matchAll(usePkg)) {
    const names = match[1].split(',').map(s => s.trim());
    if (names.some(n => /^(fontspec|xeCJK|polyglossia|mathspec|unicode-math)$/.test(n))) {
      return 'xelatex';
    }
    // Heuristic: a package whose name contains "xelatex" or "lualatex" is almost
    // always a custom style that pulls in fontspec/etc. internally (e.g.
    // agenticlearning-xelatex.sty). The detector only scans the main .tex, not
    // adjacent .sty files, so this is the escape hatch for custom-style papers.
    if (names.some(n => /xelatex/i.test(n))) return 'xelatex';
    if (names.some(n => /lualatex/i.test(n))) return 'lualatex';
  }

  return 'pdflatex';
}

async function compileLatex(latexDir, outputPath, { epoch } = {}) {
  const mainTexFile = await findMainTexFile(latexDir);
  if (!mainTexFile) {
    throw new Error(`No .tex with \\documentclass found in ${latexDir}`);
  }

  const engine = await detectLatexEngine(latexDir, mainTexFile);
  const latexmkFlag = engine === 'xelatex' ? '-xelatex'
                    : engine === 'lualatex' ? '-lualatex'
                    : '-pdf';
  const jobname = mainTexFile.replace(/\.tex$/, '');
  const compileCmd = `${engine} -interaction=nonstopmode -halt-on-error "${mainTexFile}"`;
  const bibtexCmd = `bibtex "${jobname}"`;
  const biberCmd = `biber "${jobname}"`;

  if (engine !== 'pdflatex') {
    console.log(`    using ${engine} (detected from source)`);
  }

  // SOURCE_DATE_EPOCH pins /CreationDate, /ModDate and trailer /ID
  // inside pdfTeX (≥1.40.17) so re-compiling the same source produces a
  // byte-identical PDF. Fallback constant for the mid-edit case where
  // resolveLatexSourceForCompile didn't supply one (still deterministic
  // per re-run, just not tied to a source version).
  const sourceDateEpoch = String(epoch != null ? epoch : 1);
  const subprocEnv = { ...process.env, SOURCE_DATE_EPOCH: sourceDateEpoch };
  const execOpts = { cwd: latexDir, env: subprocEnv };

  let latexmkErr = null;
  try {
    await execAsync(`latexmk ${latexmkFlag} -interaction=nonstopmode "${mainTexFile}"`, execOpts);
  } catch (err) {
    latexmkErr = err;
    try {
      // Manual fallback cycle. After the first pass, decide between biber and
      // bibtex by whether biblatex emitted a .bcf control file (biber) vs. an
      // .aux with \bibdata (bibtex). latexmk normally chooses correctly; we
      // only land here when latexmk failed or isn't installed.
      await execAsync(compileCmd, execOpts);
      const files = await fs.readdir(latexDir);
      const hasBcf = files.includes(`${jobname}.bcf`);
      const hasBib = files.some(f => f.endsWith('.bib'));
      if (hasBcf) {
        await execAsync(biberCmd, execOpts).catch(() => {});
      } else if (hasBib) {
        await execAsync(bibtexCmd, execOpts).catch(() => {});
      }
      await execAsync(compileCmd, execOpts);
      await execAsync(compileCmd, execOpts);
    } catch (compileErr) {
      const latexmkDetail = (latexmkErr.stderr || latexmkErr.message || '').slice(0, 300);
      const fallbackDetail = (compileErr.stderr || compileErr.message || '').slice(0, 300);
      const logPath = path.join(latexDir, `${jobname}.log`);
      throw new Error(
        `LaTeX compile failed in ${latexDir} (engine: ${engine}).\n` +
        `  See full log: ${logPath}\n` +
        `  latexmk: ${latexmkDetail}\n` +
        `  ${engine} fallback: ${fallbackDetail}`
      );
    }
  }

  const pdfPath = path.join(latexDir, mainTexFile.replace('.tex', '.pdf'));
  if (!await fs.pathExists(pdfPath)) {
    throw new Error(`PDF was not generated at ${pdfPath}`);
  }

  await fs.ensureDir(path.dirname(outputPath));
  await fs.copy(pdfPath, outputPath);

  // Remove the intermediate PDF so it doesn't get picked up by the LFS rule
  // for research/**/latex/**/*.pdf (which is intended for figure binaries).
  // latexmk will regenerate it on the next run regardless.
  await fs.remove(pdfPath).catch(() => {});
}

/**
 * Check if qpdf is available
 */
async function isQpdfAvailable() {
  try {
    await execAsync('qpdf --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Compress a PDF using qpdf.
 *
 * qpdf is reproducible by default (`--deterministic-id` hashes content,
 * no embedded timestamps), so the SOURCE_DATE_EPOCH dance from the
 * pdflatex step doesn't apply here — passing `epoch` is unnecessary.
 * Compression comes from object-stream conversion + flate recompression.
 * On the test sample qpdf alone matched or beat Ghostscript while
 * giving us a byte-stable output across re-runs and across machines.
 *
 * @param {string} pdfPath - Path to the PDF to compress
 * @returns {object} { originalSize, compressedSize, skipped }
 */
async function compressPdf(pdfPath) {
  const tempOutput = pdfPath + '.tmp-compressed';
  try {
    await execAsync(
      `qpdf --object-streams=generate --compression-level=9 ` +
      `--recompress-flate --deterministic-id ` +
      `"${pdfPath}" "${tempOutput}"`
    );
    const originalSize = (await fs.stat(pdfPath)).size;
    const compressedSize = (await fs.stat(tempOutput)).size;

    // Replace whenever qpdf produced anything smaller — even a single
    // byte. Unlike the gs path's old 10% threshold, qpdf's primary value
    // here is the deterministic-id finalize, not aggressive compression;
    // keeping the qpdf output on a tiny win preserves byte-stability
    // across re-compiles. On the (rare) no-win path we fall back to the
    // raw pdflatex output, which is already deterministic via
    // SOURCE_DATE_EPOCH but lacks qpdf's content-hash /ID — still safe
    // for the pre-commit hash check, just unfinalized.
    if (compressedSize < originalSize) {
      await fs.move(tempOutput, pdfPath, { overwrite: true });
      return { originalSize, compressedSize, skipped: false };
    } else {
      await fs.remove(tempOutput);
      return { originalSize, compressedSize: originalSize, skipped: true };
    }
  } catch (error) {
    await fs.remove(tempOutput).catch(() => {});
    throw error;
  }
}

/**
 * Compress all PDFs in the research directory.
 *
 * @param {boolean} force - ignore the .qpdf-compressed marker and recompress.
 */
async function compressAllPdfs(force = false) {
  const qpdfAvailable = await isQpdfAvailable();
  if (!qpdfAvailable) {
    console.log('\n⚠️  qpdf not found, skipping PDF compression');
    return;
  }

  console.log('\n🗜️  Compressing PDFs with qpdf...\n');
  let compressed = 0;
  let skipped = 0;

  const dirs = await fs.readdir(OUTPUT_DIR);
  for (const dir of dirs) {
    const pdfPath = path.join(OUTPUT_DIR, dir, 'paper.pdf');
    if (!await fs.pathExists(pdfPath)) continue;

    // Check marker file for caching
    const markerPath = pdfPath + '.qpdf-compressed';
    if (!force && await fs.pathExists(markerPath)) {
      const pdfStat = await fs.stat(pdfPath);
      const markerStat = await fs.stat(markerPath);
      if (markerStat.mtime >= pdfStat.mtime) {
        skipped++;
        continue;
      }
    }

    try {
      const result = await compressPdf(pdfPath);
      // Touch marker file
      await fs.ensureFile(markerPath);
      const now = new Date();
      await fs.utimes(markerPath, now, now);

      if (!result.skipped) {
        const saved = ((1 - result.compressedSize / result.originalSize) * 100).toFixed(1);
        console.log(`  ✅ ${dir}: ${(result.originalSize / 1024 / 1024).toFixed(1)}MB → ${(result.compressedSize / 1024 / 1024).toFixed(1)}MB (${saved}% saved)`);
        compressed++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.warn(`  ⚠️  ${dir}: compression failed: ${err.message}`);
    }
  }

  console.log(`\n  PDF compression: ${compressed} compressed, ${skipped} skipped`);
}

/**
 * Main build function
 * @param {Object} options - Build options
 * @param {boolean} options.force - Force re-download/recompile of existing papers
 * @param {boolean} options.buildPdf - Build PDFs from LaTeX source
 */
async function buildPapers(options = {}) {
  const { force = false, buildPdf = false } = options;

  console.log('Building papers from arXiv...\n');

  if (force) {
    console.log('⚠️  Force mode: re-downloading / recompiling all papers\n');
  }

  // Load papers configuration
  const papersData = yaml.load(await fs.readFile(PAPERS_YAML, 'utf-8'));

  // For HTML: only papers with enable_full_paper (HTML must come from arxiv).
  // For PDF: every paper. resolveLatexSourceForCompile will gracefully skip
  // papers with no available source (via the outer paper.pdf-exists skip
  // for already-built papers, or with a clear error for unbootstrapped ones).
  const htmlPapers = papersData.filter(paper => paper.arxiv && paper.enable_full_paper);
  const pdfPapers = papersData;

  if (htmlPapers.length === 0 && !buildPdf) {
    console.log('No papers with both arxiv and enable_full_paper found in papers.yaml');
    console.log('Add enable_full_paper: true to papers.yaml to enable full paper view');
    return;
  }

  if (buildPdf) {
    console.log(`Found ${htmlPapers.length} paper(s) for HTML`);
    console.log(`Found ${pdfPapers.length} paper(s) for PDF\n`);
  } else {
    console.log(`Found ${htmlPapers.length} paper(s) for HTML\n`);
  }

  let htmlDownloaded = 0;
  let htmlSkipped = 0;
  let pdfCompiled = 0;
  let pdfSkipped = 0;
  let failed = 0;

  // Process HTML papers
  if (htmlPapers.length > 0) {
    console.log('📄 Processing HTML papers...\n');
    for (const paper of htmlPapers) {
      try {
        const htmlOutputPath = path.join(OUTPUT_DIR, paper.permalink, 'paper-content.json');

        if (!force && await fs.pathExists(htmlOutputPath)) {
          console.log(`⏭️  [HTML] ${paper.permalink} - already exists`);
          htmlSkipped++;
        } else {
          console.log(`⬇️  [HTML] ${paper.permalink} - downloading...`);
          await downloadArxivHtml(paper.arxiv, htmlOutputPath);
          console.log(`✅ [HTML] ${paper.permalink} - complete`);
          htmlDownloaded++;

          // Normalize bibitem tags to short "Lastname et al. (YYYY)"
          // form. arXiv's HTML extraction emits the full author list
          // verbatim in the `<span class="ltx_tag>`, which produces
          // multi-line wrapping for papers with many authors and is
          // visually inconsistent with .bbl-injected entries from
          // inject_bbl.js. See build/normalize_bib_tags.js.
          try {
            const { normalizeOne } = require('./normalize_bib_tags');
            await normalizeOne(paper.permalink);
          } catch (normErr) {
            console.warn(`  normalize: ${paper.permalink} skipped — ${normErr.message}`);
          }

          // Normalize the AUTHOR LIST in each bibitem's first bibblock
          // to surname-first ("Devlin, Jacob") so References reads
          // consistently across papers regardless of the source
          // bibtex's chosen style. Runs after normalize_bib_tags so the
          // first bibblock structure is settled. See
          // build/normalize_bib_authors.js.
          try {
            const { normalizeOne: normalizeAuthors } = require('./normalize_bib_authors');
            await normalizeAuthors(paper.permalink);
          } catch (authErr) {
            console.warn(`  authors: ${paper.permalink} skipped — ${authErr.message}`);
          }
        }
      } catch (error) {
        console.error(`❌ [HTML] ${paper.permalink} - failed: ${error.message}`);
        failed++;
      }
    }
  }

  // Process PDF papers
  let pdfUnresolved = 0;
  if (buildPdf && pdfPapers.length > 0) {
    console.log('\n📚 Compiling PDFs from LaTeX source...\n');
    for (const paper of pdfPapers) {
      try {
        const pdfOutputPath = path.join(OUTPUT_DIR, paper.permalink, 'paper.pdf');

        // Outer skip: if paper.pdf already exists in git, do nothing.
        // This is the common path in CI — almost no paper is recompiled
        // on a normal build.
        if (!force && await fs.pathExists(pdfOutputPath)) {
          console.log(`⏭️  [PDF] ${paper.permalink} - already exists`);
          pdfSkipped++;
          continue;
        }

        console.log(`⬇️  [PDF] ${paper.permalink} - compiling...`);
        let source;
        try {
          source = await resolveLatexSourceForCompile(paper.permalink);
        } catch (resolveErr) {
          // "No source available" is expected when authoring a new paper
          // locally (manifest entry not yet written). In CI it indicates
          // a regression — someone landed a paper.yaml entry without
          // running latex:update/latex:pack first. Skip locally, fail in
          // CI.
          console.log(`⏭️  [PDF] ${paper.permalink} - ${resolveErr.message}`);
          pdfUnresolved++;
          pdfSkipped++;
          continue;
        }
        await compileLatex(source.dir, pdfOutputPath, { epoch: source.epoch });
        console.log(`✅ [PDF] ${paper.permalink} - complete`);
        pdfCompiled++;

        // After the LaTeX compile finishes, the build/.cache/latex-build/
        // <slug>/ workdir holds a populated main.bbl from bibtex. arXiv's
        // HTML extractor often drops the bibliography (when a paper's
        // source tarball lacks the .bbl that arXiv strips on upload),
        // leaving paper-content.json with an empty <ul class="ltx_biblist">
        // and `ltx_missing_citation` spans. injectOne reuses that
        // bbl, pipes it through pandoc, and populates both — runs only
        // when bibliography is empty (idempotent + skipped otherwise).
        try {
          const { injectOne } = require('./inject_bbl');
          const injected = await injectOne(paper.permalink);
          // If we just injected fresh bibitems from a .bbl, re-run the
          // tag + author normalizers so the injected entries pick up
          // the same canonical formatting as native-arXiv entries.
          if (injected) {
            try {
              const { normalizeOne } = require('./normalize_bib_tags');
              await normalizeOne(paper.permalink);
            } catch {}
            try {
              const { normalizeOne: normalizeAuthors } = require('./normalize_bib_authors');
              await normalizeAuthors(paper.permalink);
            } catch {}
          }
        } catch (bblErr) {
          console.warn(`  bbl-inject: ${paper.permalink} skipped — ${bblErr.message}`);
        }
      } catch (error) {
        console.error(`❌ [PDF] ${paper.permalink} - failed: ${error.message}`);
        failed++;
      }
    }
  }

  // In CI, an unresolved paper means a manifest entry is missing or
  // paper.pdf is missing without a publish. Locally, leave it as a hint.
  if (pdfUnresolved > 0 && process.env.CI === 'true') {
    console.error(
      `\n❌ ${pdfUnresolved} paper(s) had no LaTeX source available and ` +
      `no committed paper.pdf — looks like a missed latex:update/latex:pack ` +
      `before commit. Failing the CI build.`
    );
    process.exit(1);
  }

  // Guard: any enable_full_paper paper whose paper-content.json exists but
  // has an empty <ul class="ltx_biblist"> means the HTML download succeeded
  // (arxiv's extractor drops the biblist for papers missing a .bbl in
  // their tarball) but inject_bbl didn't backfill — usually because
  // latex:update <slug> was never run so no tarball is on R2 to compile.
  // Fail loud locally with a clear next step; without this the empty
  // biblist ships to CI (which then fails via check_bibliography, but
  // only after push). Same class of failure PR #53 hit.
  const emptyBibPapers = [];
  for (const paper of htmlPapers) {
    const jsonPath = path.join(OUTPUT_DIR, paper.permalink, 'paper-content.json');
    if (!await fs.pathExists(jsonPath)) continue;
    const doc = await fs.readJson(jsonPath);
    const html = doc && doc.html ? doc.html : '';
    // Match the check in build/check_bibliography.js.
    if (/<ul[^>]*class="[^"]*ltx_biblist[^"]*"[^>]*>\s*<\/ul>/.test(html)) {
      emptyBibPapers.push(paper.permalink);
    }
  }
  if (emptyBibPapers.length > 0) {
    console.error(
      `\n❌ ${emptyBibPapers.length} paper(s) have enable_full_paper: true ` +
      `but an empty <ul class="ltx_biblist"> in paper-content.json:`
    );
    for (const slug of emptyBibPapers) {
      console.error(`   - ${slug}`);
      console.error(`     Fix: npm run latex:update ${slug} && rm research/${slug}/paper.pdf research/${slug}/paper-content.json && npm run build:arxiv:pdf`);
    }
    process.exit(1);
  }

  // Compress PDFs
  if (buildPdf) {
    await compressAllPdfs(force);
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Build Summary');
  console.log('='.repeat(50));

  if (htmlPapers.length > 0) {
    console.log(`\nHTML Papers:`);
    console.log(`  ✅ Downloaded: ${htmlDownloaded}`);
    console.log(`  ⏭️  Skipped: ${htmlSkipped}`);
  }

  if (buildPdf && pdfPapers.length > 0) {
    console.log(`\nPDF Papers:`);
    console.log(`  ✅ Compiled: ${pdfCompiled}`);
    console.log(`  ⏭️  Skipped: ${pdfSkipped}`);
  }

  if (failed > 0) {
    console.log(`\n❌ Failed: ${failed}`);
  }

  console.log('\n✓ Build complete!\n');
}

// Run if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const force = args.includes('--force') || args.includes('-f');
  const buildPdf = args.includes('--pdf') || args.includes('-p');

  if (buildPdf) {
    console.log('📄 PDF compilation enabled\n');
  }

  buildPapers({ force, buildPdf }).catch(error => {
    console.error('Build failed:', error);
    process.exit(1);
  });
}

module.exports = {
  buildPapers,
  downloadArxivHtml,
  ensureLatexSource,
  resolveLatexSourceForCompile,
  compileLatex,
  compressAllPdfs,
};
