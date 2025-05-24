// My Records page logic
// Requires api.js, auth.js, components.js

let myRecordsState = {
    currentUser: null,
    currentScreenshots: [], 
    screenshotsPagination: { currentPage: 1, totalPages: 1, totalItems: 0, pageSize: 12 },
    screenshotsFilters: { searchQuery: '', chartType: '', sortBy: 'created_at', sortOrder: 'desc', literatureId: null },
    literatureRecords: [], 
    literaturePagination: { currentPage: 1, totalPages: 1, totalItems: 0, pageSize: 10 },
    literatureFilters: { searchQuery: '', yearRange: '', sortBy: 'created_at', sortOrder: 'desc' },
    selectedLiteratureId: null, 
    activeTab: 'screenshots', 
    viewMode: 'grid' 
};
// Expose state and some functions globally for components or console access
window.myRecords = { 
    myRecordsState, 
    initializeMyRecords,
    loadScreenshots, changeScreenshotsPage, 
    loadLiteratureRecords, changeLiteraturePage,
    selectLiteratureRecord, navigateToLiterature, 
    switchTab,
    handleScreenshotFilterChange, clearScreenshotFiltersAndSelection, switchScreenshotViewMode,
    handleLiteratureFilterChange, clearLiteratureFilters,
    showScreenshotModal, 
    deleteScreenshot, // Make deleteScreenshot globally accessible from myRecords
    updateStatsDisplay,
    toggleGroupContent // For accordion
};

async function initializeMyRecords() {
    console.log('Initializing My Records...');
    if (!window.isAuthenticated()) { window.location.href = 'login.html'; return; }

    try {
        const userResponse = await window.authApi.getCurrentUser();
        if (userResponse.success && userResponse.data.user) myRecordsState.currentUser = userResponse.data.user;
        else window.handleApiError(userResponse, 'MyRecords User Fetch');
    } catch (e) { window.handleApiError(e, 'MyRecords User Fetch'); }

    setupMyRecordsEventListeners();
    // Screenshot edit modal listeners (shared with app.js, defined in components.js or app.js)
    if (window.setupScreenshotEditModalListeners) window.setupScreenshotEditModalListeners();
    else console.warn("setupScreenshotEditModalListeners not found.");
    
    window.components.createToastContainer(); // Ensure toast container exists

    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get('tab');
    const literatureIdFromParam = urlParams.get('literatureId');

    if (literatureIdFromParam) {
        myRecordsState.selectedLiteratureId = parseInt(literatureIdFromParam);
        myRecordsState.screenshotsFilters.literatureId = myRecordsState.selectedLiteratureId; // Apply filter
        switchTab('screenshots'); // This will also load data
    } else {
        switchTab(initialTab || 'screenshots'); // This will also load data
    }
    updateStatsDisplay();
}

