// Reusable UI components and utilities

function createLiteratureItem(item, isSelected = false) {
    const selectedClass = isSelected ? 'selected bg-blue-50 border-l-blue-500' : 'border-l-transparent';
    const originalData = item.original_columns_data || {};
    const authorsDisplay = formatAuthors(originalData.authors);
    const yearDisplay = originalData.year || 'N/A';
    const sourceDisplay = originalData.source ? escapeHtml(originalData.source) : 'N/A';
    const doiDisplay = originalData.doi ? `DOI: ${escapeHtml(originalData.doi)}` : '';
    const hasPdf = !!originalData.pdf_url; // Check for truthy pdf_url

    // Determine onclick for item selection. This is simplified; actual binding happens in display functions.
    // The data-id attribute is primary for event delegation.
    // For edit/delete, specific onclicks are used on buttons.
    const itemOnClickAction = `event.stopPropagation(); (window.selectLiteratureItem ? window.selectLiteratureItem(${item.id}) : (window.myRecords && window.myRecords.selectLiteratureRecord ? window.myRecords.selectLiteratureRecord(${item.id}) : console.warn('No literature select handler for ID ${item.id}')));`;

    return `
        <div class="literature-item p-4 hover:bg-gray-100 cursor-pointer border-l-2 ${selectedClass} transition-colors duration-150"
             data-id="${item.id}" data-article-title="${escapeHtml(item.title)}"
             onclick="${itemOnClickAction}">
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
                    ${hasPdf ? '<span class="badge badge-info text-xs"><i class="fas fa-file-pdf mr-1"></i>PDF</span>'
                              : '<span class="badge bg-gray-100 text-gray-600 text-xs"><i class="far fa-file mr-1"></i>No PDF</span>'}
                    <div class="flex space-x-2 mt-1">
                        <button class="text-gray-400 hover:text-blue-600 text-xs p-1 rounded hover:bg-blue-50"
                                onclick="event.stopPropagation(); window.editLiteratureItem && window.editLiteratureItem(${item.id});" title="Edit Literature">
                            <i class="fas fa-edit fa-fw"></i>
                        </button>
                        <button class="text-gray-400 hover:text-red-600 text-xs p-1 rounded hover:bg-red-50"
                                onclick="event.stopPropagation(); window.deleteLiteratureItem && window.deleteLiteratureItem(${item.id});" title="Delete Literature">
                            <i class="fas fa-trash fa-fw"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
}

// MODIFICATION: createScreenshotCard uses DB-sourced metadata, API download links
function createScreenshotCard(screenshot) {
    const baseApiDomain = window.API_BASE_URL ? window.API_BASE_URL.replace('/api', '') : '';
    // screenshot.image_url is the API download path like /api/download_screenshot_image/ID
    const imageUrlForDisplay = screenshot.image_url ? `${baseApiDomain}${screenshot.image_url}` : '#';
    // For actual download, use the relative API path directly, as browser will resolve it.
    const downloadUrl = screenshot.image_url || '#';


    const thumbnailHtml = screenshot.image_url ?
        `<img src="${imageUrlForDisplay}" alt="Screenshot ${screenshot.id}" class="w-full h-32 object-cover rounded-md mb-2 border border-gray-100">` :
        `<div class="w-full h-32 flex items-center justify-center bg-gray-100 rounded-md mb-2 text-gray-400"><i class="fas fa-image text-2xl"></i></div>`;

    const descriptionDisplay = screenshot.description ? escapeHtml(screenshot.description) : 'No description';
    const chartTypeDisplay = screenshot.chart_type ? escapeHtml(screenshot.chart_type) : 'Uncategorized';
    const pageInfo = screenshot.page_number !== null ? `Page ${screenshot.page_number}` : 'Page N/A';
    // literature_article is eager-loaded by backend from ScreenshotMetadata.literature_article relationship
    const literatureTitle = screenshot.literature_article?.title ? escapeHtml(screenshot.literature_article.title) : 'Unknown Article';
    const literatureId = screenshot.literature_article?.id;
    const createdAt = screenshot.created_at ? formatDate(screenshot.created_at) : 'Date N/A';

    const literatureLinkHtml = literatureId && window.myRecords?.navigateToLiterature ?
        `<span class="cursor-pointer hover:underline" onclick="event.stopPropagation(); window.myRecords.navigateToLiterature(${literatureId});" title="Go to: ${literatureTitle}">
            ${literatureTitle}
         </span>` : literatureTitle;

    // Construct download filename
    const dlFilename = `ss_${literatureId || 'art'}_p${screenshot.page_number ?? 'N'}_id${screenshot.id}.png`;

    return `
        <div class="screenshot-card bg-white rounded-lg shadow-sm p-3 border border-gray-200 hover:shadow-md transition-shadow duration-200 flex flex-col"
             data-id="${screenshot.id}" data-article-id="${literatureId || ''}" data-chart-type="${escapeHtml(screenshot.chart_type || '')}">
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
                 <button class="text-gray-500 hover:text-accent px-2 py-1 rounded hover:bg-accent-50 transition-colors"
                         onclick="event.stopPropagation(); window.editScreenshot && window.editScreenshot(${screenshot.id});" title="Edit Information">
                     <i class="fas fa-edit fa-fw"></i> Edit
                 </button>
                 <a href="${downloadUrl}" download="${dlFilename}" class="text-gray-500 hover:text-green-600 px-2 py-1 rounded hover:bg-green-50 transition-colors" title="Download Image">
                     <i class="fas fa-download fa-fw"></i> Download
                 </a>
                 <button class="text-gray-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                         onclick="event.stopPropagation(); window.deleteScreenshot && window.deleteScreenshot(${screenshot.id});" title="Delete Screenshot">
                     <i class="fas fa-trash mr-1"></i> Delete
                 </button>
             </div>
        </div>`;
}

function createLoadingComponent(message = 'Loading...') {
    return `<div class="flex flex-col items-center justify-center py-10"><div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-accent mb-4"></div><p class="text-gray-500 text-sm">${escapeHtml(message)}</p></div>`;
}

