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
        toggleText.textContent = 'Full Paper (HTML) (Experimental)';
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
        toggleText.textContent = 'Full Paper (HTML) (Experimental)';
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
            loadPaperContent();
        }

        // Scroll to the full paper section
        fullPaperView.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

// Initialize state on page load (including back/forward navigation)
document.addEventListener('DOMContentLoaded', initializeToggleState);

// Handle back/forward cache (Safari, Firefox)
window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
        initializeToggleState();
    }
});

// Support URL hash for direct linking
if (window.location.hash === '#full-paper') {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            toggleFullPaper();
        });
    } else {
        toggleFullPaper();
    }
}
