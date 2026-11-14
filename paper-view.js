// Paper view toggle functionality
let paperContentLoaded = false;
let paperVisible = false;

// Initialize state from DOM on page load
function initializeToggleState() {
    const fullPaperView = document.getElementById('full-paper-view');
    const toggleText = document.getElementById('toggle-full-paper-text');
    const toggleIcon = document.getElementById('toggle-full-paper-icon');
    const contentEl = document.getElementById('paper-content');

    if (!fullPaperView || !toggleText || !toggleIcon) return;

    // Check if content is already visible (e.g., from browser back/forward cache)
    paperVisible = !fullPaperView.classList.contains('tw-hidden');
    paperContentLoaded = contentEl && contentEl.innerHTML.trim() !== '';

    // Sync button state with actual visibility
    if (paperVisible) {
        toggleText.textContent = 'Hide Full Paper (HTML)';
        toggleIcon.className = 'bi bi-arrow-up';
    } else {
        toggleText.textContent = 'Full Paper (HTML)';
        toggleIcon.className = 'bi bi-arrow-right';
    }
}

function toggleFullPaper() {
    const fullPaperView = document.getElementById('full-paper-view');
    const toggleText = document.getElementById('toggle-full-paper-text');
    const toggleIcon = document.getElementById('toggle-full-paper-icon');

    if (paperVisible) {
        // Hide the full paper
        fullPaperView.classList.add('tw-hidden');
        toggleText.textContent = 'Full Paper (HTML)';
        toggleIcon.className = 'bi bi-arrow-right';
        paperVisible = false;
    } else {
        // Show the full paper
        fullPaperView.classList.remove('tw-hidden');
        toggleText.textContent = 'Hide Full Paper (HTML)';
        toggleIcon.className = 'bi bi-arrow-up';
        paperVisible = true;

        // Load paper content if not already loaded
        if (!paperContentLoaded) {
            loadPaperContent().then(() => {
                // Scroll to introduction after content loads
                scrollToIntroduction();
            });
        } else {
            // Content already loaded, scroll immediately
            scrollToIntroduction();
        }
    }
}

