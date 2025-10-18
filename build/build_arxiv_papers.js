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
      // Experimental arXiv format: simple filenames like x1.png
      // Extract version from base tag or construct it
      const baseMatch = html.match(/<base\s+href="\/html\/(\d{4}\.\d{4,5}v\d+)\/"/);
      const versionedId = baseMatch ? baseMatch[1] : `${arxivId}v1`;

      imageRegex = /src="([^"\/]+\.(?:png|jpg|jpeg|gif|svg))"/gi;
      while ((match = imageRegex.exec(content)) !== null) {
        images.push({
          versionedId: versionedId,
          filename: match[1],
          fullMatch: match[0]
        });
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
      content = content.replace(/src="([^"\/]+\.(?:png|jpg|jpeg|gif|svg))"/gi,
        'src="./assets/$1"');
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
 * Download and compile LaTeX source from arXiv
 * @param {string} arxivUrl - arXiv URL or ID
 * @param {string} outputPath - Where to save the compiled PDF
 */
async function downloadAndCompileLatex(arxivUrl, outputPath) {
  const arxivId = extractArxivId(arxivUrl);

  if (!arxivId) {
    throw new Error(`Could not extract arXiv ID from ${arxivUrl}`);
  }

  // arXiv source is available at https://arxiv.org/e-print/{arxiv_id}
  const sourceUrl = `https://arxiv.org/e-print/${arxivId}`;
  const tempDir = path.join(require('os').tmpdir(), `arxiv_${arxivId}_${Date.now()}`);
  const tarPath = path.join(tempDir, 'source.tar.gz');

  try {
    await fs.ensureDir(tempDir);

    // Download the source tarball
    await downloadFile(sourceUrl, tarPath);

    // Extract the tarball
    await execAsync(`tar -xzf source.tar.gz`, { cwd: tempDir });

    // Find the main .tex file
    const files = await fs.readdir(tempDir);
    let mainTexFile = files.find(f => f === 'main.tex' || f === 'ms.tex');

    if (!mainTexFile) {
      // Look for any .tex file that contains \documentclass
      for (const file of files.filter(f => f.endsWith('.tex'))) {
        const content = await fs.readFile(path.join(tempDir, file), 'utf8');
        if (content.includes('\\documentclass')) {
          mainTexFile = file;
          break;
        }
      }
    }

    if (!mainTexFile) {
      throw new Error('Could not find main .tex file');
    }

    // Compile the LaTeX using pdflatex
    // Run twice to resolve references, suppress output
    const latexCmd = `pdflatex -interaction=nonstopmode -halt-on-error "${mainTexFile}" > /dev/null 2>&1`;

    try {
      await execAsync(latexCmd, { cwd: tempDir });
      await execAsync(latexCmd, { cwd: tempDir });
    } catch (compileError) {
      // Try with latexmk as fallback
      await execAsync(`latexmk -pdf -interaction=nonstopmode "${mainTexFile}" > /dev/null 2>&1`, { cwd: tempDir });
    }

    // Copy the PDF to the output location
    const pdfFile = mainTexFile.replace('.tex', '.pdf');
    const pdfPath = path.join(tempDir, pdfFile);

    if (await fs.pathExists(pdfPath)) {
      await fs.ensureDir(path.dirname(outputPath));
      await fs.copy(pdfPath, outputPath);
    } else {
      throw new Error('PDF file was not generated');
    }

  } catch (error) {
    console.error(`Failed to compile LaTeX: ${error.message}`);
    throw error;
  } finally {
    // Clean up temporary directory
    try {
      await fs.remove(tempDir);
    } catch (cleanupError) {
      console.warn(`Warning: Failed to clean up temp directory: ${cleanupError.message}`);
    }
  }
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

  // For HTML: only papers with enable_full_paper
  // For PDF: all papers with arXiv links
  const htmlPapers = papersData.filter(paper => paper.arxiv && paper.enable_full_paper);
  const pdfPapers = papersData.filter(paper => paper.arxiv);

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

        if (!force && await fs.pathExists(pdfOutputPath)) {
          console.log(`⏭️  [PDF] ${paper.permalink} - already exists`);
          pdfSkipped++;
        } else {
          console.log(`⬇️  [PDF] ${paper.permalink} - compiling...`);
          await downloadAndCompileLatex(paper.arxiv, pdfOutputPath);
          console.log(`✅ [PDF] ${paper.permalink} - complete`);
          pdfCompiled++;
        }
      } catch (error) {
        console.error(`❌ [PDF] ${paper.permalink} - failed: ${error.message}`);
        failed++;
      }
    }
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

module.exports = { buildPapers, downloadArxivHtml, downloadAndCompileLatex };