function setupMyRecordsEventListeners() {
    document.querySelectorAll('.tab-button').forEach(b => b.addEventListener('click', function() { switchTab(this.id.replace('tab-', '')); }));
    // Screenshot tab
    document.getElementById('screenshot-search')?.addEventListener('input', window.debounce(handleScreenshotFilterChange, 500));
    document.getElementById('screenshot-filter-type')?.addEventListener('change', handleScreenshotFilterChange);
    document.getElementById('screenshot-sort')?.addEventListener('change', handleScreenshotFilterChange);
    document.getElementById('clear-screenshot-filters')?.addEventListener('click', clearScreenshotFiltersAndSelection);
    document.getElementById('group-by-article')?.addEventListener('click', () => switchScreenshotViewMode('groupedByArticle'));
    document.getElementById('view-all-screenshots')?.addEventListener('click', () => switchScreenshotViewMode('grid'));
    // Literature tab
    document.getElementById('literature-search-input')?.addEventListener('input', window.debounce(handleLiteratureFilterChange, 500));
    document.getElementById('literature-filter-year-range')?.addEventListener('input', window.debounce(handleLiteratureFilterChange, 500));
    document.getElementById('literature-sort-select')?.addEventListener('change', handleLiteratureFilterChange);
    document.getElementById('clear-literature-filters')?.addEventListener('click', clearLiteratureFilters);
    // Screenshot View Modal
    document.getElementById('close-screenshot-view')?.addEventListener('click', () => window.hideModal('screenshot-view-modal'));
    const viewModal = document.getElementById('screenshot-view-modal');
    if(viewModal) viewModal.addEventListener('click', (e) => { if(e.target === viewModal) window.hideModal('screenshot-view-modal'); });

    // Setup shared screenshot edit modal save handler (if not already globally available from app.js)
    // This ensures 'Save Changes' in the edit modal works correctly from My Records context.
    // `window.saveScreenshotMetadata` might be defined in app.js or components.js
    if (!window.saveScreenshotMetadata) {
        console.warn("Global saveScreenshotMetadata not found, defining for My Records.");
        window.saveScreenshotMetadata = async function() { // This is a simplified placeholder
            const hiddenIdInput = document.getElementById('edit-screenshot-id');
            const screenshotId = hiddenIdInput ? parseInt(hiddenIdInput.value) : null;
            if (!screenshotId) { showToast('Error: No screenshot ID.', 'error'); return; }
            // ... (full implementation similar to app.js one)
            // For now, assume app.js provides a robust global version or components.js does.
            showToast('Save logic for MyRecords edit modal needs full implementation.', 'warning');
        };
    }
     // Ensure editScreenshot is globally available (components.js might provide a basic one)
    if (!window.editScreenshot) {
        window.editScreenshot = function(screenshotId) {
            // Placeholder, actual implementation might be in app.js or components.js
            // This function needs to populate and show the #screenshot-edit-modal
            const screenshot = myRecordsState.currentScreenshots.find(s => s.id === screenshotId);
            if (!screenshot) { showToast("Screenshot not found to edit.", 'error'); return; }
            // Populate modal fields
            document.getElementById('edit-screenshot-id').value = screenshot.id;
            document.getElementById('chart-type-select').value = screenshot.chart_type || '';
            document.getElementById('screenshot-description').value = screenshot.description || '';
            document.getElementById('wpd-data').value = screenshot.wpd_data ? JSON.stringify(screenshot.wpd_data, null, 2) : '';
            window.showModal('screenshot-edit-modal');
        };
    }

}

function switchTab(tabName) {
    if (myRecordsState.activeTab === 'screenshots' && tabName === 'literature') {
        // delete myRecordsState.screenshotsFilters.literatureId; // Keep selection but don't filter screenshots unless on screenshot tab
    } else if (tabName === 'screenshots' && myRecordsState.selectedLiteratureId) {
         myRecordsState.screenshotsFilters.literatureId = myRecordsState.selectedLiteratureId;
    } else if (tabName === 'screenshots' && !myRecordsState.selectedLiteratureId) {
        delete myRecordsState.screenshotsFilters.literatureId; // Explicitly remove if no lit selected
    }
    myRecordsState.activeTab = tabName;
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.toggle('active', btn.id === `tab-${tabName}`);
        btn.classList.toggle('border-accent', btn.id === `tab-${tabName}`);
        btn.classList.toggle('text-accent', btn.id === `tab-${tabName}`);
        btn.classList.toggle('border-transparent', btn.id !== `tab-${tabName}`);
        btn.classList.toggle('text-gray-500', btn.id !== `tab-${tabName}`);
    });
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('hidden', c.id !== `${tabName}-tab`));
    
    const url = new URL(window.location);
    url.searchParams.set('tab', tabName);
    if (tabName === 'screenshots' && myRecordsState.selectedLiteratureId) url.searchParams.set('literatureId', myRecordsState.selectedLiteratureId);
    else url.searchParams.delete('literatureId');
    window.history.pushState({}, '', url);

    if (tabName === 'screenshots') loadScreenshots(1);
    else if (tabName === 'literature') loadLiteratureRecords(1);
}

