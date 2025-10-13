#!/usr/bin/env node

/**
 * Build script to download arXiv HTML papers
 * This script:
 * 1. Reads papers.yaml to find papers with arxiv links
 * 2. Downloads HTML from ar5iv.labs.arxiv.org
 * 3. Extracts and cleans the main content
 * 4. Saves it for embedding in the paper template
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
const ARXIV_HTML_BASE = 'https://ar5iv.labs.arxiv.org/html/';
const ARXIV_ASSETS_BASE = 'https://ar5iv.labs.arxiv.org/html/';

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

  const ar5ivUrl = `${ARXIV_HTML_BASE}${arxivId}`;

  console.log(`Downloading arXiv HTML for ${arxivId}...`);
  console.log(`URL: ${ar5ivUrl}`);

  try {
    // Download the HTML
    const html = await downloadHtml(ar5ivUrl);

    // Extract the main article content
    const articleMatch = html.match(/<article[^>]*class="ltx_document[^"]*"[^>]*>([\s\S]*?)<\/article>/);

    if (!articleMatch) {
      throw new Error('Could not find article content in arXiv HTML');
    }

    let content = articleMatch[1];

    // Remove ar5iv-specific elements we don't want
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
    const imageRegex = /src="\/html\/(\d{4}\.\d{4,5})\/assets\/([^"]+)"/g;
    const images = [];
    let match;
    while ((match = imageRegex.exec(content)) !== null) {
      images.push({
        arxivId: match[1],
        filename: match[2],
        fullMatch: match[0]
      });
    }

    // Download each unique image
    const downloadedImages = new Set();
    for (const img of images) {
      if (downloadedImages.has(img.filename)) continue;

      const imageUrl = `${ARXIV_ASSETS_BASE}${img.arxivId}/assets/${img.filename}`;
      const localPath = path.join(assetsDir, img.filename);

      try {
        // Ensure the subdirectory exists for nested paths (e.g., figs/image.png)
        await fs.ensureDir(path.dirname(localPath));
        await downloadFile(imageUrl, localPath);
        console.log(`  Downloaded image: ${img.filename}`);
        downloadedImages.add(img.filename);
      } catch (err) {
        console.warn(`  Warning: Failed to download ${img.filename}: ${err.message}`);
      }
    }

    // Update image paths to point to local assets
    content = content.replace(/src="\/html\/(\d{4}\.\d{4,5})\/assets\/([^"]+)"/g,
      'src="./assets/$2"');

    // Extract inline styles if any
    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
    const styles = styleMatch ? styleMatch.join('\n') : '';

    // Create the output object
    const output = {
      html: content.trim(),
      css: styles,
      arxiv_id: arxivId,
      source: 'ar5iv',
      generated: new Date().toISOString()
    };

    // Ensure output directory exists
    await fs.ensureDir(path.dirname(outputPath));

    // Save the extracted content as JSON
    await fs.writeJson(outputPath, output, { spaces: 2 });

    console.log(`✓ Downloaded and saved arXiv HTML to ${outputPath}`);

  } catch (error) {
    console.error(`Failed to download arXiv HTML: ${error.message}`);
    throw error;
  }
}

/**
 * Main build function
 * @param {Object} options - Build options
 * @param {boolean} options.force - Force re-download of existing papers
 */
async function buildPapers(options = {}) {
  const { force = false } = options;

  console.log('Building papers from arXiv HTML...\n');

  if (force) {
    console.log('⚠️  Force mode: Re-downloading all papers\n');
  }

  // Load papers configuration
  const papersData = yaml.load(await fs.readFile(PAPERS_YAML, 'utf-8'));

  // Filter papers that have arXiv links and enable_full_paper set
  const arxivPapers = papersData.filter(paper => paper.arxiv && paper.enable_full_paper);

  if (arxivPapers.length === 0) {
    console.log('No papers with both arxiv and enable_full_paper found in papers.yaml');
    console.log('Add enable_full_paper: true to papers.yaml to enable full paper view');
    return;
  }

  console.log(`Found ${arxivPapers.length} paper(s) to process\n`);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  // Process each paper
  for (const paper of arxivPapers) {
    try {
      const outputPath = path.join(OUTPUT_DIR, paper.permalink, 'paper-content.json');

      // Skip if file exists and not in force mode
      if (!force && await fs.pathExists(outputPath)) {
        console.log(`⏭️  Skipping ${paper.permalink} (already exists)`);
        skipped++;
        continue;
      }

      await downloadArxivHtml(paper.arxiv, outputPath);
      downloaded++;
    } catch (error) {
      console.error(`❌ Error processing ${paper.title}:`, error.message);
      failed++;
    }
  }

  console.log(`\n✓ Paper build complete!`);
  console.log(`   ${downloaded} downloaded`);
  console.log(`   ${skipped} skipped (already existed)`);
  if (failed > 0) {
    console.log(`   ${failed} failed`);
  }
}

// Run if executed directly
if (require.main === module) {
  // Check for command line arguments
  const args = process.argv.slice(2);
  const force = args.includes('--force') || args.includes('-f');

  buildPapers({ force }).catch(error => {
    console.error('Build failed:', error);
    process.exit(1);
  });
}

module.exports = { buildPapers, downloadArxivHtml };
