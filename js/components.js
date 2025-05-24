// js/components.js: Defines reusable UI component generator functions (e.g., for literature items,
// screenshot cards, loading spinners, modals, toasts) and utility functions (e.g., formatting, DOM manipulation).
// This file aims to keep UI generation logic separate and reusable across different parts of the application.
// Dependencies: Relies on global functions defined in other scripts (e.g., window.API_BASE_URL from api.js,
// window.editScreenshot from app.js) for some interactive elements.

/**
 * Creates HTML string for a literature item card.
 * Used in both dashboard (app.js) and My Records (my-records.js) pages.
 * @param {object} item - The literature item data.
 * @param {boolean} [isSelected=false] - Whether the item is currently selected.
 * @returns {string} HTML string for the literature item.
 */
function createLiteratureItem(item, isSelected = false) {
    const selectedClass = isSelected ? 'selected bg-blue-50 border-l-blue-500' : 'border-l-transparent';
    const originalData = item.original_columns_data || {}; // Contains raw data fields.
    const authorsDisplay = formatAuthors(originalData.authors); // Utility function for author formatting.
    const yearDisplay = originalData.year || 'N/A';
    const sourceDisplay = originalData.source ? escapeHtml(originalData.source) : 'N/A';
    const doiDisplay = originalData.doi ? `DOI: ${escapeHtml(originalData.doi)}` : '';
    const hasPdf = !!originalData.pdf_url || !!item.pdf_server_path; // Check for any PDF link.

    // The onclick action for the main item div tries to call a selection handler.
    // It checks for `window.selectLiteratureItem` (dashboard) or `window.myRecords.selectLiteratureRecord` (My Records page)
    // to handle item selection in the appropriate context.
    const itemOnClickAction = `event.stopPropagation(); (window.selectLiteratureItem ? window.selectLiteratureItem(${item.id}) : (window.myRecords && window.myRecords.selectLiteratureRecord ? window.myRecords.selectLiteratureRecord(${item.id}) : console.warn('No literature select handler for ID ${item.id}')));`;

    return `
        <div class="literature-item p-4 hover:bg-gray-100 cursor-pointer border-l-2 ${selectedClass} transition-colors duration-150"
             data-id="${item.id}" data-article-title="${escapeHtml(item.title)}" 
             onclick="${itemOnClickAction}"> {/* Main click handler for selection. */}
            <div class="flex items-start justify-between">
                <div class="flex-1 min-w-0">
                    <h4 class="text-sm font-semibold text-gray-800 truncate" title="${escapeHtml(item.title)}">
                        ${escapeHtml(item.title)}
                    </h4>
                    <p class="text-xs text-gray-600 mt-1 truncate" title="${authorsDisplay} • ${yearDisplay}">
                        ${authorsDisplay} • ${yearDisplay}
                    </p>
                    <p class="text-xs text-gray-500 mt-0.5 truncate" title="Source: ${sourceDisplay}">
                        Source: ${sourceDisplay}
                    </p>
                    ${doiDisplay ? `<p class="text-xs text-gray-500 mt-0.5 truncate" title="${doiDisplay}">${doiDisplay}</p>` : ''}
                </div>
                <div class="ml-3 flex-shrink-0 flex flex-col items-end space-y-1.5">
                    ${hasPdf ? 
                        '<span class="badge badge-info text-xs"><i class="fas fa-file-pdf mr-1"></i>PDF</span>' : 
                        '<span class="badge bg-gray-100 text-gray-600 text-xs"><i class="far fa-file mr-1"></i>No PDF</span>'}
                    <div class="flex space-x-2 mt-1">
                        {/* Edit button: calls global window.editLiteratureItem, stopping event propagation to prevent item selection. */}
                        <button class="text-gray-400 hover:text-blue-600 text-xs p-1 rounded hover:bg-blue-50"
                                onclick="event.stopPropagation(); window.editLiteratureItem && window.editLiteratureItem(${item.id});" title="Edit Literature">
                            <i class="fas fa-edit fa-fw"></i>
                        </button>
                        {/* Delete button: calls global window.deleteLiteratureItem, stopping event propagation. */}
                        <button class="text-gray-400 hover:text-red-600 text-xs p-1 rounded hover:bg-red-50"
                                onclick="event.stopPropagation(); window.deleteLiteratureItem && window.deleteLiteratureItem(${item.id});" title="Delete Literature">
                            <i class="fas fa-trash fa-fw"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
}

/**
 * Creates HTML string for a screenshot card.
 * Displays screenshot thumbnail, metadata, and action buttons.
 * Uses DB-sourced metadata and API download links.
 * @param {object} screenshot - The screenshot data object (from ScreenshotMetadata model).
 * @returns {string} HTML string for the screenshot card.
 */
function createScreenshotCard(screenshot) {
    // window.API_BASE_URL is from api.js, used to construct full image URLs if needed.
    const baseApiDomain = window.API_BASE_URL ? window.API_BASE_URL.replace('/api', '') : '';
    // screenshot.image_url is the relative API path for downloading/displaying the image.
    const imageUrlForDisplay = screenshot.image_url ? `${baseApiDomain}${screenshot.image_url}` : '#';
    const downloadUrl = screenshot.image_url || '#'; // Relative path for download link.

    // Thumbnail: displays image or a placeholder if no image URL.
    const thumbnailHtml = screenshot.image_url ?
        `<img src="${imageUrlForDisplay}" alt="Screenshot ${screenshot.id}" class="w-full h-32 object-cover rounded-md mb-2 border border-gray-100">` :
        `<div class="w-full h-32 flex items-center justify-center bg-gray-100 rounded-md mb-2 text-gray-400"><i class="fas fa-image text-2xl"></i></div>`;

    const descriptionDisplay = screenshot.description ? escapeHtml(screenshot.description) : 'No description';
    const chartTypeDisplay = screenshot.chart_type ? escapeHtml(screenshot.chart_type) : 'Uncategorized';
    const pageInfo = screenshot.page_number !== null ? `Page ${screenshot.page_number}` : 'Page N/A';
    // literature_article is an eager-loaded relationship from ScreenshotMetadata.
    const literatureTitle = screenshot.literature_article?.title ? escapeHtml(screenshot.literature_article.title) : 'Unknown Article';
    const literatureId = screenshot.literature_article?.id;
    const createdAt = screenshot.created_at ? formatDate(screenshot.created_at) : 'Date N/A'; // Utility for date formatting.

    // Link to navigate to the literature item in My Records page, if context allows.
    // window.myRecords.navigateToLiterature is from my-records.js.
    const literatureLinkHtml = literatureId && window.myRecords?.navigateToLiterature ?
        `<span class="cursor-pointer hover:underline" onclick="event.stopPropagation(); window.myRecords.navigateToLiterature(${literatureId});" title="Go to: ${literatureTitle}">
            ${literatureTitle}
         </span>` : literatureTitle;

    // Construct a descriptive download filename.
    const dlFilename = `ss_${literatureId || 'art'}_p${screenshot.page_number ?? 'N'}_id${screenshot.id}.png`;

    return `
        <div class="screenshot-card bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md transition-shadow duration-200 flex flex-col"
             data-id="${screenshot.id}" data-article-id="${literatureId || ''}" data-chart-type="${escapeHtml(screenshot.chart_type || '')}">
             {/* Main card area is clickable to show screenshot view modal (handled by my-records.js). */}
             <div class="cursor-pointer flex-grow" onclick="window.myRecords && window.myRecords.showScreenshotModal ? window.myRecords.showScreenshotModal(${screenshot.id}) : console.warn('No screenshot view handler');">
                 ${thumbnailHtml}
                 <div class="text-xs text-gray-600 mb-1 line-clamp-1">
                     <i class="fas fa-file-alt fa-fw mr-1 text-gray-400"></i> ${literatureLinkHtml}
                 </div>
                 <div class="text-xs text-gray-500 mb-2">
                     <i class="fas fa-bookmark fa-fw mr-1 text-gray-400"></i>${pageInfo} &bull;
                     <i class="fas fa-chart-pie fa-fw mr-1 text-gray-400"></i> ${chartTypeDisplay}
                 </div>
                 <p class="text-sm text-gray-800 mb-3 line-clamp-2 h-10" title="${descriptionDisplay}">
                     ${descriptionDisplay}
                 </p>
                 <div class="text-xs text-gray-500 mt-auto">
                     <i class="fas fa-calendar fa-fw mr-1 text-gray-400"></i> Captured: ${createdAt}
                 </div>
             </div>
             <div class="flex items-center justify-end space-x-1 text-xs mt-2 border-t pt-2">
                 <div class="flex items-center justify-end space-x-1 text-xs mt-2 border-t pt-2">
                     {/* Edit button: calls global window.editScreenshot (defined in app.js). */}
                     <button class="text-gray-500 hover:text-accent px-2 py-1 rounded hover:bg-accent-50 transition-colors"
                             onclick="event.stopPropagation(); window.editScreenshot && window.editScreenshot(${screenshot.id});" title="Edit Information">
                         <i class="fas fa-edit fa-fw"></i> Edit
                     </button>
                     {/* Download button: direct link to image URL. */}
                     <a href="${downloadUrl}" download="${dlFilename}" class="text-gray-500 hover:text-green-600 px-2 py-1 rounded hover:bg-green-50 transition-colors" title="Download Image">
                         <i class="fas fa-download fa-fw"></i> Download
                     </a>
                     {/* Delete button: calls global window.deleteScreenshot (defined in app.js or my-records.js). */}
                     <button class="text-gray-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                             onclick="event.stopPropagation(); window.deleteScreenshot && window.deleteScreenshot(${screenshot.id});" title="Delete Screenshot">
                         <i class="fas fa-trash mr-1"></i> Delete
                     </button>
                 </div>
             </div>
        </div>`;
}

// --- Generic UI Component Functions (Loading, Empty State, Error, Pagination) ---

/** Creates HTML for a loading spinner component. */
function createLoadingComponent(message = 'Loading...') {
    return `<div class="flex flex-col items-center justify-center py-10"><div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-accent mb-4"></div><p class="text-gray-500 text-sm">${escapeHtml(message)}</p></div>`;
}