// --- Screenshots Tab ---
async function loadScreenshots(page = myRecordsState.screenshotsPagination.currentPage) {
    const container = document.getElementById('screenshots-container');
    const pagEl = document.getElementById('screenshots-pagination-controls');
    const countEl = document.getElementById('screenshots-count');
    const filterStatusEl = document.getElementById('screenshot-literature-filter-status');

    if (!container) return;
    container.innerHTML = window.components.createLoadingComponent('Loading screenshots...');
    if (pagEl) pagEl.classList.add('hidden');
    if (countEl) countEl.textContent = 'Loading...';
    if (filterStatusEl) filterStatusEl.innerHTML = '';


    myRecordsState.screenshotsPagination.currentPage = page;
    const params = {
        page: myRecordsState.screenshotsPagination.currentPage,
        per_page: myRecordsState.screenshotsPagination.pageSize,
        chartType: myRecordsState.screenshotsFilters.chartType || undefined,
        searchQuery: myRecordsState.screenshotsFilters.searchQuery || undefined,
        sortBy: myRecordsState.screenshotsFilters.sortBy,
        sortOrder: myRecordsState.screenshotsFilters.sortOrder,
        literatureId: myRecordsState.screenshotsFilters.literatureId || undefined, // Use filter state
    };

    try {
        // MODIFICATION: Use screenshotApi.getScreenshots (mlApi alias)
        const response = await window.mlApi.getScreenshots(params);
        if (response.success && response.data) {
            myRecordsState.currentScreenshots = response.data.items || [];
            myRecordsState.screenshotsPagination = { ...myRecordsState.screenshotsPagination, ...response.data }; // Update all pagination fields
            delete myRecordsState.screenshotsPagination.items; // Remove items array from pagination object
            
            displayScreenshots(myRecordsState.currentScreenshots);
            renderScreenshotsPagination();

            if (myRecordsState.screenshotsFilters.literatureId) {
                const selLit = myRecordsState.literatureRecords.find(l => l.id === myRecordsState.screenshotsFilters.literatureId) || 
                               (myRecordsState.currentScreenshots[0]?.literature_article); // Fallback to first screenshot's article
                if (filterStatusEl && selLit) {
                    filterStatusEl.innerHTML = `Filtered by: <span class="font-semibold">${window.components.escapeHtml(selLit.title)}</span> <button class="ml-2 text-xs text-gray-500 hover:text-gray-700" onclick="window.myRecords.clearScreenshotFiltersAndSelection()"><i class="fas fa-times"></i> Clear</button>`;
                }
                document.getElementById('group-by-article')?.classList.add('hidden'); // Hide group when filtered by one article
            } else {
                 document.getElementById('group-by-article')?.classList.remove('hidden');
            }

        } else { throw response; }
    } catch (errorResponse) {
        const errorMsg = window.handleApiError(errorResponse, 'loadScreenshots');
        container.innerHTML = window.components.createErrorComponent(errorMsg, 'window.myRecords.loadScreenshots');
        if (filterStatusEl) filterStatusEl.textContent = 'Error loading filter.';
    } finally {
        if (countEl) countEl.textContent = `${myRecordsState.screenshotsPagination.totalItems || 0} Screenshot${myRecordsState.screenshotsPagination.totalItems !== 1 ? 's' : ''}`;
        document.getElementById('screenshots-view-mode-controls')?.classList.remove('invisible');
        updateStatsDisplay();
    }
}

function displayScreenshots(screenshots) {
    const container = document.getElementById('screenshots-container');
    if (!container) return;
    if (!screenshots || screenshots.length === 0) {
        let msg = myRecordsState.screenshotsFilters.literatureId ? 'No screenshots for this article. ' : 'No screenshots found. ';
        if (myRecordsState.screenshotsFilters.searchQuery || myRecordsState.screenshotsFilters.chartType) msg += 'Try different filters.';
        else if(!myRecordsState.screenshotsFilters.literatureId) msg += 'Capture some on the Dashboard.';
        container.innerHTML = window.components.createEmptyState('fa-camera', 'No Screenshots', msg); return;
    }
    myRecordsState.viewMode === 'grid' ? renderScreenshotsGrid(screenshots) : renderScreenshotsGrouped(screenshots);
}

function renderScreenshotsGrid(screenshots) {
    const container = document.getElementById('screenshots-container');
    const gridClass = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
    if (!container.querySelector('.' + gridClass.replace(/ /g, '.'))) { // Check if grid div exists
        container.innerHTML = `<div class="${gridClass} screenshots-grid"></div>`; // Add grid class
    } else {
         container.querySelector('.screenshots-grid').innerHTML = ''; // Clear existing grid
    }
    const gridDiv = container.querySelector('.screenshots-grid');
    screenshots.forEach(ss => { gridDiv.innerHTML += window.components.createScreenshotCard(ss); });
}

