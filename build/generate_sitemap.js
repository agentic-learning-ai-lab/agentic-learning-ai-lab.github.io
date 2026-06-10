#!/usr/bin/env node

/**
 * Emit out/sitemap.xml listing every public URL on the site. Run as
 * part of build:cf (slim path) so the live site always ships a current
 * sitemap. No binary deps — reads only the YAML sources.
 *
 * URL set:
 *   /                       — home
 *   /research/              — paper listing
 *   /people/                — people listing
 *   /contact/               — contact form
 *   /research/<slug>/       — one per paper in data/papers.yaml
 *   /people/<slug>/         — one per person in data/people.yaml
 *   /areas/<slug>/          — one per research area
 *   /<slug>/                — one per paper with project_page: true
 *
 * `lastmod` uses paper.date when known (papers have ISO timestamps).
 * Other URLs omit lastmod — sitemap.xml lastmod is optional and a
 * fabricated date is worse than none.
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

function urlEntry(loc, lastmod) {
    const parts = [`  <url>`, `    <loc>${SITE}${loc}</loc>`];
    if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`);
    parts.push(`  </url>`);
    return parts.join('\n');
}

function isoDate(d) {
    if (!d) return null;
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
}

function main() {
    const papers = loadYaml('data/papers.yaml');
    const people = loadYaml('data/people.yaml');
    const areas = loadYaml('data/research_areas.yaml');

    const entries = [];

    // Static top-level pages.
    entries.push(urlEntry('/'));
    entries.push(urlEntry('/research/'));
    entries.push(urlEntry('/people/'));
    entries.push(urlEntry('/contact/'));

    // Paper detail pages.
    for (const p of papers) {
        if (!p.permalink) continue;
        entries.push(urlEntry(`/research/${p.permalink}/`, isoDate(p.date)));
    }

    // Project landing pages (papers with project_page: true).
    for (const p of papers) {
        if (!p.permalink || !p.project_page) continue;
        entries.push(urlEntry(`/${p.permalink}/`, isoDate(p.date)));
    }

    // People bio pages.
    for (const person of people) {
        if (!person.permalink) continue;
        entries.push(urlEntry(`/people/${person.permalink}/`));
    }

    // Research area pages.
    for (const a of areas) {
        if (!a.permalink) continue;
        entries.push(urlEntry(`/areas/${a.permalink}/`));
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`;

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const outPath = path.join(OUT_DIR, 'sitemap.xml');
    fs.writeFileSync(outPath, xml);
    console.log(`✓ wrote sitemap.xml — ${entries.length} URLs`);
}

main();