/** Creates HTML for an empty state message (e.g., no items found). */
function createEmptyState(iconClass, title, description, actionButtonHtml = null) {
    return `<div class="text-center py-12 px-4"><i class="fas ${iconClass} text-5xl text-gray-300 mb-5"></i><h3 class="text-lg font-medium text-gray-700 mb-2">${escapeHtml(title)}</h3><p class="text-sm text-gray-500 mb-6 max-w-md mx-auto">${escapeHtml(description)}</p>${actionButtonHtml || ''}</div>`;
}

/** Creates HTML for an error message component, optionally with a retry button. */
function createErrorComponent(message, retryCallbackFunctionName = null) {
    const btnHtml = retryCallbackFunctionName ? `<button onclick="${retryCallbackFunctionName}()" class="btn btn-sm btn-primary mt-4"><i class="fas fa-redo mr-2"></i>Try Again</button>` : '';
    return `<div class="text-center py-10 px-4 bg-red-50 border border-red-200 rounded-md"><i class="fas fa-exclamation-triangle text-4xl text-red-400 mb-4"></i><p class="text-red-700 text-sm mb-4">${escapeHtml(message)}</p>${btnHtml}</div>`;
}

/** 
 * Creates HTML for pagination controls.
 * @param {number} currentPage - The current active page.
 * @param {number} totalPages - The total number of pages.
 * @param {string} onPageChangeFunctionName - The name of the global function to call on page change (e.g., 'loadLiteratureList').
 * @returns {string} HTML string for pagination controls.
 */