function renderScreenshotsGrouped(screenshots) {
    const container = document.getElementById('screenshots-container');
    container.innerHTML = ''; // Clear grid/previous content
    const grouped = screenshots.reduce((acc, ss) => {
        const articleId = ss.literature_article?.id || 'unknown';
        if (!acc[articleId]) acc[articleId] = { article: ss.literature_article, screenshots: [] };
        acc[articleId].screenshots.push(ss); return acc;
    }, {});
    Object.values(grouped).sort((a,b) => (a.article?.title || 'Z').localeCompare(b.article?.title || 'Z')).forEach(g => {
        const title = g.article?.title || 'Unlinked'; const id = g.article?.id || 'unknown';
        const headerId = `gh-${id}`; const contentId = `gc-${id}`;
        container.innerHTML += `
            <div class="bg-white rounded-lg shadow mb-6 overflow-hidden">
                <div id="${headerId}" class="p-4 border-b flex justify-between items-center cursor-pointer hover:bg-gray-50"
                     onclick="window.myRecords.toggleGroupContent('${contentId}', this)" role="button" aria-controls="${contentId}" aria-expanded="false">
                    <h3 class="text-lg font-semibold text-gray-800 line-clamp-1">${window.components.escapeHtml(title)} (${g.screenshots.length})</h3>
                    <i class="fas fa-chevron-down text-gray-500 group-toggle-icon"></i>
                </div>
                <div id="${contentId}" class="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 hidden" role="region" aria-labelledby="${headerId}">
                    ${g.screenshots.map(ss => window.components.createScreenshotCard(ss)).join('')}
                </div>
            </div>`;
    });
}

function toggleGroupContent(contentId, headerEl) {
    const content = document.getElementById(contentId);
    const icon = headerEl.querySelector('.group-toggle-icon');
    const isHidden = content.classList.toggle('hidden');
    icon.classList.toggle('rotate-180', !isHidden);
    headerEl.setAttribute('aria-expanded', String(!isHidden));
}

function renderScreenshotsPagination() {
    const el = document.getElementById('screenshots-pagination-controls');
    if (!el) return;
    const { currentPage, totalPages } = myRecordsState.screenshotsPagination;
    if (totalPages <= 1) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = window.components.createPaginationComponent(currentPage, totalPages, 'window.myRecords.changeScreenshotsPage');
}
function changeScreenshotsPage(page) {
    if (page >= 1 && page <= myRecordsState.screenshotsPagination.totalPages) loadScreenshots(page);
}
function handleScreenshotFilterChange() {
    myRecordsState.screenshotsFilters.searchQuery = document.getElementById('screenshot-search')?.value.trim() || '';
    myRecordsState.screenshotsFilters.chartType = document.getElementById('screenshot-filter-type')?.value || '';
    const sortVal = document.getElementById('screenshot-sort')?.value.split('_');
    if (sortVal?.length === 2) { myRecordsState.screenshotsFilters.sortBy = sortVal[0]; myRecordsState.screenshotsFilters.sortOrder = sortVal[1]; }
    // literatureId is managed by selectLiteratureRecord / clearScreenshotFiltersAndSelection
    loadScreenshots(1);
}
function clearScreenshotFiltersAndSelection() {
    document.getElementById('screenshot-search').value = '';
    document.getElementById('screenshot-filter-type').value = '';
    document.getElementById('screenshot-sort').value = 'created_at_desc';
    myRecordsState.screenshotsFilters = { searchQuery: '', chartType: '', sortBy: 'created_at', sortOrder: 'desc', literatureId: null };
    myRecordsState.selectedLiteratureId = null; // Also clear literature selection focus
    
    const url = new URL(window.location); url.searchParams.delete('literatureId');
    window.history.pushState({}, '', url);
    document.querySelectorAll('#literature-container .literature-item.selected').forEach(el => el.classList.remove('selected','bg-blue-50','border-l-blue-500'));
    loadScreenshots(1);
}
function switchScreenshotViewMode(mode) {
    if (myRecordsState.viewMode === mode) return;
    myRecordsState.viewMode = mode;
    document.getElementById('group-by-article')?.classList.toggle('btn-primary', mode === 'groupedByArticle');
    document.getElementById('group-by-article')?.classList.toggle('btn-ghost', mode !== 'groupedByArticle');
    document.getElementById('view-all-screenshots')?.classList.toggle('btn-primary', mode === 'grid');
    document.getElementById('view-all-screenshots')?.classList.toggle('btn-ghost', mode !== 'grid');
    displayScreenshots(myRecordsState.currentScreenshots);
}

