// Search functionality
let searchIndex = [];
let searchModal = null;
let searchInput = null;
let searchResults = null;

// Initialize search
async function initSearch() {
    try {
        const response = await fetch('/assets/search-index.json');
        searchIndex = await response.json();
        console.log(`Search index loaded: ${searchIndex.length} items`);
    } catch (error) {
        console.error('Failed to load search index:', error);
    }
}

// Simple fuzzy search function
function fuzzySearch(query, items) {
    if (!query || query.trim() === '') return [];

    const normalizedQuery = query.toLowerCase().trim();
    const words = normalizedQuery.split(/\s+/);

    const scored = items.map(item => {
        let score = 0;
        const titleLower = item.title.toLowerCase();
        const keywordsLower = item.keywords || '';

        // Exact title match gets highest score
        if (titleLower === normalizedQuery) {
            score += 100;
        }

        // Title starts with query
        if (titleLower.startsWith(normalizedQuery)) {
            score += 50;
        }

        // Title contains query
        if (titleLower.includes(normalizedQuery)) {
            score += 30;
        }

        // Check each word
        words.forEach(word => {
            if (titleLower.includes(word)) {
                score += 10;
            }
            if (keywordsLower.includes(word)) {
                score += 5;
            }
        });

        return { item, score };
    }).filter(({ score }) => score > 0);

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, 10).map(({ item }) => item);
}

// Open search modal
function openSearch() {
    if (!searchModal) {
        createSearchModal();
    }
    searchModal.classList.remove('search-hidden');
    searchModal.classList.add('search-visible');
    document.body.style.overflow = 'hidden';
    setTimeout(() => searchInput.focus(), 100);
}

// Close search modal
function closeSearch() {
    if (searchModal) {
        searchModal.classList.add('search-hidden');
        searchModal.classList.remove('search-visible');
        document.body.style.overflow = '';
        searchInput.value = '';
        searchResults.innerHTML = '';
    }
}

// Create search modal
function createSearchModal() {
    const modal = document.createElement('div');
    modal.id = 'search-modal';
    modal.className = 'search-modal-overlay';
    modal.innerHTML = `
        <div class="search-modal-content">
            <div class="search-header">
                <div class="search-input-container">
                    <i class="bi bi-search"></i>
                    <input
                        type="text"
                        id="search-input"
                        placeholder="Search papers, people, research areas..."
                        autocomplete="off"
                    />
                    <button onclick="closeSearch()" class="search-close-btn" aria-label="Close search">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
            </div>
            <div id="search-results" class="search-results">
                <div class="search-empty-state">
                    Start typing to search...
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    searchModal = modal;
    searchInput = document.getElementById('search-input');
    searchResults = document.getElementById('search-results');

    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeSearch();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !searchModal.classList.contains('search-hidden')) {
            closeSearch();
        }
    });

    // Search on input
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        performSearch(query);
    });

    // Handle keyboard navigation
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const firstResult = searchResults.querySelector('a');
            if (firstResult) {
                window.location.href = firstResult.href;
            }
        }
    });
}

// Perform search and display results
function performSearch(query) {
    if (!query || query.trim() === '') {
        searchResults.innerHTML = `
            <div class="search-empty-state">
                Start typing to search...
            </div>
        `;
        return;
    }

    const results = fuzzySearch(query, searchIndex);

    if (results.length === 0) {
        searchResults.innerHTML = `
            <div class="search-empty-state">
                No results found for "${query}"
            </div>
        `;
        return;
    }

    searchResults.innerHTML = results.map(result => {
        const typeLabel = result.type === 'paper' ? 'Paper' :
                         result.type === 'person' ? 'Person' :
                         'Area';
        const typeClass = result.type === 'paper' ? 'search-badge-paper' :
                         result.type === 'person' ? 'search-badge-person' :
                         'search-badge-area';

        let subtitle = '';
        if (result.type === 'paper' && result.authors) {
            subtitle = `<div class="search-result-subtitle">${result.authors}</div>`;
        } else if (result.type === 'person' && result.position) {
            subtitle = `<div class="search-result-subtitle">${result.position}</div>`;
        } else if (result.description) {
            subtitle = `<div class="search-result-subtitle tw-line-clamp-2">${result.description}</div>`;
        }

        // Add thumbnail if available with overlay badge
        const thumbnail = result.thumbnail ? `
            <div class="search-result-thumbnail">
                <img src="${result.thumbnail}" alt="${result.title}" />
                <span class="search-badge search-badge-overlay ${typeClass}">${typeLabel}</span>
            </div>
        ` : '';

        return `
            <a href="${result.url}" class="search-result-item">
                <div class="search-result-content">
                    ${thumbnail}
                    <div class="search-result-text">
                        <div class="search-result-title">${result.title}</div>
                        ${subtitle}
                    </div>
                    <i class="bi bi-arrow-right search-result-arrow"></i>
                </div>
            </a>
        `;
    }).join('');
}

// Initialize on page load
window.addEventListener('load', () => {
    initSearch();
});
