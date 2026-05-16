#!/usr/bin/env node

/**
 * Build script to download arXiv HTML papers and compile PDFs from LaTeX source
 *
 * This script:
 * 1. Reads papers.yaml to find papers with arxiv links and enable_full_paper: true
 * 2. Downloads HTML from ar5iv.labs.arxiv.org
 * 3. Extracts and cleans the main content
 * 4. Downloads images and updates paths
 * 5. Saves it for embedding in the paper template
 * 6. Optionally downloads LaTeX source and compiles PDFs
 *
 * Usage:
 *   node build/build_arxiv_papers.js              # Build HTML only
 *   node build/build_arxiv_papers.js --pdf        # Build HTML and PDFs
 *   node build/build_arxiv_papers.js --force      # Force re-download existing papers
 *   node build/build_arxiv_papers.js --pdf --force # Build everything, force re-download
 *
 * Requirements for PDF compilation:
 *   - pdflatex or latexmk must be installed
 *   - Full LaTeX distribution (texlive, mactex, etc.)
 */

const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const https = require('https');
const { promisify } = require('util');

const execAsync = promisify(require('child_process').exec);

// Configuration
const PAPERS_YAML = path.join(__dirname, '../data/papers.yaml');
const OUTPUT_DIR = path.join(__dirname, '../research');
const ARXIV_HTML_BASE = 'https://arxiv.org/html/';
const ARXIV_ASSETS_BASE = 'https://arxiv.org/html/';

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
          downloadFile(response.headers.location, outputPath, retries, delay).then(resolve).catch(reject);
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
 * Find the main .tex file in a directory (one with \documentclass).
 * Prefers main.tex or ms.tex by convention.
 */
async function findMainTexFile(latexDir) {
  const files = await fs.readdir(latexDir);
  const preferred = files.find(f => f === 'main.tex' || f === 'ms.tex');
  if (preferred) return preferred;

  for (const file of files.filter(f => f.endsWith('.tex'))) {
    const content = await fs.readFile(path.join(latexDir, file), 'utf8');
    if (content.includes('\\documentclass')) {
      return file;
    }
  }
  return null;
}

/**
 * Ensure LaTeX source exists at latexDir. Idempotent: if the directory is
 * already populated with a .tex containing \documentclass, returns immediately.
 *
 * If absent and `arxivUrl` is set, fetches https://arxiv.org/e-print/<id>
 * and extracts into latexDir. If absent and no arxivUrl, returns null
 * (position-paper case — author must drop source in by hand).
 *
 * @param {string|null} arxivUrl
 * @param {string} latexDir - Persistent location, e.g. research/<slug>/latex
 * @param {object} options - { force: re-fetch even if source exists }
 * @returns {Promise<string|null>} latexDir, or null if no source available
 */
async function ensureLatexSource(arxivUrl, latexDir, { force = false } = {}) {
  const sourcePresent = await fs.pathExists(latexDir) && await findMainTexFile(latexDir);

  if (sourcePresent && !force) {
    return latexDir;
  }
  if (sourcePresent && force && !arxivUrl) {
    // Force flag can only re-fetch when we have a URL; for hand-dropped
    // position-paper source, keep what's there.
    return latexDir;
  }
  if (!arxivUrl) {
    return null;
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
      return latexDir; // findMainTexFile will succeed on the renamed file
    } else {
      throw new Error(`Unexpected e-print payload for ${arxivId}: ${fileInfo.trim()}`);
    }
  } finally {
    // Drop the tarball whether extract succeeded or threw; a stale tarball
    // would otherwise leave the dir in a half-populated state next run.
    await fs.remove(tarPath).catch(() => {});
  }

  if (!await findMainTexFile(latexDir)) {
    throw new Error(`No .tex with \\documentclass found in ${latexDir} after extract`);
  }
  return latexDir;
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

