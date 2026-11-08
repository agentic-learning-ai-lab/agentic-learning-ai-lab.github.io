/**
 * When a paper's PDF must not be replaced by the CI build.
 *
 * - `pdf_override: '<reason>'` in papers.yaml: the PDF was placed by hand
 *   (rare; a paper that cannot compile on the pinned TeX Live).
 * - A Zenodo `doi:` whose record is published: the PDF is the DOI's file
 *   and must stay byte-identical to it (check_zenodo_pdfs.js).
 */

function zenodoId(paper) {
    const m = /^10\.5281\/zenodo\.(\d+)$/.exec(paper.doi || '');
    return m ? m[1] : null;
}

// Published record → its files; a reserved-but-unpublished DOI → null.
async function zenodoFiles(id) {
    const res = await fetch(`https://zenodo.org/api/records/${id}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'agenticlearning.ai-site-checks' },
    });
    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) throw new Error(`zenodo.org/api/records/${id}: HTTP ${res.status}`);
    return (await res.json()).files || [];
}

async function pdfLockReason(paper) {
    if (paper.pdf_override) return `pdf_override: ${paper.pdf_override}`;
    const id = zenodoId(paper);
    if (id && await zenodoFiles(id)) return `published on Zenodo as ${paper.doi}`;
    return null;
}

module.exports = { zenodoId, zenodoFiles, pdfLockReason };
