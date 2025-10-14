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

        // Inject HTML content
        contentEl.innerHTML = data.html;
        loadingEl.style.display = 'none';
        paperContentLoaded = true;

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

        // Get the paper title (usually in the second ltx_bibblock)
        const bibblocks = bibItem.querySelectorAll('.ltx_bibblock');
        let title = '';
        if (bibblocks.length >= 2) {
            title = bibblocks[1].textContent.trim();
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

        // Check if this citation is already in author-year format BEFORE any modifications
        // (e.g., contains text like "Brown et al.," before the link)
        const citeText = cite.textContent;
        // Note: textContent converts &amp; to & automatically, so we can match & directly
        const hasAuthors = /[A-Z][a-z]+\s+et al\.|[A-Z][a-z]+\s+(and|&|&amp;)\s+[A-Z][a-z]+/.test(citeText);

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
        // Only proceed if we have data for ALL links (to avoid breaking partially)
        if (refData.length > 0 && refData.length === links.length) {
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
