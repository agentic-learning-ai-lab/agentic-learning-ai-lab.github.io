#!/usr/bin/env node

/**
 * Download a paper's LaTeX source from arXiv (the e-print) into a
 * directory, extract it and strip its comments. Used by `paper:add` (an
 * arXiv paper with no zip) and `latex:update`.
 */

const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const { promisify } = require('util');

const execAsync = promisify(require('child_process').exec);
const { cleanLatexSource, findMainTexFile } = require('./latex_lib');

/**
 * Download a URL to a file, following redirects, with retries.
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

function extractArxivId(arxivUrl) {
  const match = arxivUrl.match(/(\d{4}\.\d{4,5})/);
  return match ? match[1] : null;
}

/**
 * Fetch arXiv's e-print for `arxivUrl` (an abs URL or ID) into latexDir.
 */
async function ensureLatexSource(arxivUrl, latexDir, _opts = {}) {
  if (!arxivUrl) {
    throw new Error('ensureLatexSource requires an arxiv URL');
  }
  const arxivId = extractArxivId(arxivUrl);
  if (!arxivId) {
    throw new Error(`Could not extract arXiv ID from ${arxivUrl}`);
  }

  // A version pinned in the URL (2403.01944v2) is fetched as pinned.
  const pinned = (arxivUrl.match(/\d{4}\.\d{4,5}(v\d+)/) || [])[1] || '';

  await fs.ensureDir(latexDir);
  const tarPath = path.join(latexDir, 'source.tar.gz');

  console.log(`    fetching LaTeX source from arxiv.org/e-print/${arxivId}${pinned}`);
  await downloadFile(`https://arxiv.org/e-print/${arxivId}${pinned}`, tarPath);

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

module.exports = { ensureLatexSource, extractArxivId };