function createPaginationComponent(currentPage, totalPages, onPageChangeFunctionName) {
    if (totalPages <= 1) return ''; // No pagination needed for single page or no content.
    let html = '<nav aria-label="Pagination" class="flex items-center justify-between text-sm text-gray-600 py-2">';
    const prevDis = currentPage <= 1; // Disable "Prev" button if on first page.
    html += `<button onclick="${onPageChangeFunctionName}(${currentPage - 1})" class="btn btn-sm btn-ghost ${prevDis ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'}" ${prevDis ? 'disabled' : ''} aria-label="Previous"><i class="fas fa-chevron-left mr-1"></i> Prev</button>`;
    html += `<span class="font-medium px-3">Page ${currentPage} of ${totalPages}</span>`;
    const nextDis = currentPage >= totalPages; // Disable "Next" button if on last page.
    html += `<button onclick="${onPageChangeFunctionName}(${currentPage + 1})" class="btn btn-sm btn-ghost ${nextDis ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'}" ${nextDis ? 'disabled' : ''} aria-label="Next">Next <i class="fas fa-chevron-right ml-1"></i></button></nav>`;
    return html;
}

// --- Utility Functions ---

/**
 * Escapes HTML special characters in a string to prevent XSS.
 * @param {string|null|undefined} text - The text to escape.
 * @returns {string} The escaped HTML string.
 */