function createEmptyState(iconClass, title, description, actionButtonHtml = null) {
    return `<div class="text-center py-12 px-4"><i class="fas ${iconClass} text-5xl text-gray-300 mb-5"></i><h3 class="text-lg font-medium text-gray-700 mb-2">${escapeHtml(title)}</h3><p class="text-sm text-gray-500 mb-6 max-w-md mx-auto">${escapeHtml(description)}</p>${actionButtonHtml || ''}</div>`;
}

function createErrorComponent(message, retryCallbackFunctionName = null) {
    const btnHtml = retryCallbackFunctionName ? `<button onclick="${retryCallbackFunctionName}()" class="btn btn-sm btn-primary mt-4"><i class="fas fa-redo mr-2"></i>Try Again</button>` : '';
    return `<div class="text-center py-10 px-4 bg-red-50 border border-red-200 rounded-md"><i class="fas fa-exclamation-triangle text-4xl text-red-400 mb-4"></i><p class="text-red-700 text-sm mb-4">${escapeHtml(message)}</p>${btnHtml}</div>`;
}

function createPaginationComponent(currentPage, totalPages, onPageChangeFunctionName) {
    if (totalPages <= 1) return '';
    let html = '<nav aria-label="Pagination" class="flex items-center justify-between text-sm text-gray-600 py-2">';
    const prevDis = currentPage <= 1;
    html += `<button onclick="${onPageChangeFunctionName}(${currentPage - 1})" class="btn btn-sm btn-ghost ${prevDis ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'}" ${prevDis ? 'disabled' : ''} aria-label="Previous"><i class="fas fa-chevron-left mr-1"></i> Prev</button>`;
    html += `<span class="font-medium px-3">Page ${currentPage} of ${totalPages}</span>`;
    const nextDis = currentPage >= totalPages;
    html += `<button onclick="${onPageChangeFunctionName}(${currentPage + 1})" class="btn btn-sm btn-ghost ${nextDis ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'}" ${nextDis ? 'disabled' : ''} aria-label="Next">Next <i class="fas fa-chevron-right ml-1"></i></button></nav>`;
    return html;
}

function escapeHtml(text) {
    if (text === null || typeof text === 'undefined') return '';
    return String(text).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
}

function formatAuthors(authors) {
    if (!authors) return 'N/A';
    let names = [];
    if (Array.isArray(authors)) names = authors.map(a => (typeof a === 'object' && a?.name) ? escapeHtml(a.name.trim()) : (typeof a === 'string' ? escapeHtml(a.trim()) : null)).filter(Boolean);
    else if (typeof authors === 'string') return escapeHtml(authors.trim());
    if (names.length === 0) return 'N/A';
    return names.length <= 3 ? names.join(', ') : `${names[0]} et al.`;
}

function formatDate(dateString, options = { year: 'numeric', month: 'short', day: 'numeric' }) {
    if (!dateString) return 'N/A';
    try { const d = new Date(dateString); return isNaN(d.getTime()) ? dateString : d.toLocaleDateString(undefined, options); }
    catch (e) { console.warn("Date format error:", dateString, e); return dateString; }
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); document.body.classList.add('overflow-hidden'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('role', 'dialog'); modal.focus(); }
}
function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); document.body.classList.remove('overflow-hidden'); modal.removeAttribute('aria-modal'); modal.removeAttribute('role'); }
}
function debounce(func, wait) {
    let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); };
}

