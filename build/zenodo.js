/**
 * Zenodo helpers for lab technical reports (tr:reserve, tr:publish).
 *
 * Needs ZENODO_TOKEN (scopes deposit:write, deposit:actions) in the
 * environment or the gitignored .env. The DOIs are minted under the token
 * owner's account, so only the PI runs these scripts.
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const API = 'https://zenodo.org/api';
const COMMUNITY_ID = '623bbae6-8970-4659-921a-d9ddf1637cee'; // agentic-learning-ai-lab
const INSTITUTION = 'Agentic Learning AI Lab, New York University';

function token() {
    const t = process.env.ZENODO_TOKEN;
    if (!t) {
        console.error('✗ ZENODO_TOKEN is not set. Add it to .env (gitignored) or the environment.');
        process.exit(1);
    }
    return t;
}

async function api(method, url, body, { raw = false } = {}) {
    const res = await fetch(url.startsWith('http') ? url : `${API}${url}`, {
        method,
        headers: {
            Authorization: `Bearer ${token()}`,
            'User-Agent': 'agenticlearning.ai-tech-reports',
            ...(raw ? { 'Content-Type': 'application/octet-stream' } : body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: raw ? body : body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${url}: HTTP ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
}

const reportNote = (number) => `Technical Report ${number}, ${INSTITUTION}.`;

// "First Middle Last" → "Last, First Middle", as Zenodo lists creators.
function creators(authors) {
    return authors.map((a) => {
        const parts = a.trim().split(/\s+/);
        const last = parts.pop();
        return { name: parts.length ? `${last}, ${parts.join(' ')}` : last };
    });
}

// Next AGL-TR-<year>-<nn>: one past the highest number in papers.yaml and
// in the token owner's Zenodo uploads (drafts included), so two reports
// reserved before either merges do not collide.
async function nextReportNumber(papers, year) {
    const re = new RegExp(`AGL-TR-${year}-(\\d+)`);
    let max = 0;
    for (const p of papers) {
        const m = re.exec(p.report_number || '');
        if (m) max = Math.max(max, Number(m[1]));
    }
    for (let page = 1; ; page++) {
        const deps = await api('GET', `/deposit/depositions?size=100&page=${page}`);
        for (const d of deps) {
            const m = re.exec((d.metadata && d.metadata.notes) || '');
            if (m) max = Math.max(max, Number(m[1]));
        }
        if (deps.length < 100) break;
    }
    return `AGL-TR-${year}-${String(max + 1).padStart(2, '0')}`;
}

const footnote = (number, doi) =>
    `{\\let\\thefootnote\\relax\\footnotetext{Agentic Learning AI Lab Technical Report ${number}. ` +
    `\\href{https://doi.org/${doi}}{doi:${doi}}}}`;

module.exports = { api, creators, nextReportNumber, reportNote, footnote, COMMUNITY_ID };