function escapeHtml(text) {
    if (text === null || typeof text === 'undefined') return '';
    return String(text).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
}

/**
 * Formats author names for display (e.g., "Author A, Author B & Author C" or "Author A et al.").
 * @param {string|Array<string|object>} authors - Author data (string or array of strings/objects with 'name' property).
 * @returns {string} Formatted author string.
 */
function formatAuthors(authors) {
    if (!authors) return 'N/A';
    let names = [];
    if (Array.isArray(authors)) {
        // Handles array of strings or array of objects like { name: "Author" }.
        names = authors.map(a => (typeof a === 'object' && a?.name) ? escapeHtml(a.name.trim()) : (typeof a === 'string' ? escapeHtml(a.trim()) : null)).filter(Boolean);
    } else if (typeof authors === 'string') {
        return escapeHtml(authors.trim()); // If authors is already a formatted string.
    }
    if (names.length === 0) return 'N/A';
    // Display all names if 3 or fewer, otherwise use "et al."
    return names.length <= 3 ? names.join(', ') : `${names[0]} et al.`;
}

/**
 * Formats a date string into a more readable format.
 * @param {string} dateString - The date string to format.
 * @param {object} [options={ year: 'numeric', month: 'short', day: 'numeric' }] - Formatting options for toLocaleDateString.
 * @returns {string} Formatted date string or 'N/A'.
 */
function formatDate(dateString, options = { year: 'numeric', month: 'short', day: 'numeric' }) {
    if (!dateString) return 'N/A';
    try { 
        const d = new Date(dateString); 
        return isNaN(d.getTime()) ? dateString : d.toLocaleDateString(undefined, options); // Fallback to original if date is invalid.
    }
    catch (e) { 
        console.warn("Date format error:", dateString, e); 
        return dateString; // Return original string on error.
    }
}

// --- Modal Management Functions ---

/**
 * Shows a modal dialog by its ID.
 * Manages ARIA attributes and body overflow.
 * @param {string} modalId - The ID of the modal element to show.
 */
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) { 
        modal.classList.remove('hidden'); 
        modal.classList.add('flex'); // Use flex for centering (Tailwind).
        document.body.classList.add('overflow-hidden'); // Prevent background scrolling.
        modal.setAttribute('aria-modal', 'true'); 
        modal.setAttribute('role', 'dialog'); 
        modal.focus(); // Focus modal for accessibility.
    }
}
/**
 * Hides a modal dialog by its ID.
 * Manages ARIA attributes and body overflow.
 * @param {string} modalId - The ID of the modal element to hide.
 */
