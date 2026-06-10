#!/usr/bin/env node

/**
 * Emit out/llms.txt — the agent-facing landing-page index, per the
 * llmstxt.org convention. A markdown file listing the lab's papers,
 * people, and research areas with links and short descriptions, so an
 * LLM crawler can ingest the corpus without first rendering every
 * HTML page.
 *
 * Run as part of build:cf (slim path). Reads only the YAML sources;
 * no binary deps.
 *
 * Layout:
 *   - H1 + blockquote: lab tagline (same as the home og:description)
 *   - "Machine-readable index" section: pointer to /assets/search-index.json
 *   - "Papers": one bullet per paper (sorted newest first)
 *   - "People": current members, then alumni
 *   - "Research areas": one bullet per area
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const SITE = 'https://agenticlearning.ai';
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');

function loadYaml(rel) {
    return yaml.load(fs.readFileSync(path.join(ROOT, rel), 'utf-8'));
}

function bullet(label, url, suffix) {
    const tail = suffix ? ` — ${suffix}` : '';
    return `- [${label}](${url})${tail}`;
}

function main() {
    const papers = loadYaml('data/papers.yaml');
    const people = loadYaml('data/people.yaml');
    const areas = loadYaml('data/research_areas.yaml');

    // Papers: newest first by date.
    const papersSorted = [...papers]
        .filter(p => p.permalink)
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    // People: current first, then alumni; preserve YAML order within each.
    const peopleCurrent = people.filter(p => p.permalink && p.current);
    const peopleAlumni = people.filter(p => p.permalink && !p.current);

    const lines = [];
    lines.push('# Agentic Learning AI Lab');
    lines.push('');
    lines.push('> The Agentic Learning AI Lab is a research group at New York University');
    lines.push('> founded in 2022 by Mengye Ren. We innovate learning algorithms that');
    lines.push('> enable future agentic AI to learn and adapt flexibly in the real');
    lines.push('> world.');
    lines.push('');
    lines.push('## Machine-readable index');
    lines.push('');
    lines.push(`A JSON index of every paper, person, and research area on this site is`);
    lines.push(`available at [/assets/search-index.json](${SITE}/assets/search-index.json).`);
    lines.push('Each entry has `type` (`paper`, `person`, or `research-area`), `title`,');
    lines.push('`url`, and a `description` or `abstract` field with full text.');
    lines.push('');
    lines.push('## Papers');
    lines.push('');
    for (const p of papersSorted) {
        const url = `${SITE}/research/${p.permalink}/`;
        lines.push(bullet(p.title, url, p.short_abstract));
    }
    lines.push('');
    lines.push('## People');
    lines.push('');
    for (const person of peopleCurrent) {
        const url = `${SITE}/people/${person.permalink}/`;
        lines.push(bullet(person.name, url, person.position));
    }
    if (peopleAlumni.length > 0) {
        lines.push('');
        lines.push('### Alumni');
        lines.push('');
        for (const person of peopleAlumni) {
            const url = `${SITE}/people/${person.permalink}/`;
            lines.push(bullet(person.name, url, person.position));
        }
    }
    lines.push('');
    lines.push('## Research areas');
    lines.push('');
    for (const a of areas) {
        if (!a.permalink) continue;
        const url = `${SITE}/areas/${a.permalink}/`;
        lines.push(bullet(a.title, url, a.keywords));
    }
    lines.push('');

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const outPath = path.join(OUT_DIR, 'llms.txt');
    fs.writeFileSync(outPath, lines.join('\n'));
    console.log(`✓ wrote llms.txt — ${papersSorted.length} papers, ${peopleCurrent.length + peopleAlumni.length} people, ${areas.length} areas`);
}

main();
