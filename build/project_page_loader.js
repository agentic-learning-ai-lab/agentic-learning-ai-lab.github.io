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
/**
 * Video shortcut helpers — used by the custom image renderer to emit a
 * <video> figure when the src has a video extension. Mirrors
 * resolveImagePaths() but skips the WebP sibling lookup (videos don't
 * have one) and skips the width-fallback (videos size off the wrapper).
 */
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;
const VIDEO_MIME = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
};
function mimeFor(src) {
    const m = src.match(VIDEO_EXT);
    return m ? VIDEO_MIME[m[1].toLowerCase()] : 'video/mp4';
}
function resolveVideoUrl(src, slug) {
    if (/^https?:/.test(src)) return src;
    const cleanSrc = src.replace(/^\.\//, '');
    const logical = `/assets/projects/${slug}/${cleanSrc}`;
    return loadManifest()[logical] || logical;
}
// MD `title` attr ("…") on an image carries a comma-separated list of
// allowed <video> attributes. Without a title we emit the standard
// muted-autoplay-loop pattern that the existing raw-HTML videos use
// across project pages — matches the previous in-place behavior, so
// migrating from raw HTML to `![cap](foo.mp4)` is a behavior-preserving
// rewrite.
const VIDEO_FLAG_ALLOWLIST = new Set([
    'autoplay', 'controls', 'loop', 'muted', 'playsinline',
]);
function parseVideoFlags(title) {
    if (!title) return 'autoplay muted loop playsinline preload="metadata"';
    const flags = title.split(',')
        .map(s => s.trim().toLowerCase())
        .filter(s => VIDEO_FLAG_ALLOWLIST.has(s));
    // Always include preload="metadata" — bandwidth-friendly default
    // that still lets iOS Safari pull the first frame for the poster.
    return [...flags, 'preload="metadata"'].join(' ');
}

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
    //
    // VIDEO SHORTCUT: when src ends in .mp4 / .webm / .mov / .m4v we
    // emit a <video> figure instead, so authors can write
    //     ![Caption](demo.mp4)
    // instead of the 6-line raw <figure><video><source>…</figure> HTML
    // that was previously needed (see data/projects/poodle.md and
    // midway-network.md's pre-cleanup state). Optional MD title attr
    // overrides the default player flags:
    //     ![Caption](demo.mp4 "autoplay,muted,loop,playsinline")
    //     ![Caption](demo.mp4 "controls")            // no autoplay
    md.renderer.rules.image = function (tokens, idx) {
        const token = tokens[idx];
        const src = token.attrGet('src') || '';
        const widthAttr = token.attrGet('width');
        const altText = token.content || '';
        const titleAttr = token.attrGet('title');

        const widthStyle = widthAttr ? ` style="max-width: ${parseInt(widthAttr, 10)}px;"` : '';
        const altEsc = htmlEscape(altText);
        const captionHtml = altText
            ? `<figcaption class="tw-text-base tw-text-[var(--fg-muted)] tw-mt-4 tw-italic tw-inline-block tw-text-left">${altEsc}</figcaption>`
            : '';

        if (VIDEO_EXT.test(src)) {
            const videoUrl = resolveVideoUrl(src, slug);
            const flags = parseVideoFlags(titleAttr);
            let html = `<figure class="tw-text-center tw-my-10">`;
            html += `<div class="tw-mx-auto"${widthStyle}>`;
            html += `<video ${flags} style="width: 100%; height: auto; border-radius: 0.25rem;">`;
            html += `<source src="${videoUrl}" type="${mimeFor(src)}">`;
            html += `</video>`;
            html += captionHtml;
            html += `</div></figure>`;
            return html;
        }

        const { pngUrl, webpUrl } = resolveImagePaths(src, slug);
        const sourceTag = webpUrl
            ? `<source srcset="${webpUrl}" type="image/webp">`
            : '';

        let html = `<figure class="tw-text-center tw-my-10">`;
        html += `<div class="tw-mx-auto"${widthStyle}>`;
        html += `<picture>${sourceTag}<img src="${pngUrl}" alt="${altEsc}" class="tw-w-full tw-h-auto tw-rounded" loading="lazy"></picture>`;
        // Caption sits INSIDE the image wrapper so it inherits the
        // same max-width (the {width=N} attribute on the MD image,
        // or the section column width if none). inline-block +
        // figure's text-center keeps short captions centered;
        // long captions hit the wrapper width and wrap left-aligned.
        html += captionHtml;
        html += `</div>`;
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

    // Rewrite local /assets/projects/<slug>/... references to the
    // manifest CDN URL when available. The image renderer already
    // does this for `![]()` markdown, but inline HTML <video> and
    // <source> tags pass through markdown-it untouched. Without
    // this rewrite they'd be served from CF Pages origin instead
    // of the CDN — slower, and CF Pages serves large MP4s with
    // less mobile-friendly headers (no proper range requests).
    //
    // Assumption: this regex handles exactly one URL per quoted
    // attribute (src="…", href="…", url(…)). It would NOT correctly
    // rewrite a multi-URL `srcset="…, …, …"` attribute (only the
    // first URL after the opening quote would be matched) — keep
    // an eye out if a future project page authors `<source srcset>`
    // by hand. The MD image renderer's webp <source> path already
    // emits the CDN URL directly via the manifest, so it's not a
    // problem for the existing pipeline.
    const manifest = loadManifest();
    const assetPrefix = `/assets/projects/${slug}/`;
    const assetPattern = new RegExp(`(["'\\(])(${assetPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"'\\)\\s]+)`, 'g');
    rendered = rendered.replace(assetPattern, (_, quote, logical) => {
        const cdn = manifest[logical];
        return cdn ? `${quote}${cdn}` : `${quote}${logical}`;
    });

    // markdown-it wraps standalone-image lines in <p>...</p>, producing
    // invalid `<p><figure>...</figure></p>` (figure is block-level). Unwrap.
    rendered = rendered.replace(/<p>\s*(<figure[\s\S]*?<\/figure>)\s*<\/p>/g, '$1');

    // Extract H2 titles into a table-of-contents array and inject an
    // `id` attribute on each <h2> so the ToC pill bar in project.hbs
    // can anchor-scroll to them. Slug is derived from the heading's
    // plain-text content (stripping any inner <em>/<strong> markup).
    //
    // Authors can override the ToC pill label per heading by writing
    // `## Long heading {data-toc=Short}` in MD — markdown-it-attrs
    // attaches the attribute, we read it for the ToC text, then strip
    // it from the rendered HTML so it doesn't leak into the page.
    const toc = [];
    rendered = rendered.replace(/<h2([^>]*)>([\s\S]+?)<\/h2>/g, (_, attrs, inner) => {
        const tocMatch = attrs.match(/\s*data-toc="([^"]+)"/);
        const tocLabel = tocMatch ? tocMatch[1] : inner;
        const plainText = inner.replace(/<[^>]+>/g, '').trim();
        const slug = plainText.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        toc.push({ slug, text: tocLabel });
        const cleanAttrs = attrs.replace(/\s*data-toc="[^"]+"/, '');
        return `<h2 id="${slug}"${cleanAttrs}>${inner}</h2>`;
    });

    const body_html = wrapSections(rendered);

    return {
        ...frontmatter,
        body_html,
        toc,
    };
}

module.exports = { loadOne };