function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) { 
        modal.classList.add('hidden'); 
        modal.classList.remove('flex'); 
        document.body.classList.remove('overflow-hidden'); 
        modal.removeAttribute('aria-modal'); 
        modal.removeAttribute('role'); 
    }
}

/**
 * Debounces a function to limit its rate of execution.
 * @param {function} func - The function to debounce.
 * @param {number} wait - The debounce delay in milliseconds.
 * @returns {function} The debounced function.
 */
function debounce(func, wait) {
    let timeout; 
    return (...args) => { 
        clearTimeout(timeout); 
        timeout = setTimeout(() => func(...args), wait); 
    };
}

// --- Toast Notification Functions ---

/**
 * Displays a toast notification.
 * @param {string} message - The message to display in the toast.
 * @param {'info'|'success'|'error'|'warning'} [type='info'] - The type of toast, affecting its styling.
 * @param {number} [duration=4000] - Duration in ms to show the toast (0 for indefinite).
 */
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container') || createToastContainer(); // Ensure container exists.
    const toast = document.createElement('div');
    // Base classes for toast item, transitions will be applied for show/hide.
    toast.className = 'toast-item p-4 rounded-lg shadow-xl mb-3 transition-all duration-300 ease-in-out transform opacity-0 translate-y-2';
    toast.setAttribute('role', 'alert'); // Accessibility.
    
    let bgColor, textColor, icon; // Style based on toast type.
    switch (type) {
        case 'success': bgColor = 'bg-green-500'; textColor = 'text-white'; icon = 'fas fa-check-circle'; break;
        case 'error': bgColor = 'bg-red-600'; textColor = 'text-white'; icon = 'fas fa-exclamation-circle'; break;
        case 'warning': bgColor = 'bg-yellow-500'; textColor = 'text-gray-800'; icon = 'fas fa-exclamation-triangle'; break;
        default: bgColor = 'bg-blue-500'; textColor = 'text-white'; icon = 'fas fa-info-circle'; break; // Default to 'info'.
    }
    toast.classList.add(bgColor, textColor);
    toast.innerHTML = `<div class="flex items-center"><i class="${icon} mr-3 text-xl"></i><span class="flex-1">${escapeHtml(message)}</span><button class="ml-4 text-current opacity-70 hover:opacity-100 text-xl leading-none" aria-label="Close">&times;</button></div>`;
    
    toast.querySelector('button').addEventListener('click', () => removeToast(toast)); // Close button.
    
    // Animate in: Use requestAnimationFrame for smoother transitions after prepend.
    requestAnimationFrame(() => {
        container.prepend(toast); // Add to top of container.
        requestAnimationFrame(() => { 
            toast.classList.replace('opacity-0', 'opacity-100'); 
            toast.classList.replace('translate-y-2', 'translate-y-0'); 
        });
    });
    
    if (duration > 0) { // Auto-remove after duration if duration is positive.
        setTimeout(() => removeToast(toast), duration);
    }
}
/** Removes a toast notification with animation. */
function removeToast(toast) {
    if (!toast || !toast.parentElement) return; // Already removed or not in DOM.
    // Animate out.
    toast.classList.replace('opacity-100', 'opacity-0'); 
    toast.classList.replace('translate-y-0', 'translate-y-2');
    // Remove from DOM after transition.
    toast.addEventListener('transitionend', () => toast.remove());
    // Fallback removal if transitionend doesn't fire (e.g., element removed abruptly).
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 300);
}
/** Creates the toast container element if it doesn't exist. */
function createToastContainer() {
    let c = document.getElementById('toast-container');
    if (!c) {
        c = document.createElement('div'); 
        c.id = 'toast-container';
        // Position fixed at top-right, z-index to be above other content.
        c.className = 'fixed top-5 right-5 z-[100] w-full max-w-xs sm:max-w-sm pointer-events-none flex flex-col items-flex-end';
        document.body.appendChild(c);
    }
    // Ensure individual toasts are interactive (clickable close button).
    c.querySelectorAll('.toast-item').forEach(item => item.style.pointerEvents = 'auto');
    return c;
}