// --- Literature Tab ---
async function loadLiteratureRecords(page = myRecordsState.literaturePagination.currentPage) {
    const container = document.getElementById('literature-container');
    const pagEl = document.getElementById('literature-pagination-controls');
    const countEl = document.getElementById('literature-count');
    if (!container) return;
    container.innerHTML = window.components.createLoadingComponent('Loading literature...');
    if (pagEl) pagEl.classList.add('hidden');
    if (countEl) countEl.textContent = 'Loading...';

    myRecordsState.literaturePagination.currentPage = page;
    const params = {
        page: myRecordsState.literaturePagination.currentPage,
        per_page: myRecordsState.literaturePagination.pageSize,
        search_query: myRecordsState.literatureFilters.searchQuery || undefined,
        // yearRange: myRecordsState.literatureFilters.yearRange || undefined, // Backend support pending
        sort_by: myRecordsState.literatureFilters.sortBy,
        sort_order: myRecordsState.literatureFilters.sortOrder,
    };
    try {
        const response = await window.literatureApi.getList(params);
        if (response.success && response.data) {
            myRecordsState.literatureRecords = response.data.items || [];
            myRecordsState.literaturePagination = { ...myRecordsState.literaturePagination, ...response.data };
            delete myRecordsState.literaturePagination.items;
            displayLiteratureRecords(myRecordsState.literatureRecords);
            renderLiteraturePagination();
        } else { throw response; }
    } catch (errorResponse) {
        const errorMsg = window.handleApiError(errorResponse, 'loadLiteratureRecords');
        container.innerHTML = window.components.createErrorComponent(errorMsg, 'window.myRecords.loadLiteratureRecords');
    } finally {
        if (countEl) countEl.textContent = `${myRecordsState.literaturePagination.totalItems || 0} Item${myRecordsState.literaturePagination.totalItems !== 1 ? 's' : ''}`;
        updateStatsDisplay();
    }
}
function displayLiteratureRecords(items) {
    const container = document.getElementById('literature-container');
    if (!container) return;
    if (!items || items.length === 0) {
        let msg = 'No literature records. ';
        if (myRecordsState.literatureFilters.searchQuery) msg += 'Try different filters.';
        else msg += 'Upload some on the Dashboard.';
        container.innerHTML = window.components.createEmptyState('fa-book', 'No Literature', msg); return;
    }
    container.innerHTML = ''; // Clear
    items.forEach(item => {
        // createLiteratureItem takes (item, isSelected)
        const itemHtml = window.components.createLiteratureItem(item, myRecordsState.selectedLiteratureId === item.id);
        container.innerHTML += itemHtml; // Directly append HTML string. Event listeners below.
    });
    // Re-attach listeners
    container.querySelectorAll('.literature-item').forEach(itemEl => {
        itemEl.addEventListener('click', () => selectLiteratureRecord(parseInt(itemEl.dataset.id)));
    });
}
function renderLiteraturePagination() {
    const el = document.getElementById('literature-pagination-controls');
    if (!el) return;
    const { currentPage, totalPages } = myRecordsState.literaturePagination;
    if (totalPages <= 1) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = window.components.createPaginationComponent(currentPage, totalPages, 'window.myRecords.changeLiteraturePage');
}
function changeLiteraturePage(page) {
    if (page >= 1 && page <= myRecordsState.literaturePagination.totalPages) loadLiteratureRecords(page);
}
function handleLiteratureFilterChange() {
    myRecordsState.literatureFilters.searchQuery = document.getElementById('literature-search-input')?.value.trim() || '';
    myRecordsState.literatureFilters.yearRange = document.getElementById('literature-filter-year-range')?.value.trim() || '';
    const sortVal = document.getElementById('literature-sort-select')?.value.split('_');
    if (sortVal?.length === 2) { myRecordsState.literatureFilters.sortBy = sortVal[0]; myRecordsState.literatureFilters.sortOrder = sortVal[1]; }
    if (myRecordsState.literatureFilters.yearRange) window.showToast("Year range filter backend support pending.", "info");
    loadLiteratureRecords(1);
}
function clearLiteratureFilters() {
    document.getElementById('literature-search-input').value = '';
    document.getElementById('literature-filter-year-range').value = '';
    document.getElementById('literature-sort-select').value = 'created_at_desc';
    myRecordsState.literatureFilters = { searchQuery: '', yearRange: '', sortBy: 'created_at', sortOrder: 'desc' };
    loadLiteratureRecords(1);
}
function selectLiteratureRecord(literatureId) {
    const previouslySelected = myRecordsState.selectedLiteratureId;
    if (previouslySelected === literatureId) { // Clicked same item, deselect
        myRecordsState.selectedLiteratureId = null;
        myRecordsState.screenshotsFilters.literatureId = null; // Remove filter
        document.querySelector(`#literature-container .literature-item[data-id="${literatureId}"]`)?.classList.remove('selected', 'bg-blue-50', 'border-l-blue-500');
    } else { // Select new item
        myRecordsState.selectedLiteratureId = literatureId;
        myRecordsState.screenshotsFilters.literatureId = literatureId; // Apply filter
        if (previouslySelected) {
            document.querySelector(`#literature-container .literature-item[data-id="${previouslySelected}"]`)?.classList.remove('selected', 'bg-blue-50', 'border-l-blue-500');
        }
        document.querySelector(`#literature-container .literature-item[data-id="${literatureId}"]`)?.classList.add('selected', 'bg-blue-50', 'border-l-blue-500');
    }
    switchTab('screenshots'); // Switch to screenshots tab and load/filter
}
function navigateToLiterature(literatureId) {
    myRecordsState.selectedLiteratureId = literatureId;
    switchTab('literature'); // This calls loadLiteratureRecords
    setTimeout(() => { // Ensure tab content is rendered
        const itemEl = document.querySelector(`#literature-container .literature-item[data-id="${literatureId}"]`);
        if (itemEl) itemEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        else console.warn(`Lit item ${literatureId} not in view after nav.`);
    }, 300);
}

