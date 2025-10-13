#!/usr/bin/env node

/**
 * Script to download LaTeX source from arXiv
 * Usage: node download_arxiv_source.js <arxiv_id> <output_dir>
 * Example: node download_arxiv_source.js 2508.15717 papers-latex/stream-mem
 */

const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Download a file from a URL
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * Extract arXiv ID from URL or ID string
 */
function extractArxivId(input) {
  // Handle full URLs like https://arxiv.org/abs/2508.15717
  const urlMatch = input.match(/arxiv\.org\/(?:abs|pdf)\/(\d+\.\d+)/);
  if (urlMatch) {
    return urlMatch[1];
  }

  // Handle direct ID like 2508.15717
  if (/^\d+\.\d+$/.test(input)) {
    return input;
  }

  throw new Error('Invalid arXiv ID or URL');
}

/**
 * Download and extract arXiv source
 */
async function downloadArxivSource(arxivInput, outputDir) {
  const arxivId = extractArxivId(arxivInput);
  const sourceUrl = `https://arxiv.org/e-print/${arxivId}`;

  console.log(`Downloading arXiv source for ${arxivId}...`);
  console.log(`URL: ${sourceUrl}`);

  // Create output directory
  await fs.ensureDir(outputDir);

  const tarPath = path.join(outputDir, 'source.tar.gz');

  try {
    // Download the source
    await downloadFile(sourceUrl, tarPath);
    console.log('✓ Downloaded source archive');

    // Check if it's a gzipped tar file
    const fileType = await execAsync(`file "${tarPath}"`);

    if (fileType.stdout.includes('gzip')) {
      // Extract tar.gz
      console.log('Extracting archive...');
      await execAsync(`tar -xzf source.tar.gz`, { cwd: outputDir });
      console.log('✓ Extracted archive');
    } else if (fileType.stdout.includes('TeX')) {
      // Single .tex file, just rename it
      console.log('Single .tex file detected, renaming...');
      await fs.move(tarPath, path.join(outputDir, 'main.tex'), { overwrite: true });
      console.log('✓ Renamed to main.tex');
      return;
    } else {
      console.log('Unexpected file type, trying to extract anyway...');
      try {
        await execAsync(`tar -xf source.tar.gz`, { cwd: outputDir });
        console.log('✓ Extracted archive');
      } catch (err) {
        // Maybe it's just a .tex file with wrong extension
        await fs.move(tarPath, path.join(outputDir, 'main.tex'), { overwrite: true });
        console.log('✓ Treated as single .tex file');
        return;
      }
    }

    // Remove the tar file
    await fs.remove(tarPath);

    // List what we extracted
    const files = await fs.readdir(outputDir);
    console.log('\nExtracted files:');
    files.forEach(f => console.log(`  - ${f}`));

    // Find the main .tex file
    const texFiles = files.filter(f => f.endsWith('.tex'));
    if (texFiles.length === 0) {
      console.warn('\n⚠️  No .tex files found!');
      return;
    }

    console.log(`\nFound ${texFiles.length} .tex file(s):`);
    texFiles.forEach(f => console.log(`  - ${f}`));

    // If there's a main.tex, we're good
    if (texFiles.includes('main.tex')) {
      console.log('\n✓ main.tex found');
    } else if (texFiles.length === 1) {
      // Rename single file to main.tex
      console.log(`\nRenaming ${texFiles[0]} to main.tex...`);
      await fs.move(
        path.join(outputDir, texFiles[0]),
        path.join(outputDir, 'main.tex'),
        { overwrite: true }
      );
      console.log('✓ Renamed to main.tex');
    } else {
      console.log('\n⚠️  Multiple .tex files found. Please manually identify the main file.');
      console.log('   The build script will try to use main.tex or the first .tex file.');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    throw error;
  }
}

/**
 * Download sources for all papers with arxiv links but no latex_dir
 */
async function downloadAllMissing() {
  const yaml = require('js-yaml');
  const papersPath = path.resolve(__dirname, '../data/papers.yaml');
  const papers = yaml.load(await fs.readFile(papersPath, 'utf-8'));

  const missing = papers.filter(p => p.arxiv && !p.latex_dir);

  if (missing.length === 0) {
    console.log('All papers with arXiv links already have latex_dir set!');
    return;
  }

  console.log(`Found ${missing.length} paper(s) with arXiv links but no latex_dir:\n`);

  for (const paper of missing) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Paper: ${paper.title}`);
    console.log(`Permalink: ${paper.permalink}`);
    console.log(`arXiv: ${paper.arxiv}`);
    console.log('='.repeat(60));

    const outputDir = path.resolve(__dirname, '../papers-latex', paper.permalink);

    try {
      await downloadArxivSource(paper.arxiv, outputDir);
      console.log(`\n✓ Successfully downloaded source for ${paper.permalink}`);
      console.log(`  Add this to papers.yaml: latex_dir: "${paper.permalink}"`);
    } catch (error) {
      console.error(`\n❌ Failed to download ${paper.permalink}:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Done! Remember to add latex_dir to papers.yaml for each paper.');
  console.log('='.repeat(60));
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--all') {
    // Download all missing sources
    downloadAllMissing().catch(error => {
      console.error('Failed:', error);
      process.exit(1);
    });
  } else if (args.length === 2) {
    // Download specific paper
    const [arxivInput, outputDir] = args;
    downloadArxivSource(arxivInput, outputDir).then(() => {
      console.log('\n✓ Done!');
    }).catch(error => {
      console.error('Failed:', error);
      process.exit(1);
    });
  } else {
    console.log('Usage:');
    console.log('  Download specific paper:');
    console.log('    node download_arxiv_source.js <arxiv_id> <output_dir>');
    console.log('    node download_arxiv_source.js 2508.15717 papers-latex/stream-mem');
    console.log('');
    console.log('  Download all papers with arXiv links but no latex_dir:');
    console.log('    node download_arxiv_source.js --all');
    process.exit(1);
  }
}

module.exports = { downloadArxivSource, extractArxivId };