// --- Global Function Placeholders & Setup ---

// Define placeholder functions on window if they are not already defined by other scripts (app.js, my-records.js).
// This helps prevent errors if components.js is loaded before the scripts that provide full implementations.
// The actual logic for these functions resides in app.js or my-records.js, tailored to their specific contexts.
if (!window.editLiteratureItem) window.editLiteratureItem = (id) => console.log('Placeholder: editLiteratureItem for ID:', id);
if (!window.deleteLiteratureItem) window.deleteLiteratureItem = (id) => console.log('Placeholder: deleteLiteratureItem for ID:', id);
// window.editScreenshot is expected to be defined in app.js as it's a more complex shared function.
if (!window.deleteScreenshot) window.deleteScreenshot = (id) => console.log('Placeholder: deleteScreenshot for ID:', id);

/**
 * Global function to set up event listeners for the shared screenshot edit modal.
 * This is called by pages that use this modal (dashboard.html, my-records.html).
 * Relies on `window.saveScreenshotMetadata` being defined globally (typically in app.js).
 * @global
 * @function setupScreenshotEditModalListeners
 */
window.setupScreenshotEditModalListeners = function() {
    const modal = document.getElementById('screenshot-edit-modal');
    const form = document.getElementById('screenshot-form'); // Assumes form with this ID exists in the modal.
    const cancelBtn = document.getElementById('cancel-screenshot-edit');
    const saveBtn = document.getElementById('save-screenshot-changes'); // Assumes save button with this ID.
    const closeBtn = document.getElementById('close-screenshot-edit-modal-btn');

    if (!modal || !form || !cancelBtn || !saveBtn || !closeBtn) {
         console.warn("Screenshot edit modal elements missing for listener setup.");
         return;
    }
    // Listeners for closing/cancelling the modal, which also resets the form.
    cancelBtn.addEventListener('click', () => { hideModal('screenshot-edit-modal'); resetScreenshotForm(); });
    closeBtn.addEventListener('click', () => { hideModal('screenshot-edit-modal'); resetScreenshotForm(); });
    
    // The 'Save Changes' button calls the global `window.saveScreenshotMetadata` function.
    // This function is expected to be defined in `app.js` and handle API calls and UI updates.
    saveBtn.addEventListener('click', () => {
        if (window.saveScreenshotMetadata) {
            window.saveScreenshotMetadata();
        } else {
            console.error("saveScreenshotMetadata function not defined globally. This should be in app.js.");
        }
    });
    // Close modal on backdrop click.
    modal.addEventListener('click', (e) => { if (e.target === modal) { hideModal('screenshot-edit-modal'); resetScreenshotForm(); }});
};

/**
 * Global function to reset the screenshot edit form.
 * Called when the modal is closed or changes are saved.
 * @global
 * @function resetScreenshotForm
 */
window.resetScreenshotForm = function() { 
    const form = document.getElementById('screenshot-form');
    const hiddenIdInput = document.getElementById('edit-screenshot-id'); // Hidden input storing screenshot ID.
    if (form) form.reset(); // Standard form reset.
    if (hiddenIdInput) hiddenIdInput.value = ''; // Clear screenshot ID.
};

// --- Global Exports ---
// Expose all defined components and utilities on the window.components object
// and also directly on the window object if not already defined, for easier access.
window.components = { 
    createLiteratureItem, createScreenshotCard, 
    createLoadingComponent, createEmptyState, createErrorComponent, createPaginationComponent, 
    escapeHtml, formatAuthors, formatDate, 
    showModal, hideModal, debounce, 
    showToast, createToastContainer, 
    setupScreenshotEditModalListeners, resetScreenshotForm 
};
// Fallback: if a component function isn't directly on window, add it from window.components.
Object.keys(window.components).forEach(key => { 
    if (!window[key]) window[key] = window.components[key]; 
});
// Ensure toast container is created on DOM load for any page using components.js.
document.addEventListener('DOMContentLoaded', createToastContainer);