// --- Shared/Utility ---
function updateStatsDisplay() {
    document.getElementById('total-literature').textContent = myRecordsState.literaturePagination.totalItems ?? '-';
    document.getElementById('total-screenshots').textContent = myRecordsState.screenshotsPagination.totalItems ?? '-';
    // Other stats like PDFs, Extractions would need separate API calls or aggregation if not part of existing data
    document.getElementById('total-pdfs').textContent = '-'; // Placeholder
    document.getElementById('total-extractions').textContent = '-'; // Placeholder
}
function showScreenshotModal(screenshotId) {
    const screenshot = myRecordsState.currentScreenshots.find(s => s.id === screenshotId);
    if (!screenshot) { window.showToast("Screenshot data not found.", 'error'); return; }
    const modalContent = document.getElementById('screenshot-view-content');
    if (!modalContent) { console.error("Screenshot view modal content el not found."); return; }
    
    const baseApiDomain = window.API_BASE_URL ? window.API_BASE_URL.replace('/api', '') : '';
    const imageUrl = screenshot.image_url ? `${baseApiDomain}${screenshot.image_url}` : ''; // image_url is API path
    const litTitle = screenshot.literature_article?.title ? window.components.escapeHtml(screenshot.literature_article.title) : 'N/A';

    modalContent.innerHTML = `
        <div class="mb-4 text-center">
            ${imageUrl ? `<img src="${imageUrl}" alt="Screenshot ${screenshot.id}" class="max-w-full h-auto max-h-[50vh] object-contain rounded-md shadow-md mb-4 mx-auto border">` : '<p>No preview.</p>'}
        </div>
        <dl class="space-y-2 text-sm">
            <div class="flex"><dt class="font-semibold text-gray-600 w-32">Article:</dt><dd class="text-gray-800 flex-1 line-clamp-2">${litTitle}</dd></div>
            <div class="flex"><dt class="font-semibold text-gray-600 w-32">Page:</dt><dd class="text-gray-800">${screenshot.page_number ?? 'N/A'}</dd></div>
            <div class="flex"><dt class="font-semibold text-gray-600 w-32">Type:</dt><dd class="text-gray-800">${screenshot.chart_type || 'N/A'}</dd></div>
            <div class="flex"><dt class="font-semibold text-gray-600 w-32">Captured:</dt><dd class="text-gray-800">${window.components.formatDate(screenshot.created_at)}</dd></div>
            <div class="flex"><dt class="font-semibold text-gray-600 w-32 align-top">Description:</dt><dd class="text-gray-800 flex-1 whitespace-pre-wrap">${window.components.escapeHtml(screenshot.description || 'N/A')}</dd></div>
        </dl>
        ${screenshot.wpd_data ? `<div class="border-t pt-3 mt-3"><h4 class="text-md font-semibold mb-1">WPD Data:</h4><pre class="bg-gray-100 p-3 rounded text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar">${window.components.escapeHtml(JSON.stringify(screenshot.wpd_data, null, 2))}</pre></div>` : ''}
        <div class="flex justify-end space-x-3 mt-6 pt-4 border-t">
             <a href="${imageUrl}" download="ss_${screenshot.id}.png" class="btn btn-ghost btn-sm ${!imageUrl ? 'disabled' : ''}"><i class="fas fa-download mr-2"></i>Download</a>
             <button class="btn btn-ghost btn-sm" onclick="window.hideModal('screenshot-view-modal'); window.editScreenshot(${screenshot.id});"><i class="fas fa-edit mr-2"></i>Edit</button>
             <button class="btn btn-ghost btn-sm text-red-600 hover:bg-red-50" onclick="window.hideModal('screenshot-view-modal'); window.myRecords.deleteScreenshot(${screenshot.id});"><i class="fas fa-trash mr-2"></i>Delete</button>
        </div>`;
    window.showModal('screenshot-view-modal');
}