function scrollToIntroduction() {
    // Try to find the first section (usually introduction)
    const firstSection = document.querySelector('#paper-content section[id^="S"]');

    if (firstSection) {
        // Scroll to the first section
        firstSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        // Fallback: scroll to paper content
        const paperContent = document.getElementById('paper-content');
        if (paperContent) {
            paperContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

async function loadPaperContent() {
    const loadingEl = document.getElementById('paper-loading');
    const contentEl = document.getElementById('paper-content');

    try {
        const response = await fetch('./paper-content.json');
        if (!response.ok) {
            throw new Error('Paper content not found');
        }

        const data = await response.json();

        // Inject CSS if present
        if (data.css) {
            const styleEl = document.createElement('style');
            styleEl.textContent = data.css;
            document.head.appendChild(styleEl);
        }

        // data.html ships with CDN URLs already baked in (see
        // build/rewrite_paper_content.js). No runtime rewriting needed.
        contentEl.innerHTML = data.html;
        loadingEl.style.display = 'none';
        paperContentLoaded = true;

        sizeFiguresLikePaper(contentEl);

        // Generate table of contents
        generateTableOfContents();

        // Enhance citations with reference information
        enhanceCitations();

        // If MathJax is available, typeset the new content
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([contentEl]).catch(err => {
                console.warn('MathJax typesetting failed:', err);
            });
        }

    } catch (error) {
        console.error('Failed to load paper content:', error);
        loadingEl.innerHTML = '<p class="tw-text-red-600">Failed to load paper content. Please try the PDF link above.</p>';
    }
}

// LaTeXML writes each figure's printed size into width/height at a fixed
// scale where \textwidth is 660px. Give each figure the same fraction of
// the text column it has in the PDF. Subfigure panels are sized by their
// flex cell instead: LaTeXML drops the subfigure widths, so panels in a
// row get widths proportional to their aspect ratios (equal heights),
// which is how most papers lay them out.
const LATEXML_TEXTWIDTH_PX = 660;
// Minipages and boxes inside figures carry fixed widths in pt against
// LaTeXML's \textwidth (6in = 433.6pt). Turn each into a share of its
// enclosing box so the layout scales with the column and a box never
// overflows its parent.
const LATEXML_TEXTWIDTH_PT = 433.6;

function ptWidth(el) {
    const m = /(?:^|;)\s*width:\s*([\d.]+)pt/.exec(el.getAttribute('style') || '');
    return m ? Number(m[1]) : 0;
}

// The PDF's text block is about 43 body-font sizes wide (6in at 10pt);
// the site's column is wider than that relative to its text. Cap each
// top-level figure at the same width in body-font units so figure labels
// keep the size they have next to the text in the PDF.
const PAPER_TEXTWIDTH_EM = 433.6 / 10;

function sizeFiguresLikePaper(root) {
    const em = parseFloat(getComputedStyle(root).fontSize) || 16;
    root.querySelectorAll('figure.ltx_figure').forEach(fig => {
        // Tables placed in a figure float read as tables: leave them full width.
        if (fig.parentElement.closest('figure') || fig.querySelector('.ltx_tabular')) return;
        fig.style.maxWidth = `${Math.round(PAPER_TEXTWIDTH_EM * em)}px`;
        fig.style.marginInline = 'auto';
    });
    // Read every pt width before rewriting any, since a child's share
    // depends on its parent's original width.
    // A figure's own pt width (wrapfigure) counts too.
    const boxes = [...root.querySelectorAll('figure.ltx_figure[style*="pt"], figure.ltx_figure [style*="pt"]')]
        .filter(el => !el.closest('.ltx_transformed_outer'))
        .map(el => [el, ptWidth(el)])
        .filter(([, pt]) => pt);
    const ptOf = new Map(boxes);
    boxes.forEach(([el, pt]) => {
        let parentPt = LATEXML_TEXTWIDTH_PT;
        // Nearest sized box: stop at the float (a top-level figure), not at
        // a minipage that LaTeXML also marks up as <figure>.
        for (let p = el.parentElement; p && p !== root && !(p.tagName === 'FIGURE' && !p.classList.contains('ltx_minipage')); p = p.parentElement) {
            if (ptOf.has(p)) { parentPt = ptOf.get(p); break; }
        }
        el.style.width = `${(Math.min(1, pt / parentPt) * 100).toFixed(1)}%`;
    });
    root.querySelectorAll('.ltx_flex_figure').forEach(flex => {
        // Rows are the runs of cells between ltx_flex_break elements.
        const rows = [[]];
        for (const child of flex.children) {
            if (child.classList.contains('ltx_flex_break')) rows.push([]);
            else if (child.classList.contains('ltx_flex_cell')) rows[rows.length - 1].push(child);
        }
        // Panel widths are fractions of \textwidth; inside a minipage
        // they are shares of that box, which LaTeXML gives in pt.
        let boxPt = LATEXML_TEXTWIDTH_PT;
        for (let p = flex.parentElement; p && !(p.tagName === 'FIGURE' && !p.classList.contains('ltx_minipage')); p = p.parentElement) {
            if (ptOf.has(p)) { boxPt = ptOf.get(p); break; }
        }
        const boxPx = LATEXML_TEXTWIDTH_PX * boxPt / LATEXML_TEXTWIDTH_PT;
        rows.forEach(row => {
            // Each cell is one image or one sized box (a minipage); its
            // share of the row is its printed width. Rows of anything else
            // keep the stylesheet's layout.
            const cells = row.map(cell => {
                const box = [...cell.children].find(el => ptOf.has(el));
                if (box && cell.children.length === 1) {
                    return { frac: ptOf.get(box) / boxPt, aspect: null, box };
                }
                const imgs = cell.querySelectorAll('img[width][height]');
                if (imgs.length !== 1) return null;
                const [w, h] = [Number(imgs[0].getAttribute('width')), Number(imgs[0].getAttribute('height'))];
                return { frac: w / boxPx, aspect: w / h, box: null };
            });
            if (!row.length || cells.some(c => !c)) return;
            const total = cells.reduce((a, c) => a + c.frac, 0);
            // Widths that fit the box are the panels' real sizes
            // (latexml-lab conversions); larger ones come from arXiv's
            // HTML, where LaTeXML dropped the subfigure widths, so fall
            // back to equal-height panels.
            const fits = total <= 1.02;
            if (!fits && cells.some(c => !c.aspect)) return;
            row.forEach((cell, i) => {
                const c = cells[i];
                cell.style.maxWidth = 'none';
                cell.style.flex = fits
                    ? `0 1 calc(${(c.frac * 100).toFixed(1)}% - 0.5rem)`
                    : `${c.aspect} 1 0`;
                if (c.box) c.box.style.width = '100%';
            });
        });
    });
    // The share of \textwidth an element's box has: a pt width is absolute;
    // a % width (arXiv's HTML) is a share of the box around it.
    const boxFrac = el => {
        for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
            if (ptOf.has(p)) return ptOf.get(p) / LATEXML_TEXTWIDTH_PT;
            const pct = /(?:^|;)\s*width:\s*([\d.]+)%/.exec(p.getAttribute('style') || '');
            if (pct) return Number(pct[1]) / 100 * boxFrac(p);
            if (p.tagName === 'FIGURE' && !p.classList.contains('ltx_minipage')) break;
        }
        return 1;
    };
    root.querySelectorAll('figure img[width]').forEach(img => {
        if (img.closest('.ltx_flex_cell')) return;
        const frac = Math.min(1, Number(img.getAttribute('width')) / LATEXML_TEXTWIDTH_PX / boxFrac(img));
        if (frac > 0) img.style.width = `${(frac * 100).toFixed(1)}%`;
    });
}

function enhanceCitations() {
    const contentEl = document.getElementById('paper-content');
    if (!contentEl) return;

    // Find all bibliography items and create a map of ID -> reference info
    const bibMap = new Map();
    const bibItems = contentEl.querySelectorAll('li.ltx_bibitem[id^="bib."]');

    console.log('Found', bibItems.length, 'bibliography items');

    bibItems.forEach(bibItem => {
        const id = bibItem.id;
        // Get the reference label (e.g., "Agrawal et al. [2015]")
        const refNum = bibItem.querySelector('.ltx_tag_bibitem');
        if (!refNum) return;

        const refText = refNum.textContent.trim();

        // Extract author and year
        let authors = '';
        let year = '';

        // Check if this is a numeric reference (e.g., "(5)" or "[5]")
        const isNumeric = /^\(?\d+\)?$/.test(refText);

        if (isNumeric) {
            // Extract from bibblock content instead
            const bibblocks = bibItem.querySelectorAll('.ltx_bibblock');
            if (bibblocks.length > 0) {
                const firstBlock = bibblocks[0].textContent.trim();
                // Pattern: "Author, A. (2019a)." or "Author et al. (2019)."
                let match = firstBlock.match(/^([^(]+?)\s*\((\d{4}[a-z]?)\)/);
                if (match) {
                    let authorText = match[1].trim();
                    year = match[2];

                    // Remove initials (e.g., "Chollet, F." -> "Chollet")
                    // Match last names before comma or "et al."
                    const authorMatch = authorText.match(/^([^,]+?)(?:,|\s+et al\.)/);
                    if (authorMatch) {
                        authors = authorMatch[1].trim();
                        // Add "et al." if present
                        if (/et al\./.test(authorText)) {
                            authors += ' et al.';
                        }
                    } else {
                        // Simple case: just use first part
                        authors = authorText.split(',')[0].trim();
                    }

                    // Update the refnum display to show author-year
                    refNum.textContent = `${authors}, (${year})`;
                }
            }
        } else {
            // Pattern 1: "Author et al. [2015]" or "Author [2015]"
            // Pattern 2: "Author et al., (2015)" or "Author, (2015)"
            // Pattern 3: "Author et al. (2015)" or "Author (2015)" - no comma
            let match = refText.match(/^(.+?)\s*\[(\d{4}[a-z]?)\]$/);
            if (!match) {
                match = refText.match(/^(.+?),\s*\((\d{4}[a-z]?)\)$/);
            }
            if (!match) {
                match = refText.match(/^(.+?)\s+\((\d{4}[a-z]?)\)$/);
            }

            if (match) {
                authors = match[1].trim();
                year = match[2];

                // Reformat from [year] to (year) if needed
                if (refText.includes('[')) {
                    refNum.textContent = refText.replace(/\[(\d{4}[a-z]?)\]/, '($1)');
                }
            }
        }

        // Paper title resolution. arXiv's HTML extraction puts titles
        // in different bibblock positions depending on the source
        // bibstyle:
        //   plain / apalike (anticipatory, arq, .bbl-injected papers):
        //     bibblocks[0] = authors, bibblocks[1] = title, [2] = venue
        //   arxiv-native (temporal-straightening etc.):
        //     bibblocks[0] = title (with <span class="ltx_bib_title">),
        //     bibblocks[1] = venue, [2] = "Cited by"
        // Prefer the semantic class when present — covers temporal-
        // straightening and any other native paper that emits .ltx_bib_title,
        // and matches what inject_bbl.js writes for plain/apalike entries.
        // Fall back to bibblocks[1] which covers the remaining
        // native papers whose title sits in the second block without
        // the semantic class.
        const bibblocks = bibItem.querySelectorAll('.ltx_bibblock');
        let title = '';
        const semanticTitle = bibItem.querySelector('.ltx_bib_title');
        if (semanticTitle) {
            title = semanticTitle.textContent.trim().replace(/\.$/, '');
        } else if (bibblocks.length >= 2) {
            title = bibblocks[1].textContent.trim().replace(/\.$/, '');
        } else if (bibblocks.length >= 1) {
            title = bibblocks[0].textContent.trim().replace(/\.$/, '');
        }

        // Store the formatted reference
        const formattedRef = authors && year ? `${authors}, (${year})` : refText;

        bibMap.set(id, {
            original: formattedRef,
            authors: authors,
            year: year,
            title: title
        });
    });

    // Find all citation elements and replace numeric citations with author-year format
    const citations = contentEl.querySelectorAll('cite.ltx_cite');

    citations.forEach(cite => {
        const links = cite.querySelectorAll('a.ltx_ref[href^="#bib."]');

        if (links.length === 0) return;

        // Check if this citation is already in author-year format BEFORE any modifications.
        // Matches:
        //   "Brown et al."          (multi-author)
        //   "Smith and Jones"       (two-author)
        //   "Anthropic, 2025"       (single-author citep, .bbl-injected — comma + 4-digit year)
        //   "Schmidhuber (2010)"    (single-author citet, .bbl-injected — name + ( + 4-digit year)
        const citeText = cite.textContent;
        // Note: textContent converts &amp; to & automatically, so we can match & directly
        const hasAuthors = /[A-Z][a-z]+\s+et al\.|[A-Z][a-z]+\s+(and|&|&amp;)\s+[A-Z][a-z]+|[A-Z][a-zA-Z]+,\s+\d{4}|[A-Z][a-zA-Z]+\s+\(\d{4}/.test(citeText);

        // Debug: log citations that don't match
        if (!hasAuthors && links.length > 1) {
            console.log('Multi-citation without authors detected:', citeText);
        }

        // If already in author-year format, just enhance tooltips and skip restructuring
        if (hasAuthors) {
            links.forEach(link => {
                const href = link.getAttribute('href');
                const bibId = href.substring(1);
                const data = bibMap.get(bibId);

                if (data && data.authors && data.year) {
                    // Add enhanced tooltip with title
                    link.setAttribute('data-ref-authors', data.authors);
                    link.setAttribute('data-ref-year', data.year);
                    link.setAttribute('data-ref-title', data.title || '');

                    // Add positioning on hover
                    setupTooltipPositioning(link);
                } else {
                    console.warn('Missing bibMap data for', bibId, 'in author-year citation');
                }
            });
            return; // Important: skip the rest of the processing
        }

        // Only process numeric citations (like [45]) from here on
        // Build the new citation text with author-year format
        const refData = [];
        links.forEach(link => {
            const href = link.getAttribute('href');
            const bibId = href.substring(1); // Remove the '#'
            const data = bibMap.get(bibId);

            if (data) {
                refData.push({ link, data });
            } else {
                console.warn('No bibMap entry found for:', bibId, 'in citation:', citeText);
            }
        });

        // Replace the citation content with author-year format (only for numeric citations)
        // Only proceed if every link has an author and year: a numbered bibliography
        // (e.g. a journal style whose tags are [1], [2]) keeps its numbers.
        if (refData.length > 0 && refData.length === links.length &&
            refData.every(item => item.data.authors && item.data.year)) {
            // Clear the cite element and rebuild it
            cite.textContent = '';
            cite.appendChild(document.createTextNode('('));

            refData.forEach((item, index) => {
                // Add author text (not clickable)
                if (item.data.authors) {
                    cite.appendChild(document.createTextNode(item.data.authors));
                    if (item.data.year) {
                        cite.appendChild(document.createTextNode(', '));
                    }
                }

                // Add year as clickable link
                if (item.data.year) {
                    item.link.textContent = item.data.year;

                    // Build tooltip with structured data
                    item.link.setAttribute('data-ref-authors', item.data.authors || '');
                    item.link.setAttribute('data-ref-year', item.data.year || '');
                    item.link.setAttribute('data-ref-title', item.data.title || '');

                    // Add positioning on hover
                    setupTooltipPositioning(item.link);

                    cite.appendChild(item.link);
                }

                // Add separator between citations
                if (index < refData.length - 1) {
                    cite.appendChild(document.createTextNode('; '));
                }
            });

            cite.appendChild(document.createTextNode(')'));
        } else if (refData.length !== links.length) {
            console.warn('Skipping citation conversion - incomplete bibMap data. Expected', links.length, 'got', refData.length);
        }
    });
}

function setupTooltipPositioning(link) {
    let tooltipEl = null;

    link.addEventListener('mouseenter', function () {
        const authors = link.getAttribute('data-ref-authors');
        const year = link.getAttribute('data-ref-year');
        const title = link.getAttribute('data-ref-title');

        if (!authors && !year) return;

        // Create tooltip element
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'citation-tooltip';

        // Create italic author/year line
        const refLine = document.createElement('div');
        refLine.style.fontStyle = 'italic';
        refLine.style.marginBottom = title ? '0.5rem' : '0';
        refLine.textContent = `${authors}, ${year}`;
        tooltipEl.appendChild(refLine);

        // Add title if present
        if (title) {
            const titleLine = document.createElement('div');
            titleLine.textContent = title;
            tooltipEl.appendChild(titleLine);
        }

        document.body.appendChild(tooltipEl);

        // Position the tooltip
        setTimeout(() => {
            const rect = link.getBoundingClientRect();
            const tooltipRect = tooltipEl.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const margin = 10;

            // Calculate tooltip position
            let left = rect.left + rect.width / 2;
            let top = rect.top - margin - tooltipRect.height;

            // Adjust horizontal position to stay within viewport
            if (left + tooltipRect.width / 2 > viewportWidth - margin) {
                left = viewportWidth - tooltipRect.width / 2 - margin;
            }
            if (left - tooltipRect.width / 2 < margin) {
                left = tooltipRect.width / 2 + margin;
            }

            // Check if too close to top - show below instead
            if (rect.top < tooltipRect.height + margin + 10) {
                top = rect.bottom + 10;
            }

            tooltipEl.style.left = `${left}px`;
            tooltipEl.style.top = `${top}px`;
            tooltipEl.style.transform = 'translateX(-50%)';
            tooltipEl.style.opacity = '1';
        }, 10);
    });

    link.addEventListener('mouseleave', function () {
        if (tooltipEl && tooltipEl.parentNode) {
            tooltipEl.remove();
            tooltipEl = null;
        }
    });
}

function generateTableOfContents() {
    const contentEl = document.getElementById('paper-content');
    const tocContainer = document.getElementById('paper-toc');
    const tocMobileContainer = document.getElementById('paper-toc-mobile');

    if (!contentEl) return;

    // Find all h2 sections (main sections)
    const sections = contentEl.querySelectorAll('h2, .ltx_title_section');

    if (sections.length === 0) return;

    const tocList = document.createElement('ul');
    tocList.className = 'paper-toc-list';

    const tocMobileList = document.createElement('ul');
    tocMobileList.className = 'paper-toc-list';

    sections.forEach((section, index) => {
        // Add ID to section if it doesn't have one
        if (!section.id) {
            section.id = `section-${index}`;
        }

        // Get section text
        let text = section.textContent.trim();

        // Remove section numbers if present (e.g., "1 Introduction" -> "Introduction")
        text = text.replace(/^\d+(\.\d+)*\s+/, '');

        // Create desktop TOC item
        const li = document.createElement('li');
        li.className = 'paper-toc-item';

        const link = document.createElement('a');
        link.href = `#${section.id}`;
        link.textContent = text;
        link.className = 'paper-toc-link';

        link.addEventListener('click', (e) => {
            e.preventDefault();

            // Disable scroll spy temporarily
            if (window.setManualScrollInProgress) {
                window.setManualScrollInProgress(true);
            }

            // Update active state immediately
            document.querySelectorAll('.paper-toc-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // Scroll to section (CSS scroll-padding-top handles spacing)
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });

            // Re-enable scroll spy after smooth scroll completes (longer for Chrome)
            setTimeout(() => {
                if (window.setManualScrollInProgress) {
                    window.setManualScrollInProgress(false);
                }
            }, 2500);
        });

        li.appendChild(link);
        tocList.appendChild(li);

        // Create mobile TOC item (clone)
        const liMobile = li.cloneNode(true);
        const linkMobile = liMobile.querySelector('a');
        linkMobile.addEventListener('click', (e) => {
            e.preventDefault();

            // Disable scroll spy temporarily
            if (window.setManualScrollInProgress) {
                window.setManualScrollInProgress(true);
            }

            // Update active state immediately
            document.querySelectorAll('.paper-toc-link').forEach(l => l.classList.remove('active'));
            document.querySelectorAll('.paper-toc-link').forEach(l => {
                if (l.href === linkMobile.href) l.classList.add('active');
            });

            // Close mobile menu
            toggleMobileNav();

            // Scroll to section (CSS scroll-padding-top handles spacing)
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });

            // Re-enable scroll spy after smooth scroll completes (longer for Chrome)
            setTimeout(() => {
                if (window.setManualScrollInProgress) {
                    window.setManualScrollInProgress(false);
                }
            }, 2500);
        });
        tocMobileList.appendChild(liMobile);
    });

    if (tocContainer) {
        tocContainer.innerHTML = '';
        tocContainer.appendChild(tocList);
    }

    if (tocMobileContainer) {
        tocMobileContainer.innerHTML = '';
        tocMobileContainer.appendChild(tocMobileList);
    }

    // Setup scroll spy
    setupScrollSpy(sections);

    // Mark sidebar as loaded to fade it in
    const sidebar = document.querySelector('.paper-sidebar');
    if (sidebar) {
        setTimeout(() => {
            sidebar.classList.add('loaded');
        }, 100);
    }
}

