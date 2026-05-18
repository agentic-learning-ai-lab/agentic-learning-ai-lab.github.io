'use strict';

/**
 * Load per-paper project page content from data/projects/<slug>.md.
 *
 * Each MD file has YAML frontmatter (affiliations, links, bibtex,
 * mathjax flag) + a markdown body. The body is rendered through
 * markdown-it with a custom image renderer that emits <figure> +
 * <picture> blocks pointing at CDN URLs from assets-manifest.json
 * (with WebP source + PNG fallback, matching the {{pictureCdn}} helper
 * used elsewhere).
 *
 * Returned shape per slug:
 *   {
 *     affiliations: [...] | undefined,
 *     links: { arxiv, pdf, code, video, poster, slides, huggingface } | {},
 *     bibtex: string | undefined,
 *     mathjax: boolean,
 *     hero: { src, caption } | undefined,
 *     custom_html: string | undefined,
 *     body_html: string,                  // pre-rendered HTML for direct
 *                                         // insertion into project.hbs
 *   }
 *
 * project.hbs renders `body_html` as one big block ({{{body_html}}}).
 * Section breaks come from H2 headers in the markdown — rendered as
 * <h2> tags that pick up the .project-section + .project-section
 * scene-break CSS rule via a wrapping <section> from the loader.
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const MarkdownIt = require('markdown-it');
const mdAttrs = require('markdown-it-attrs');

const ROOT = path.resolve(__dirname, '..');
const PROJECTS_DIR = path.join(ROOT, 'data', 'projects');
const ASSETS_MANIFEST_PATH = path.join(ROOT, 'assets-manifest.json');

let _manifest = null;
function loadManifest() {
    if (_manifest) return _manifest;
    if (fs.existsSync(ASSETS_MANIFEST_PATH)) {
        _manifest = JSON.parse(fs.readFileSync(ASSETS_MANIFEST_PATH, 'utf-8'));
    } else {
        _manifest = {};
    }
    return _manifest;
}

function htmlEscape(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

/**
 * Resolve a project-relative image path to its CDN URL.
 *
 * Authors write `![Alt](teaser.png)` where the path is relative to
 * `assets/projects/<slug>/`. We expand to the logical path
 * `/assets/projects/<slug>/teaser.png`, look it up in the manifest,
 * and return the CDN URL. Also tries the .webp sibling.
 *
 * Returns { pngUrl, webpUrl }. Either can be the original relative
 * path if no manifest entry exists (graceful degradation).
 */