async function deleteScreenshot(screenshotId) {
    if (!confirm('Delete this screenshot? This cannot be undone.')) return;
    window.showToast(`Deleting screenshot ${screenshotId}...`, 'info');
    try {
        const response = await window.screenshotApi.deleteScreenshot(screenshotId);
        if (response.success) {
            window.showToast(`Screenshot ${screenshotId} deleted.`, 'success');
            myRecordsState.currentScreenshots = myRecordsState.currentScreenshots.filter(s => s.id !== screenshotId);
            if(myRecordsState.screenshotsPagination.totalItems > 0) myRecordsState.screenshotsPagination.totalItems--;
            displayScreenshots(myRecordsState.currentScreenshots); // Re-render
            renderScreenshotsPagination();
            updateStatsDisplay();
        } else { throw response; }
    } catch (errorResponse) {
        window.handleApiError(errorResponse, `DeleteScreenshot ${screenshotId}`);
        // Toast handled by handleApiError
    }
}
// Ensure global literature item deletion function is set up if not defined by app.js
if (!window.deleteLiteratureItem) {
    window.deleteLiteratureItem = async function(id) {
        const item = myRecordsState.literatureRecords.find(it => it.id === id);
        if (!item) { showToast(`Article ${id} not found to delete.`, 'error'); return; }
        if (confirm(`Delete "${item.title}"? This also deletes its DB screenshot records (files may need separate cleanup if not handled by screenshot delete).`)) {
            try {
                const response = await literatureApi.deleteArticle(id);
                if (response.success) {
                    showToast(`Article "${item.title}" deleted.`, 'success');
                    myRecordsState.literatureRecords = myRecordsState.literatureRecords.filter(lit => lit.id !== id);
                    if(myRecordsState.literaturePagination.totalItems > 0) myRecordsState.literaturePagination.totalItems--;
                     // If this was the selected literature, clear selection and screenshot filter
                    if (myRecordsState.selectedLiteratureId === id) {
                         clearScreenshotFiltersAndSelection(); // This reloads screenshots
                    }
                    displayLiteratureRecords(myRecordsState.literatureRecords);
                    renderLiteraturePagination();
                    updateStatsDisplay();
                } else { throw response; }
            } catch (errorResponse) {
                handleApiError(errorResponse, `DeleteLiterature ${id}`);
            }
        }
    };
}


document.addEventListener('DOMContentLoaded', window.myRecords.initializeMyRecords);