function setupScrollSpy(sections) {
    let manualScrollInProgress = false;

    // Function to update active link
    const updateActiveLink = (id) => {
        const activeLinks = document.querySelectorAll(`.paper-toc-link[href="#${id}"]`);

        if (activeLinks.length > 0) {
            // Remove active class from all links
            document.querySelectorAll('.paper-toc-link').forEach(link => {
                link.classList.remove('active');
            });

            // Add active class to current section
            activeLinks.forEach(link => {
                link.classList.add('active');

                // Scroll the active link into view within the TOC sidebar (desktop only)
                const sidebar = link.closest('.paper-sidebar-sticky');
                if (sidebar) {
                    const linkTop = link.offsetTop;
                    const linkHeight = link.offsetHeight;
                    const sidebarScroll = sidebar.scrollTop;
                    const sidebarHeight = sidebar.clientHeight;

                    // Check if link is out of view
                    if (linkTop < sidebarScroll || linkTop + linkHeight > sidebarScroll + sidebarHeight) {
                        // Scroll to center the active link
                        sidebar.scrollTo({
                            top: linkTop - sidebarHeight / 2 + linkHeight / 2,
                            behavior: 'smooth'
                        });
                    }
                }
            });
        }
    };

    // Use scroll event to find the section closest to the top
    const handleScroll = () => {
        if (manualScrollInProgress) return;

        // Get computed scroll padding from CSS
        const scrollPadding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        const threshold = scrollPadding + 50; // Add small buffer

        let currentSection = null;
        let minDistance = Infinity;

        sections.forEach(section => {
            const rect = section.getBoundingClientRect();
            const distanceFromTop = Math.abs(rect.top - threshold);

            // If section is in viewport and closer to threshold than previous sections
            if (rect.top <= threshold && distanceFromTop < minDistance) {
                minDistance = distanceFromTop;
                currentSection = section;
            }
        });

        // If no section is near top (scrolled to bottom), use the last visible section
        if (!currentSection) {
            for (let i = sections.length - 1; i >= 0; i--) {
                const rect = sections[i].getBoundingClientRect();
                if (rect.top < window.innerHeight) {
                    currentSection = sections[i];
                    break;
                }
            }
        }

        if (currentSection) {
            updateActiveLink(currentSection.id);
        }
    };

    // Detect when scrolling has stopped
    let scrollTimeout;

    window.addEventListener('scroll', () => {
        if (manualScrollInProgress) return; // Skip scroll events during manual navigation

        clearTimeout(scrollTimeout);

        // Wait until scrolling has stopped for 150ms before updating highlight
        scrollTimeout = setTimeout(() => {
            handleScroll();
        }, 150);
    });

    // Initial call
    handleScroll();

    // Store reference to manual scroll handler for link clicks
    window.setManualScrollInProgress = (value) => {
        manualScrollInProgress = value;
        if (!value) {
            setTimeout(handleScroll, 100);
        }
    };
}

