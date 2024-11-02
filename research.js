const itemsPerPage = 3;
let currentPage = 1;

const items = document.querySelectorAll('.page-item');
const totalPages = Math.ceil(items.length / itemsPerPage);
const maxVisiblePages = 5; // Number of pages to show at once

function showPage(page, timeout) {
    const flexContainer = document.getElementById('flexContainer');
    flexContainer.style.visibility = 'hidden';

    // items.forEach((item, index) => {
    //     item.style.display = (index >= (page - 1) * itemsPerPage && index < page * itemsPerPage) ? 'block' : 'none';
    // });
    // currentPage = page;
    // updateButtons();
    // displayPageNumbers();
    // // Scroll to the top of the page when switching pages
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

// Initialize the pagination display on load
document.addEventListener('DOMContentLoaded', () => showPage(currentPage, 0));
