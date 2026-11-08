'use strict';

/**
 * Schema.org JSON-LD generators for paper / person / organization
 * pages. Output is a JSON string ready to drop inside a
 * <script type="application/ld+json"> block via Handlebars triple-brace.
 *
 * Why a helper module: paper titles and abstracts routinely contain
 * apostrophes, quotes, math symbols, and the `</script>` antipattern
 * an attacker could try to inject. JSON.stringify handles escaping
 * correctly; doing it inline in a Handlebars template doesn't.
 */

const SITE = 'https://agenticlearning.ai';

const LAB = Object.freeze({
    '@type': 'Organization',
    name: 'Agentic Learning AI Lab',
    url: SITE,
    parentOrganization: {
        '@type': 'CollegeOrUniversity',
        name: 'New York University',
        url: 'https://www.nyu.edu/',
    },
});

// Embed-safe stringify: escape `</` so a `</script>` substring inside
// any field can't terminate the surrounding <script> block. Standard
// JSON parsers accept `<\/`.
function stringify(obj) {
    return JSON.stringify(obj, null, 2).replace(/<\//g, '<\\/');
}

function paperJsonLd(paper, opts = {}) {
    const cdnUrl = opts.cdnUrl || (p => p);
    const url = `${SITE}/research/${paper.permalink}/`;
    const ld = {
        '@context': 'https://schema.org',
        '@type': 'ScholarlyArticle',
        headline: paper.title,
        name: paper.title,
        url,
        abstract: paper.abstract || paper.short_abstract || '',
        author: (paper.authors || []).map(name => ({ '@type': 'Person', name })),
        publisher: LAB,
    };
    if (paper.date) {
        // Render as ISO-8601 date (YYYY-MM-DD) — schema.org datePublished
        // accepts that form and it's what crawlers expect.
        ld.datePublished = new Date(paper.date).toISOString().slice(0, 10);
    }
    if (paper.image) {
        ld.image = cdnUrl(paper.image);
    }
    if (paper.journal) {
        ld.publication = paper.journal;
    }
    // sameAs: external canonical URLs that identify the same work.
    const sameAs = [];
    if (paper.doi) sameAs.push(`https://doi.org/${paper.doi}`);
    if (paper.arxiv) sameAs.push(paper.arxiv);
    if (sameAs.length) ld.sameAs = sameAs;
    const identifier = [];
    if (paper.doi) identifier.push({ '@type': 'PropertyValue', propertyID: 'DOI', value: paper.doi });
    if (paper.report_number) identifier.push({ '@type': 'PropertyValue', propertyID: 'Technical report', value: paper.report_number });
    if (identifier.length) ld.identifier = identifier;
    return stringify(ld);
}

const REPORT_INSTITUTION = 'Agentic Learning AI Lab, New York University';

const escapeAttr = (v) => String(v)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Google Scholar's citation_* meta tags (its inclusion guidelines), as an
 * HTML string. Scholar reads these, not JSON-LD. A paper with a
 * `report_number` is a technical report of the lab.
 */
function paperCitationMeta(paper, { pdfUrl } = {}) {
    const tags = [['citation_title', paper.title]];
    for (const name of paper.authors || []) tags.push(['citation_author', name]);
    if (paper.date) {
        tags.push(['citation_publication_date', new Date(paper.date).toISOString().slice(0, 10).replace(/-/g, '/')]);
    }
    if (paper.report_number) {
        tags.push(['citation_technical_report_number', paper.report_number]);
        tags.push(['citation_technical_report_institution', REPORT_INSTITUTION]);
    }
    if (paper.doi) tags.push(['citation_doi', paper.doi]);
    tags.push(['citation_abstract_html_url', `${SITE}/research/${paper.permalink}/`]);
    if (pdfUrl) tags.push(['citation_pdf_url', pdfUrl]);
    return tags.map(([k, v]) => `<meta name="${k}" content="${escapeAttr(v)}" />`).join('\n    ');
}

function personJsonLd(person, opts = {}) {
    const cdnUrl = opts.cdnUrl || (p => p);
    const url = `${SITE}/people/${person.permalink}/`;
    const ld = {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: person.name,
        url,
        description: person.description || '',
        affiliation: LAB,
    };
    if (person.position) ld.jobTitle = person.position;
    if (person.image) ld.image = cdnUrl(person.image);
    const sameAs = [];
    if (person.webpage) sameAs.push(person.webpage);
    if (person.google_scholar) {
        sameAs.push(`https://scholar.google.com/citations?user=${person.google_scholar}`);
    }
    if (sameAs.length) ld.sameAs = sameAs;
    return stringify(ld);
}

function organizationJsonLd() {
    const ld = {
        '@context': 'https://schema.org',
        ...LAB,
        description:
            'The Agentic Learning AI Lab is a research group at New York ' +
            'University founded in 2022 by Mengye Ren. We innovate learning ' +
            'algorithms that enable future agentic AI to learn and adapt ' +
            'flexibly in the real world.',
        foundingDate: '2022',
        founder: { '@type': 'Person', name: 'Mengye Ren' },
    };
    return stringify(ld);
}

module.exports = {
    paperCitationMeta, paperJsonLd, personJsonLd, organizationJsonLd };