async function compileLatex(latexDir, outputPath) {
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

  let latexmkErr = null;
  try {
    await execAsync(`latexmk ${latexmkFlag} -interaction=nonstopmode "${mainTexFile}"`, { cwd: latexDir });
  } catch (err) {
    latexmkErr = err;
    try {
      // Manual fallback cycle. After the first pass, decide between biber and
      // bibtex by whether biblatex emitted a .bcf control file (biber) vs. an
      // .aux with \bibdata (bibtex). latexmk normally chooses correctly; we
      // only land here when latexmk failed or isn't installed.
      await execAsync(compileCmd, { cwd: latexDir });
      const files = await fs.readdir(latexDir);
      const hasBcf = files.includes(`${jobname}.bcf`);
      const hasBib = files.some(f => f.endsWith('.bib'));
      if (hasBcf) {
        await execAsync(biberCmd, { cwd: latexDir }).catch(() => {});
      } else if (hasBib) {
        await execAsync(bibtexCmd, { cwd: latexDir }).catch(() => {});
      }
      await execAsync(compileCmd, { cwd: latexDir });
      await execAsync(compileCmd, { cwd: latexDir });
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
 * Check if Ghostscript is available
 */
async function isGhostscriptAvailable() {
  try {
    await execAsync('gs --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Compress a PDF using Ghostscript
 * @param {string} pdfPath - Path to the PDF to compress
 * @returns {object} { originalSize, compressedSize, skipped }
 */
async function compressPdf(pdfPath) {
  const tempOutput = pdfPath + '.tmp-compressed';
  try {
    await execAsync(
      `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/prepress ` +
      `-dNOPAUSE -dQUIET -dBATCH -sOutputFile="${tempOutput}" "${pdfPath}"`
    );
    const originalSize = (await fs.stat(pdfPath)).size;
    const compressedSize = (await fs.stat(tempOutput)).size;

    // Only replace if compression actually helped (>10% reduction)
    if (compressedSize < originalSize * 0.9) {
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
 * Compress all PDFs in the research directory
 */
async function compressAllPdfs(force = false) {
  const gsAvailable = await isGhostscriptAvailable();
  if (!gsAvailable) {
    console.log('\n⚠️  Ghostscript not found, skipping PDF compression');
    return;
  }

  console.log('\n🗜️  Compressing PDFs with Ghostscript...\n');
  let compressed = 0;
  let skipped = 0;

  const dirs = await fs.readdir(OUTPUT_DIR);
  for (const dir of dirs) {
    const pdfPath = path.join(OUTPUT_DIR, dir, 'paper.pdf');
    if (!await fs.pathExists(pdfPath)) continue;

    // Check marker file for caching
    const markerPath = pdfPath + '.gs-compressed';
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
 * @param {boolean} options.force - Force re-download of existing papers
 * @param {boolean} options.buildPdf - Build PDFs from LaTeX source
 */
async function buildPapers(options = {}) {
  const { force = false, buildPdf = false } = options;

  console.log('Building papers from arXiv...\n');

  if (force) {
    console.log('⚠️  Force mode: Re-downloading all papers\n');
  }

  // Load papers configuration
  const papersData = yaml.load(await fs.readFile(PAPERS_YAML, 'utf-8'));

  // For HTML: only papers with enable_full_paper (HTML must come from arxiv).
  // For PDF: papers with an arxiv URL (we'll fetch source) OR with a
  // pre-existing research/<slug>/latex/ containing a real .tex (position papers).
  const htmlPapers = papersData.filter(paper => paper.arxiv && paper.enable_full_paper);
  const pdfPapers = [];
  for (const paper of papersData) {
    if (paper.arxiv) {
      pdfPapers.push(paper);
      continue;
    }
    const latexDir = path.join(OUTPUT_DIR, paper.permalink, 'latex');
    if (await fs.pathExists(latexDir) && await findMainTexFile(latexDir)) {
      pdfPapers.push(paper);
    }
  }

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
        }
      } catch (error) {
        console.error(`❌ [HTML] ${paper.permalink} - failed: ${error.message}`);
        failed++;
      }
    }
  }

  // Process PDF papers
  if (buildPdf && pdfPapers.length > 0) {
    console.log('\n📚 Compiling PDFs from LaTeX source...\n');
    for (const paper of pdfPapers) {
      try {
        const pdfOutputPath = path.join(OUTPUT_DIR, paper.permalink, 'paper.pdf');
        const latexDir = path.join(OUTPUT_DIR, paper.permalink, 'latex');

        if (!force && await fs.pathExists(pdfOutputPath)) {
          console.log(`⏭️  [PDF] ${paper.permalink} - already exists`);
          pdfSkipped++;
        } else {
          console.log(`⬇️  [PDF] ${paper.permalink} - compiling...`);
          const resolved = await ensureLatexSource(paper.arxiv, latexDir, { force });
          if (!resolved) {
            console.log(`⏭️  [PDF] ${paper.permalink} - no arxiv URL and no latex/ source, skipping`);
            pdfSkipped++;
          } else {
            await compileLatex(latexDir, pdfOutputPath);
            console.log(`✅ [PDF] ${paper.permalink} - complete`);
            pdfCompiled++;
          }
        }
      } catch (error) {
        console.error(`❌ [PDF] ${paper.permalink} - failed: ${error.message}`);
        failed++;
      }
    }
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
  // Check for command line arguments
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

module.exports = { buildPapers, downloadArxivHtml, ensureLatexSource, compileLatex, compressAllPdfs };
