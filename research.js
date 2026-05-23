const itemsPerPage = 3;
let currentPage = 1;

const items = document.querySelectorAll('.page-item');
const totalPages = Math.ceil(items.length / itemsPerPage);
const maxVisiblePages = 5; // Number of pages to show at once

// Read ?page=N from the URL. Clamp to [1, totalPages]; bad/missing → 1.
function getPageFromUrl() {
    const p = parseInt(new URLSearchParams(window.location.search).get('page'), 10);
    return Number.isFinite(p) && p >= 1 && p <= totalPages ? p : 1;
}

// Mirror currentPage into the URL so refresh / share / back lands on
// the same page. Drop the param on page 1 to keep /research/ canonical.
function syncUrl(page, { push } = { push: true }) {
    const url = new URL(window.location);
    if (page === 1) url.searchParams.delete('page');
    else url.searchParams.set('page', page);
    const fn = push ? 'pushState' : 'replaceState';
    history[fn]({ page }, '', url);
}

function showPage(page, timeout, { skipUrl = false } = {}) {
    const flexContainer = document.getElementById('flexContainer');
    flexContainer.style.visibility = 'hidden';

    window.scrollTo({ top: 0, behavior: 'auto' });

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

function goToLastPage() {
    showPage(totalPages, 300);
}

function updateButtons() {
    document.getElementById('prevButton').disabled = (currentPage === 1);
    document.getElementById('nextButton').disabled = (currentPage === totalPages);

    // // Set the text of the last page button to the last page number
    // const lastPageButton = document.getElementById('lastPageButton');
    // lastPageButton.innerText = totalPages;
    // lastPageButton.disabled = (currentPage === totalPages); // Disable if on the last page
}

function displayPageNumbers() {
    const pageNumbers = document.getElementById('pageNumbers');
    pageNumbers.innerHTML = ''; // Clear previous page numbers

    // Ellipsis-style: always show first + last + current ± neighbors,
    // with "…" filling any gaps. With neighbors=1 and totalPages=10:
    //   current=1  -> [1, 2, …, 10]
    //   current=5  -> [1, …, 4, 5, 6, …, 10]
    //   current=10 -> [1, …, 9, 10]
    const neighbors = 1;
    const pagesToShow = new Set([1, totalPages]);
    for (let i = currentPage - neighbors; i <= currentPage + neighbors; i++) {
        if (i >= 1 && i <= totalPages) pagesToShow.add(i);
    }
    const sorted = [...pagesToShow].sort((a, b) => a - b);

    let prev = 0;
    for (const i of sorted) {
        if (i > prev + 1) {
            const ellipsis = document.createElement('span');
            ellipsis.innerText = '…';
            ellipsis.className = 'tw-px-2 tw-py-1 tw-text-[var(--fg-muted)]';
            pageNumbers.appendChild(ellipsis);
        }
        const pageButton = document.createElement('button');
        pageButton.innerText = i;
        pageButton.className = `tw-px-2 tw-py-1 ${i === currentPage ? 'tw-bg-[var(--fg)] tw-text-[var(--bg)]' : 'tw-bg-[var(--card-bg)] tw-text-[var(--fg)]'}`;
        pageButton.disabled = (i === currentPage);
        pageButton.onclick = () => showPage(i, 300);
        pageNumbers.appendChild(pageButton);
        prev = i;
    }

    // // If we're not at the last page, show the last page button separately to avoid duplication
    // if (endPage < totalPages) {
    //     const dots = document.createElement('span');
    //     dots.innerText = '...';
    //     dots.className = 'text-gray-500 px-2';
    //     pageNumbers.appendChild(dots);

    //     const lastPageButton = document.createElement('button');
    //     lastPageButton.innerText = totalPages;
    //     lastPageButton.className = `px-2 py-1 ${currentPage === totalPages ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'}`;
    //     lastPageButton.disabled = (currentPage === totalPages); // Disable if on the last page
    //     lastPageButton.onclick = () => showPage(totalPages);
    //     pageNumbers.appendChild(lastPageButton);
    // }
}

// Initialize the pagination display on load — read ?page= from the URL
// and don't add a history entry for the initial sync.
document.addEventListener('DOMContentLoaded', () => showPage(getPageFromUrl(), 0, { skipUrl: true }));

// Browser back / forward should move between pagination pages.
window.addEventListener('popstate', () => showPage(getPageFromUrl(), 0, { skipUrl: true }));
