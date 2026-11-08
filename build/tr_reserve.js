#!/usr/bin/env node

/**
 * Reserve a lab technical report number and DOI for a request issue.
 *
 *   npm run tr:reserve -- <issue-number>
 *
 * Reads the "Technical report request" issue form, takes the next free
 * AGL-TR-<year>-<nn>, creates a Zenodo draft with a reserved DOI, and
 * comments on the issue with the page-1 footnote and the papers.yaml
 * lines. PI only: needs ZENODO_TOKEN (build/zenodo.js).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const yaml = require('js-yaml');
const { api, creators, nextReportNumber, reportNote, footnote } = require('./zenodo');

const ROOT = path.resolve(__dirname, '..');
const MARKER = '<!-- tr:reserve -->';

function gh(args, input) {
    const r = spawnSync('gh', args, { cwd: ROOT, encoding: 'utf8', input });
    if (r.status !== 0) throw new Error(`gh ${args.join(' ')}: ${r.stderr.trim()}`);
    return r.stdout;
}

// Issue forms render each field as "### <label>\n\n<value>".
function formFields(body) {
    const fields = {};
    for (const part of body.split(/^### /m).slice(1)) {
        const nl = part.indexOf('\n');
        fields[part.slice(0, nl).trim()] = part.slice(nl).trim();
    }
    return fields;
}

async function main() {
    const issue = process.argv[2];
    if (!/^\d+$/.test(issue || '')) {
        console.error('Usage: npm run tr:reserve -- <issue-number>');
        process.exit(1);
    }
    const data = JSON.parse(gh(['issue', 'view', issue, '--json', 'body,comments,url']));
    if (data.comments.some(c => c.body.includes(MARKER))) {
        console.error(`✗ Issue #${issue} already has a reserved number; see its comments.`);
        process.exit(1);
    }
    const f = formFields(data.body || '');
    const title = f.Title;
    const authors = (f.Authors || '').split('\n').map(s => s.trim()).filter(Boolean);
    const abstract = f.Abstract;
    const slug = (f.Permalink || '').trim();
    if (!title || !authors.length || !abstract || !/^[a-z0-9-]+$/.test(slug)) {
        console.error(`✗ Issue #${issue} is not a complete request form (title, authors, abstract, kebab-case permalink).`);
        process.exit(1);
    }

    const papers = yaml.load(fs.readFileSync(path.join(ROOT, 'data/papers.yaml'), 'utf8'));
    const year = new Date().getUTCFullYear();
    const number = await nextReportNumber(papers, year);

    const dep = await api('POST', '/deposit/depositions', {
        metadata: {
            upload_type: 'publication',
            publication_type: 'report',
            title,
            creators: creators(authors),
            description: abstract,
            publication_date: new Date().toISOString().slice(0, 10),
            notes: reportNote(number),
            prereserve_doi: true,
        },
    });
    const doi = dep.metadata.prereserve_doi.doi;

    const comment = `${MARKER}
Reserved **${number}** with DOI \`${doi}\` (not published yet).

1. Add this footnote on page 1, right after \`\\maketitle\` (needs \`hyperref\`, which the lab template loads):

   \`\`\`latex
   ${footnote(number, doi)}
   \`\`\`

2. Add these lines to the paper's entry in \`data/papers.yaml\` (permalink \`${slug}\`, with \`enable_full_paper: true\`):

   \`\`\`yaml
   journal: 'Technical report'
   report_number: ${number}
   doi: ${doi}
   \`\`\`

3. Run \`npm run paper:add -- ${slug} <source.zip>\` and open the pull request with "Closes #${issue}".
   The DOI is published once the PR's PDF is checked.`;
    try {
        gh(['issue', 'comment', issue, '--body-file', '-'], comment);
    } catch (e) {
        // The DOI is reserved either way; do not rerun (that reserves another).
        console.error(`⚠️  Reserved ${number} → ${doi} (Zenodo draft ${dep.id}), but the issue comment failed: ${e.message}\n` +
            '   Post this on the issue by hand; do not rerun tr:reserve:\n\n' + comment);
        process.exit(1);
    }

    console.log(`✅ ${number} → ${doi} (Zenodo draft ${dep.id}). Commented on ${data.url}`);
}

main().catch((e) => {
    console.error(`✗ tr:reserve: ${e.message}`);
    process.exit(1);
});