function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = 'toast-item p-4 rounded-lg shadow-xl mb-3 transition-all duration-300 ease-in-out transform opacity-0 translate-y-2';
    toast.setAttribute('role', 'alert');
    let bgColor, textColor, icon;
    switch (type) {
        case 'success': bgColor = 'bg-green-500'; textColor = 'text-white'; icon = 'fas fa-check-circle'; break;
        case 'error': bgColor = 'bg-red-600'; textColor = 'text-white'; icon = 'fas fa-exclamation-circle'; break;
        case 'warning': bgColor = 'bg-yellow-500'; textColor = 'text-gray-800'; icon = 'fas fa-exclamation-triangle'; break;
        default: bgColor = 'bg-blue-500'; textColor = 'text-white'; icon = 'fas fa-info-circle'; break;
    }
    toast.classList.add(bgColor, textColor);
    toast.innerHTML = `<div class="flex items-center"><i class="${icon} mr-3 text-xl"></i><span class="flex-1">${escapeHtml(message)}</span><button class="ml-4 text-current opacity-70 hover:opacity-100 text-xl leading-none" aria-label="Close">&times;</button></div>`;
    toast.querySelector('button').addEventListener('click', () => removeToast(toast));
    requestAnimationFrame(() => {
        container.prepend(toast);
        requestAnimationFrame(() => { toast.classList.replace('opacity-0', 'opacity-100'); toast.classList.replace('translate-y-2', 'translate-y-0'); });
    });
    if (duration > 0) setTimeout(() => removeToast(toast), duration);
}
function removeToast(toast) {
    if (!toast || !toast.parentElement) return;
    toast.classList.replace('opacity-100', 'opacity-0'); toast.classList.replace('translate-y-0', 'translate-y-2');
    toast.addEventListener('transitionend', () => toast.remove());
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 300);
}
function createToastContainer() {
    let c = document.getElementById('toast-container');
    if (!c) {
        c = document.createElement('div'); c.id = 'toast-container';
        c.className = 'fixed top-5 right-5 z-[100] w-full max-w-xs sm:max-w-sm pointer-events-none flex flex-col items-flex-end';
        document.body.appendChild(c);
    }
    c.querySelectorAll('.toast-item').forEach(item => item.style.pointerEvents = 'auto');
    return c;
}

// Global placeholders for functions that app.js or my-records.js will implement more fully
if (!window.editLiteratureItem) window.editLiteratureItem = (id) => console.log('Placeholder: editLiteratureItem for ID:', id);
if (!window.deleteLiteratureItem) window.deleteLiteratureItem = (id) => console.log('Placeholder: deleteLiteratureItem for ID:', id);
if (!window.editScreenshot) window.editScreenshot = (id) => console.log('Placeholder: editScreenshot for ID:', id);
if (!window.deleteScreenshot) window.deleteScreenshot = (id) => console.log('Placeholder: deleteScreenshot for ID:', id);

// MODIFICATION: Setup for Screenshot Edit Modal (can be called by app.js or my-records.js)
window.setupScreenshotEditModalListeners = function() {
    const modal = document.getElementById('screenshot-edit-modal');
    const form = document.getElementById('screenshot-form'); // Ensure this ID exists
    const cancelBtn = document.getElementById('cancel-screenshot-edit');
    const saveBtn = document.getElementById('save-screenshot-changes'); // Ensure this ID exists
    const closeBtn = document.getElementById('close-screenshot-edit-modal-btn');

    if (!modal || !form || !cancelBtn || !saveBtn || !closeBtn) {
         console.warn("Screenshot edit modal elements missing for listener setup.");
         return;
    }
    cancelBtn.addEventListener('click', () => { hideModal('screenshot-edit-modal'); resetScreenshotForm(); });
    closeBtn.addEventListener('click', () => { hideModal('screenshot-edit-modal'); resetScreenshotForm(); });
    
    // Save button's click handler is expected to be window.saveScreenshotMetadata,
    // which app.js or my-records.js should define fully.
    saveBtn.addEventListener('click', () => {
        if (window.saveScreenshotMetadata) window.saveScreenshotMetadata();
        else console.error("saveScreenshotMetadata function not defined globally.");
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) { hideModal('screenshot-edit-modal'); resetScreenshotForm(); }});
};
window.resetScreenshotForm = function() { // Make reset globally accessible
    const form = document.getElementById('screenshot-form');
    const hiddenIdInput = document.getElementById('edit-screenshot-id');
    if (form) form.reset();
    if (hiddenIdInput) hiddenIdInput.value = '';
};


window.components = { createLiteratureItem, createScreenshotCard, createLoadingComponent, createEmptyState, createErrorComponent, createPaginationComponent, escapeHtml, formatAuthors, formatDate, showModal, hideModal, debounce, showToast, createToastContainer, setupScreenshotEditModalListeners, resetScreenshotForm };
Object.keys(window.components).forEach(key => { if (!window[key]) window[key] = window.components[key]; }); // Export all to window if not already present
document.addEventListener('DOMContentLoaded', createToastContainer);