function resolveImagePaths(src, slug) {
    if (/^https?:/.test(src)) {
        // Author wrote an absolute URL — pass through.
        return { pngUrl: src, webpUrl: null };
    }
    const cleanSrc = src.replace(/^\.\//, '');
    const logical = `/assets/projects/${slug}/${cleanSrc}`;
    const webpLogical = logical.replace(/\.(png|jpg|jpeg)$/i, '.webp');

    const manifest = loadManifest();
    const pngUrl = manifest[logical] || logical;

    // WebP source: prefer the CDN URL from the manifest. If sync:r2
    // hasn't run yet, fall back to the local sibling path when the
    // .webp file actually exists on disk — so CF Pages staging serves
    // WebP via origin until the manifest entry lands. Without the
    // disk check we'd emit a broken <source> for slugs that skipped
    // build:webp (e.g. a paper with only an external URL hero).
    let webpUrl = null;
    if (webpLogical !== logical) {
        if (manifest[webpLogical]) {
            webpUrl = manifest[webpLogical];
        } else {
            const webpAbs = path.join(ROOT, webpLogical.replace(/^\//, ''));
            if (fs.existsSync(webpAbs)) {
                webpUrl = webpLogical;
            }
        }
    }
    return { pngUrl, webpUrl };
}

/**
 * Build a markdown-it instance configured for a specific paper slug.
 * The image renderer is slug-aware so it can resolve relative paths
 * against `assets/projects/<slug>/`.
 */
function makeRenderer(slug) {
    // `html: true` is safe here because the only input is committed
    // files under data/projects/, which we control. Do NOT enable this
    // if MD ever starts coming from an untrusted source (PR-form
    // submissions, end-user uploads, etc.) — markdown-it would pass
    // raw HTML straight through, including any embedded <script>.
    const md = new MarkdownIt({ html: true, linkify: false, breaks: false })
        .use(mdAttrs);

    // Custom image renderer: wrap in <figure> + <picture> + <figcaption>.
    // The alt text is used as the caption (academic convention — the
    // alt IS the caption description). markdown-it parses the alt out
    // of inline children of the image token.
    md.renderer.rules.image = function (tokens, idx) {
        const token = tokens[idx];
        const src = token.attrGet('src') || '';
        const widthAttr = token.attrGet('width');
        const altText = token.content || '';

        const { pngUrl, webpUrl } = resolveImagePaths(src, slug);

        const widthStyle = widthAttr ? ` style="max-width: ${parseInt(widthAttr, 10)}px;"` : '';
        const altEsc = htmlEscape(altText);

        const sourceTag = webpUrl
            ? `<source srcset="${webpUrl}" type="image/webp">`
            : '';

        let html = `<figure class="tw-text-center tw-my-10">`;
        html += `<div class="tw-mx-auto"${widthStyle}>`;
        html += `<picture>${sourceTag}<img src="${pngUrl}" alt="${altEsc}" class="tw-w-full tw-h-auto tw-rounded" loading="lazy"></picture>`;
        html += `</div>`;
        if (altText) {
            html += `<figcaption class="tw-text-base tw-text-gray-600 tw-mt-4 tw-italic tw-max-w-2xl tw-mx-auto">${altEsc}</figcaption>`;
        }
        html += `</figure>`;
        return html;
    };

    // Wrap H2 + following content into a .project-section so the
    // existing CSS divider rule applies between sections.
    //
    // Strategy: post-process the rendered HTML to insert section
    // markers. Simpler than overriding multiple renderers. See loadOne.

    return md;
}

/**
 * Wrap H2-delimited chunks in <section class="project-section ...">.
 * Each chunk = an H2 + everything until the next H2 (or end of body).
 * This produces the same DOM shape as the old YAML-driven schema and
 * picks up the .project-section + .project-section CSS scene-break rule.
 */
function wrapSections(html) {
    const parts = html.split(/(?=<h2\b)/i);
    if (parts.length <= 1) return html; // no sections, render as-is
    return parts.map((p, i) => {
        if (i === 0 && !/^<h2\b/i.test(p)) {
            // Content before the first H2 — keep as a preamble block,
            // not a .project-section (so it doesn't get a divider above).
            return p.trim() ? `<div class="project-preamble">${p}</div>` : '';
        }
        // No bottom margin on individual sections — the .project-section
        // + .project-section CSS rule (index.css) controls the gap to
        // the next section symmetrically via padding-top + ::before
        // separator. Adding mb here would imbalance the divider gap.
        return `<section class="project-section tw-max-w-4xl tw-mx-auto tw-px-6">${p.trim()}</section>`;
    }).join('\n');
}

function loadOne(slug) {
    const mdPath = path.join(PROJECTS_DIR, `${slug}.md`);
    if (!fs.existsSync(mdPath)) {
        return null;
    }
    const raw = fs.readFileSync(mdPath, 'utf-8');
    const { data: frontmatter, content: body } = matter(raw);

    const md = makeRenderer(slug);

    // Stash math blocks before markdown-it sees them — otherwise it
    // happily eats `_` as emphasis delimiters and `{` / `}` as plain
    // text, mangling LaTeX like `\underbrace{...}_{\substack{...}}`
    // beyond what MathJax can recover. Display ($$…$$) first because
    // greedy doubles include any single-$ pairs inside.
    // Use HTML-comment sentinels — markdown-it with html:true
    // preserves them verbatim in both block and inline contexts.
    const mathStash = [];
    function stash(piece) {
        mathStash.push(piece);
        return `<!--MATH${mathStash.length - 1}-->`;
    }
    const protectedBody = body
        .replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => stash(`$$${m}$$`))
        .replace(/(^|[^\\])\$([^\$\n]+?)\$/g, (_, pre, m) => `${pre}${stash(`$${m}$`)}`);

    let rendered = md.render(protectedBody);

    // Restore stashed math. Authors write display math on its own
    // paragraph, which markdown-it wraps in <p>…</p> — MathJax 3
    // handles `$$…$$` inside <p> fine, so leave it.
    rendered = rendered.replace(/<!--MATH(\d+)-->/g, (_, i) => mathStash[+i]);

    // markdown-it wraps standalone-image lines in <p>...</p>, producing
    // invalid `<p><figure>...</figure></p>` (figure is block-level). Unwrap.
    rendered = rendered.replace(/<p>\s*(<figure[\s\S]*?<\/figure>)\s*<\/p>/g, '$1');

    const body_html = wrapSections(rendered);

    return {
        ...frontmatter,
        body_html,
    };
}

module.exports = { loadOne };
