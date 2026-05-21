const itemsPerPage = 4;
let currentPage = 1;

let items = [];
let totalPages = 0;
const maxVisiblePages = 5; // Number of pages to show at once

// Read ?page=N from the URL. Clamp to [1, totalPages]; bad/missing → 1.
function getPageFromUrl() {
    const p = parseInt(new URLSearchParams(window.location.search).get('page'), 10);
    return Number.isFinite(p) && p >= 1 && p <= totalPages ? p : 1;
}

// Mirror currentPage into the URL so refresh / share / back lands on
// the same page. Drop the param on page 1 to keep the URL canonical.
function syncUrl(page) {
    const url = new URL(window.location);
    if (page === 1) url.searchParams.delete('page');
    else url.searchParams.set('page', page);
    history.pushState({ page }, '', url);
}

function initPagination() {
    items = document.querySelectorAll('.person-paper-item');
    totalPages = Math.ceil(items.length / itemsPerPage);

    // Hide pagination if there are fewer items than itemsPerPage
    const paginationControls = document.querySelector('.pagination-controls');
    if (paginationControls) {
        if (items.length <= itemsPerPage) {
            paginationControls.style.display = 'none';
        } else {
            paginationControls.style.display = 'flex';
        }
    }

    if (items.length > 0) {
        showPage(getPageFromUrl(), 0, { skipUrl: true });
    }
}

function showPage(page, timeout, { skipUrl = false } = {}) {
    const flexContainer = document.getElementById('flexContainer');
    if (!flexContainer) return;

    flexContainer.style.visibility = 'hidden';

    // Scroll to the papers section on user-driven navigation. Skip on
    // initial load / popstate so direct ?page= links don't jerk the
    // viewport on arrival.
    const papersSection = flexContainer.parentElement;
    if (papersSection && page !== 1 && !skipUrl) {
        papersSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // After scrolling, show the content with a short delay
    setTimeout(() => {
        items.forEach((item, index) => {
            item.style.display = (index >= (page - 1) * itemsPerPage && index < page * itemsPerPage) ? 'block' : 'none';
        });
        flexContainer.style.visibility = 'visible'; // Reveal content
        currentPage = page;
        updateButtons();
        displayPageNumbers();
        if (!skipUrl) syncUrl(page);
    }, timeout); // Adjust delay as needed for scroll duration
}

function nextPage() {
    if (currentPage < totalPages) {
        showPage(currentPage + 1, 300);
    }
}

function prevPage() {
    if (currentPage > 1) {
        showPage(currentPage - 1, 300);
    }
}

function updateButtons() {
    const prevButton = document.getElementById('prevButton');
    const nextButton = document.getElementById('nextButton');

    if (prevButton) prevButton.disabled = (currentPage === 1);
    if (nextButton) nextButton.disabled = (currentPage === totalPages);
}

function displayPageNumbers() {
    const pageNumbers = document.getElementById('pageNumbers');
    if (!pageNumbers) return;

    pageNumbers.innerHTML = ''; // Clear previous page numbers

    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    // Adjust startPage if we're close to the end
    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    // Render the page buttons
    for (let i = startPage; i <= endPage; i++) {
        const pageButton = document.createElement('button');
        pageButton.innerText = i;
        pageButton.className = `tw-px-2 tw-py-1 ${i === currentPage ? 'tw-bg-black tw-text-white' : 'tw-bg-gray-200 tw-text-black'}`;
        pageButton.disabled = (i === currentPage); // Disable the current page button
        pageButton.onclick = () => showPage(i, 300);
        pageNumbers.appendChild(pageButton);
    }
}

// Initialize the pagination display on load
document.addEventListener('DOMContentLoaded', initPagination);

// Browser back / forward should move between pagination pages.
window.addEventListener('popstate', () => {
    if (items.length > 0) showPage(getPageFromUrl(), 0, { skipUrl: true });
});