function toggleMobileNav() {
    const mobileNav = document.getElementById('paper-nav-mobile');
    const toggleBtn = document.getElementById('mobile-nav-toggle');

    if (!mobileNav || !toggleBtn) return;

    mobileNav.classList.toggle('tw-hidden');

    // Update icon
    const icon = toggleBtn.querySelector('i');
    if (icon) {
        if (mobileNav.classList.contains('tw-hidden')) {
            icon.className = 'bi bi-list';
        } else {
            icon.className = 'bi bi-x';
        }
    }
}

// Constrain sidebar to not go above the paper content section
function constrainSidebarPosition() {
    const sidebar = document.querySelector('.paper-sidebar');
    const paperSection = document.getElementById('full-paper-view');

    if (!sidebar || !paperSection) return;

    const handleScroll = () => {
        const sectionTop = paperSection.getBoundingClientRect().top;
        const headerHeight = 50; // Height of the header

        // If the section top is below the desired sidebar position, clamp it
        if (sectionTop > headerHeight) {
            sidebar.style.top = `${sectionTop}px`;
        } else {
            sidebar.style.top = `${headerHeight}px`;
        }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial position
}

// Show/hide mobile nav button based on paper section visibility
function constrainMobileNavButton() {
    const mobileBtn = document.getElementById('mobile-nav-toggle');
    const paperSection = document.getElementById('full-paper-view');

    if (!mobileBtn || !paperSection) return;

    const handleScroll = () => {
        // Check if paper section is visible (not hidden)
        if (paperSection.classList.contains('tw-hidden')) {
            mobileBtn.style.display = 'none';
            return;
        }

        const sectionRect = paperSection.getBoundingClientRect();

        // Show button only when paper section is actually visible in viewport
        // Section must have entered viewport (top < innerHeight) AND not scrolled past (bottom > 0)
        // But also check that we've scrolled into the section (top <= 0 means section has reached top of viewport)
        if (sectionRect.top <= 0 && sectionRect.bottom > 0) {
            mobileBtn.style.display = 'flex';
        } else {
            mobileBtn.style.display = 'none';
        }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial check

    // Also watch for when the paper section becomes visible
    const observer = new MutationObserver(() => {
        handleScroll();
    });
    observer.observe(paperSection, { attributes: true, attributeFilter: ['class'] });
}

// Make mobile nav button draggable on touch screens with snap to edges/corners
function makeMobileNavButtonDraggable() {
    const mobileBtn = document.getElementById('mobile-nav-toggle');
    if (!mobileBtn) return;

    let isDragging = false;
    let hasMoved = false;
    let startX, startY, initialLeft, initialTop;

    const snapToEdge = () => {
        const rect = mobileBtn.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const margin = 20;
        let newLeft, newTop;

        // Determine which edge/corner is closest
        const distToLeft = centerX;
        const distToRight = viewportWidth - centerX;
        const distToTop = centerY;
        const distToBottom = viewportHeight - centerY;

        const minHorizontal = Math.min(distToLeft, distToRight);
        const minVertical = Math.min(distToTop, distToBottom);

        // Snap to corner if close to both edges, otherwise snap to nearest edge
        if (minHorizontal < viewportWidth / 3 && minVertical < viewportHeight / 3) {
            // Snap to corner
            newLeft = distToLeft < distToRight ? margin : viewportWidth - rect.width - margin;
            newTop = distToTop < distToBottom ? margin : viewportHeight - rect.height - margin;
        } else if (minHorizontal < minVertical) {
            // Snap to left or right edge
            newLeft = distToLeft < distToRight ? margin : viewportWidth - rect.width - margin;
            newTop = Math.max(margin, Math.min(rect.top, viewportHeight - rect.height - margin));
        } else {
            // Snap to top or bottom edge
            newTop = distToTop < distToBottom ? margin : viewportHeight - rect.height - margin;
            newLeft = Math.max(margin, Math.min(rect.left, viewportWidth - rect.width - margin));
        }

        mobileBtn.style.transition = 'all 0.3s ease-out';
        mobileBtn.style.left = `${newLeft}px`;
        mobileBtn.style.top = `${newTop}px`;
        mobileBtn.style.right = 'auto';
    };

    const onTouchStart = (e) => {
        isDragging = true;
        hasMoved = false;
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;

        const rect = mobileBtn.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        mobileBtn.style.transition = 'none';
    };

    const onTouchMove = (e) => {
        if (!isDragging) return;

        const touch = e.touches[0];
        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;

        // Mark as moved if dragged more than 5px
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
            hasMoved = true;
            e.preventDefault(); // Prevent scrolling when dragging
        }

        if (!hasMoved) return;

        let newLeft = initialLeft + deltaX;
        let newTop = initialTop + deltaY;

        // Constrain to viewport
        const btnWidth = mobileBtn.offsetWidth;
        const btnHeight = mobileBtn.offsetHeight;
        newLeft = Math.max(10, Math.min(newLeft, window.innerWidth - btnWidth - 10));
        newTop = Math.max(10, Math.min(newTop, window.innerHeight - btnHeight - 10));

        mobileBtn.style.left = `${newLeft}px`;
        mobileBtn.style.top = `${newTop}px`;
        mobileBtn.style.right = 'auto';
    };

    const onTouchEnd = (e) => {
        if (!isDragging) return;
        isDragging = false;

        if (hasMoved) {
            // Snap to nearest edge/corner
            snapToEdge();
            e.preventDefault(); // Prevent click event if dragged
        }
    };

    mobileBtn.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
}

// Initialize state on page load (including back/forward navigation)
document.addEventListener('DOMContentLoaded', () => {
    initializeToggleState();
    constrainSidebarPosition();
    constrainMobileNavButton();
    makeMobileNavButtonDraggable();
});

// Handle back/forward cache (Safari, Firefox)
window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
        initializeToggleState();
    }
});

// Support URL hash for direct linking
if (window.location.hash === '#full-paper') {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            toggleFullPaper();
        });
    } else {
        toggleFullPaper();
    }
}
