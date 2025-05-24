// js/my-records.js: Manages the "My Records" page (my-records.html).
// This page displays user-specific data: their literature records and screenshots.
// It allows users to browse, filter, and manage their personal data collections.
// Depends on: js/api.js, js/auth.js, js/components.js.

/**
 * State object for the My Records page.
 * @property {object|null} currentUser - Information about the logged-in user.
 * @property {Array<object>} currentScreenshots - Screenshots currently displayed (paginated, filtered).
 * @property {object} screenshotsPagination - Pagination state for screenshots.
 * @property {object} screenshotsFilters - Filtering and sorting state for screenshots.
 * @property {Array<object>} literatureRecords - Literature items currently displayed (paginated, filtered).
 * @property {object} literaturePagination - Pagination state for literature records.
 * @property {object} literatureFilters - Filtering and sorting state for literature records.
 * @property {number|null} selectedLiteratureId - ID of a literature item selected to filter screenshots.
 * @property {string} activeTab - The currently active tab ('screenshots' or 'literature').
 * @property {string} viewMode - View mode for screenshots ('grid' or 'groupedByArticle').
 */
let myRecordsState = {
    currentUser: null,
    currentScreenshots: [], 
    screenshotsPagination: { currentPage: 1, totalPages: 1, totalItems: 0, pageSize: 12 }, // Default page size for screenshots.
    screenshotsFilters: { searchQuery: '', chartType: '', sortBy: 'created_at', sortOrder: 'desc', literatureId: null },
    literatureRecords: [], 
    literaturePagination: { currentPage: 1, totalPages: 1, totalItems: 0, pageSize: 10 }, // Default page size for literature.
    literatureFilters: { searchQuery: '', yearRange: '', sortBy: 'created_at', sortOrder: 'desc' },
    selectedLiteratureId: null,  // If set, screenshots tab will filter by this literature ID.
    activeTab: 'screenshots',    // Default active tab.
    viewMode: 'grid'             // Default screenshot view mode.
};

/**
 * @global
 * Exposes state and key functions for the My Records page.
 * This allows components or console debugging to interact with the page's logic.
 * - `myRecordsState`: The main state object.
 * - `initializeMyRecords`: Initializes the page.
 * - `loadScreenshots`, `changeScreenshotsPage`: Functions for screenshot data handling.
 * - `loadLiteratureRecords`, `changeLiteraturePage`: Functions for literature data handling.
 * - `selectLiteratureRecord`, `navigateToLiterature`: Functions for literature item interaction.
 * - `switchTab`: Handles tab switching.
 * - Filter handlers: For screenshots and literature.
 * - `showScreenshotModal`: Displays screenshot details in a modal.
 * - `deleteScreenshot`: Deletes a screenshot (specific to My Records context).
 * - `updateStatsDisplay`: Updates summary statistics.
 * - `toggleGroupContent`: For accordion-style display of grouped screenshots.
 */
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
    deleteScreenshot, 
    updateStatsDisplay,
    toggleGroupContent
};

/**
 * Initializes the My Records page.
 * Checks authentication, fetches user data, sets up event listeners,
 * and loads initial data for the active tab (based on URL params or default).
 */
async function initializeMyRecords() {
    console.log('Initializing My Records...');
    // window.isAuthenticated is from auth.js
    if (!window.isAuthenticated()) { window.location.href = 'login.html'; return; }

    try {
        // window.authApi.getCurrentUser is from api.js
        const userResponse = await window.authApi.getCurrentUser();
        if (userResponse.success && userResponse.data.user) myRecordsState.currentUser = userResponse.data.user;
        else window.handleApiError(userResponse, 'MyRecords User Fetch'); // handleApiError from api.js
    } catch (e) { window.handleApiError(e, 'MyRecords User Fetch'); }

    setupMyRecordsEventListeners();
    
    // Setup listeners for the shared screenshot edit modal.
    // window.setupScreenshotEditModalListeners is from components.js.
    // It relies on window.saveScreenshotMetadata (from app.js) for the save action.
    if (window.setupScreenshotEditModalListeners) window.setupScreenshotEditModalListeners();
    else console.warn("setupScreenshotEditModalListeners not found.");
    
    // window.components.createToastContainer is from components.js
    window.components.createToastContainer(); // Ensure toast container exists for notifications.

    // Handle URL parameters for deep linking to a specific tab or filtered view.
    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get('tab');
    const literatureIdFromParam = urlParams.get('literatureId');

    if (literatureIdFromParam) { // If a literatureId is in URL, filter screenshots by it.
        myRecordsState.selectedLiteratureId = parseInt(literatureIdFromParam);
        myRecordsState.screenshotsFilters.literatureId = myRecordsState.selectedLiteratureId;
        switchTab('screenshots'); // This will also load screenshot data.
    } else {
        switchTab(initialTab || 'screenshots'); // Default to screenshots tab or specified tab.
    }
    updateStatsDisplay(); // Update summary stats like total items.
}

/** Sets up event listeners for UI elements on the My Records page. */
function setupMyRecordsEventListeners() {
    // Tab switching buttons.
    document.querySelectorAll('.tab-button').forEach(b => b.addEventListener('click', function() { switchTab(this.id.replace('tab-', '')); }));
    
    // --- Screenshot Tab Controls ---
    // window.debounce is from components.js
    document.getElementById('screenshot-search')?.addEventListener('input', window.debounce(handleScreenshotFilterChange, 500));
    document.getElementById('screenshot-filter-type')?.addEventListener('change', handleScreenshotFilterChange);
    document.getElementById('screenshot-sort')?.addEventListener('change', handleScreenshotFilterChange);
    document.getElementById('clear-screenshot-filters')?.addEventListener('click', clearScreenshotFiltersAndSelection);
    document.getElementById('group-by-article')?.addEventListener('click', () => switchScreenshotViewMode('groupedByArticle'));
    document.getElementById('view-all-screenshots')?.addEventListener('click', () => switchScreenshotViewMode('grid'));
    
    // --- Literature Tab Controls ---
    document.getElementById('literature-search-input')?.addEventListener('input', window.debounce(handleLiteratureFilterChange, 500));
    document.getElementById('literature-filter-year-range')?.addEventListener('input', window.debounce(handleLiteratureFilterChange, 500)); // Note: Year range backend filter might be pending.
    document.getElementById('literature-sort-select')?.addEventListener('change', handleLiteratureFilterChange);
    document.getElementById('clear-literature-filters')?.addEventListener('click', clearLiteratureFilters);
    
    // --- Screenshot View Modal ---
    // window.hideModal is from components.js
    document.getElementById('close-screenshot-view')?.addEventListener('click', () => window.hideModal('screenshot-view-modal'));
    const viewModal = document.getElementById('screenshot-view-modal');
    if(viewModal) viewModal.addEventListener('click', (e) => { if(e.target === viewModal) window.hideModal('screenshot-view-modal'); }); // Close on backdrop click.

    // Note on Screenshot Edit Modal:
    // Its listeners are set up by `window.setupScreenshotEditModalListeners()` called in `initializeMyRecords`.
    // The save action within that modal calls `window.saveScreenshotMetadata()`, which is defined in `app.js`.
    // This global function is designed to handle refreshes correctly whether on dashboard or My Records page.
    // Similarly, `window.editScreenshot()` (called from screenshot cards) is also defined in `app.js`
    // and designed to work across contexts by checking `window.myRecords.myRecordsState`.
}

/**
 * Switches between 'screenshots' and 'literature' tabs.
 * Updates UI, URL parameters, and loads data for the selected tab.
 * @param {string} tabName - The name of the tab to switch to ('screenshots' or 'literature').
 */
function switchTab(tabName) {
    // Logic to manage literatureId filter when switching tabs.
    if (myRecordsState.activeTab === 'screenshots' && tabName === 'literature') {
        // Commented out: Decision to keep or clear literatureId filter when moving from screenshots to literature.
        // delete myRecordsState.screenshotsFilters.literatureId; 
    } else if (tabName === 'screenshots' && myRecordsState.selectedLiteratureId) {
         // If switching to screenshots tab and a literature item is selected, apply the filter.
         myRecordsState.screenshotsFilters.literatureId = myRecordsState.selectedLiteratureId;
    } else if (tabName === 'screenshots' && !myRecordsState.selectedLiteratureId) {
        // If switching to screenshots and no literature selected, ensure filter is clear.
        delete myRecordsState.screenshotsFilters.literatureId;
    }

    myRecordsState.activeTab = tabName; // Update state.

    // Update tab button styling.
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.toggle('active', btn.id === `tab-${tabName}`);
        btn.classList.toggle('border-accent', btn.id === `tab-${tabName}`); // Tailwind classes for active tab.
        btn.classList.toggle('text-accent', btn.id === `tab-${tabName}`);
        btn.classList.toggle('border-transparent', btn.id !== `tab-${tabName}`);
        btn.classList.toggle('text-gray-500', btn.id !== `tab-${tabName}`);
    });
    // Show/hide tab content.
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('hidden', c.id !== `${tabName}-tab`));
    
    // Update URL query parameters for tab state persistence.
    const url = new URL(window.location);
    url.searchParams.set('tab', tabName);
    // Include literatureId in URL if filtering screenshots by a specific article.
    if (tabName === 'screenshots' && myRecordsState.selectedLiteratureId) url.searchParams.set('literatureId', myRecordsState.selectedLiteratureId);
    else url.searchParams.delete('literatureId');
    window.history.pushState({}, '', url); // Update URL without page reload.

    // Load data for the newly activated tab.
    if (tabName === 'screenshots') loadScreenshots(1); // Load first page of screenshots.
    else if (tabName === 'literature') loadLiteratureRecords(1); // Load first page of literature.
}

// --- Screenshots Tab Specific Functions ---

/**
 * Loads screenshots based on current filters and pagination state.
 * Fetches data using `window.mlApi.getScreenshots` (from api.js).
 * @param {number} [page=myRecordsState.screenshotsPagination.currentPage] - Page number to load.
 */
async function loadScreenshots(page = myRecordsState.screenshotsPagination.currentPage) {
    const container = document.getElementById('screenshots-container');
    const pagEl = document.getElementById('screenshots-pagination-controls'); // Pagination controls element.
    const countEl = document.getElementById('screenshots-count');             // Element to display total count.
    const filterStatusEl = document.getElementById('screenshot-literature-filter-status'); // Displays current lit filter.

    if (!container) return; // Ensure main container exists.
    // Show loading state (component from components.js).
    container.innerHTML = window.components.createLoadingComponent('Loading screenshots...');
    if (pagEl) pagEl.classList.add('hidden'); // Hide pagination during load.
    if (countEl) countEl.textContent = 'Loading...';
    if (filterStatusEl) filterStatusEl.innerHTML = ''; // Clear previous filter status.

    myRecordsState.screenshotsPagination.currentPage = page;
    // Prepare API request parameters from state.
    const params = {
        page: myRecordsState.screenshotsPagination.currentPage,
        per_page: myRecordsState.screenshotsPagination.pageSize,
        chartType: myRecordsState.screenshotsFilters.chartType || undefined, // Send undefined if filter not set.
        searchQuery: myRecordsState.screenshotsFilters.searchQuery || undefined,
        sortBy: myRecordsState.screenshotsFilters.sortBy,
        sortOrder: myRecordsState.screenshotsFilters.sortOrder,
        literatureId: myRecordsState.screenshotsFilters.literatureId || undefined,
    };

    try {
        // API call (window.mlApi.getScreenshots is an alias from api.js).
        const response = await window.mlApi.getScreenshots(params);
        if (response.success && response.data) {
            myRecordsState.currentScreenshots = response.data.items || [];
            // Update pagination state from API response.
            myRecordsState.screenshotsPagination = { ...myRecordsState.screenshotsPagination, ...response.data }; 
            delete myRecordsState.screenshotsPagination.items; // Avoid duplicating items array in pagination state.
            
            displayScreenshots(myRecordsState.currentScreenshots); // Render the fetched screenshots.
            renderScreenshotsPagination(); // Render pagination controls.

            // If filtering by a specific literature item, display its title.
            if (myRecordsState.screenshotsFilters.literatureId) {
                // Try to find literature item title from already loaded literatureRecords,
                // or fallback to the article data attached to the first screenshot (if available).
                const selLit = myRecordsState.literatureRecords.find(l => l.id === myRecordsState.screenshotsFilters.literatureId) || 
                               (myRecordsState.currentScreenshots[0]?.literature_article); 
                if (filterStatusEl && selLit) {
                    // window.components.escapeHtml is from components.js
                    filterStatusEl.innerHTML = `Filtered by: <span class="font-semibold">${window.components.escapeHtml(selLit.title)}</span> <button class="ml-2 text-xs text-gray-500 hover:text-gray-700" onclick="window.myRecords.clearScreenshotFiltersAndSelection()"><i class="fas fa-times"></i> Clear</button>`;
                }
                // Hide "Group by Article" button when already filtered by a single article.
                document.getElementById('group-by-article')?.classList.add('hidden'); 
            } else {
                 document.getElementById('group-by-article')?.classList.remove('hidden');
            }

        } else { throw response; } // Propagate API error.
    } catch (errorResponse) {
        const errorMsg = window.handleApiError(errorResponse, 'loadScreenshots');
        // Display error component (from components.js).
        container.innerHTML = window.components.createErrorComponent(errorMsg, 'window.myRecords.loadScreenshots');
        if (filterStatusEl) filterStatusEl.textContent = 'Error loading filter.';
    } finally {
        // Update total count display and ensure view mode controls are visible.
        if (countEl) countEl.textContent = `${myRecordsState.screenshotsPagination.totalItems || 0} Screenshot${myRecordsState.screenshotsPagination.totalItems !== 1 ? 's' : ''}`;
        document.getElementById('screenshots-view-mode-controls')?.classList.remove('invisible');
        updateStatsDisplay(); // Update overall stats display.
    }
}

/** Displays screenshots, either in a grid or grouped by article, based on `myRecordsState.viewMode`. */
function displayScreenshots(screenshots) {
    const container = document.getElementById('screenshots-container');
    if (!container) return;
    if (!screenshots || screenshots.length === 0) { // Handle empty state.
        let msg = myRecordsState.screenshotsFilters.literatureId ? 'No screenshots for this article. ' : 'No screenshots found. ';
        if (myRecordsState.screenshotsFilters.searchQuery || myRecordsState.screenshotsFilters.chartType) msg += 'Try different filters.';
        else if(!myRecordsState.screenshotsFilters.literatureId) msg += 'Capture some on the Dashboard.';
        // createEmptyState from components.js
        container.innerHTML = window.components.createEmptyState('fa-camera', 'No Screenshots', msg); 
        return;
    }
    // Delegate to specific rendering function based on view mode.
    myRecordsState.viewMode === 'grid' ? renderScreenshotsGrid(screenshots) : renderScreenshotsGrouped(screenshots);
}

/** Renders screenshots in a simple grid layout. */
function renderScreenshotsGrid(screenshots) {
    const container = document.getElementById('screenshots-container');
    const gridClass = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
    // Ensure the grid container div exists, or create it.
    if (!container.querySelector('.' + gridClass.replace(/ /g, '.'))) { 
        container.innerHTML = `<div class="${gridClass} screenshots-grid"></div>`;
    } else {
         container.querySelector('.screenshots-grid').innerHTML = ''; // Clear existing grid content.
    }
    const gridDiv = container.querySelector('.screenshots-grid');
    // createScreenshotCard from components.js
    screenshots.forEach(ss => { gridDiv.innerHTML += window.components.createScreenshotCard(ss); });
}

/** Renders screenshots grouped by their associated literature article in an accordion-style view. */
function renderScreenshotsGrouped(screenshots) {
    const container = document.getElementById('screenshots-container');
    container.innerHTML = ''; // Clear previous content.
    
    // Group screenshots by literature_article.id.
    const grouped = screenshots.reduce((acc, ss) => {
        const articleId = ss.literature_article?.id || 'unknown'; // Group unlinked screenshots under 'unknown'.
        if (!acc[articleId]) acc[articleId] = { article: ss.literature_article, screenshots: [] };
        acc[articleId].screenshots.push(ss); 
        return acc;
    }, {});

    // Sort groups by article title (unknown/unlinked last).
    Object.values(grouped).sort((a,b) => (a.article?.title || 'Z').localeCompare(b.article?.title || 'Z')).forEach(g => {
        const title = g.article?.title || 'Unlinked'; 
        const id = g.article?.id || 'unknown';
        const headerId = `gh-${id}`; // Unique ID for accordion header.
        const contentId = `gc-${id}`; // Unique ID for accordion content.
        // Accordion structure using Tailwind CSS for styling and basic JS for toggle.
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

/** Toggles visibility of accordion content for grouped screenshots. */
function toggleGroupContent(contentId, headerEl) {
    const content = document.getElementById(contentId);
    const icon = headerEl.querySelector('.group-toggle-icon');
    const isHidden = content.classList.toggle('hidden');
    icon.classList.toggle('rotate-180', !isHidden); // Rotate chevron icon.
    headerEl.setAttribute('aria-expanded', String(!isHidden)); // ARIA attribute for accessibility.
}

/** Renders pagination controls for the screenshots list. */
function renderScreenshotsPagination() {
    const el = document.getElementById('screenshots-pagination-controls');
    if (!el) return;
    const { currentPage, totalPages } = myRecordsState.screenshotsPagination;
    if (totalPages <= 1) { el.classList.add('hidden'); return; } // Hide if only one page.
    el.classList.remove('hidden');
    // createPaginationComponent from components.js
    el.innerHTML = window.components.createPaginationComponent(currentPage, totalPages, 'window.myRecords.changeScreenshotsPage');
}
/** Handles page change for screenshots pagination. */
function changeScreenshotsPage(page) {
    if (page >= 1 && page <= myRecordsState.screenshotsPagination.totalPages) loadScreenshots(page);
}

/** Handles changes in screenshot filter inputs (search, type, sort). */
function handleScreenshotFilterChange() {
    myRecordsState.screenshotsFilters.searchQuery = document.getElementById('screenshot-search')?.value.trim() || '';
    myRecordsState.screenshotsFilters.chartType = document.getElementById('screenshot-filter-type')?.value || '';
    const sortVal = document.getElementById('screenshot-sort')?.value.split('_');
    if (sortVal?.length === 2) { 
        myRecordsState.screenshotsFilters.sortBy = sortVal[0]; 
        myRecordsState.screenshotsFilters.sortOrder = sortVal[1]; 
    }
    // Note: literatureId filter is managed by selectLiteratureRecord / clearScreenshotFiltersAndSelection.
    loadScreenshots(1); // Reload from page 1 with new filters.
}

/** Clears all screenshot filters and the selected literature item, then reloads screenshots. */
function clearScreenshotFiltersAndSelection() {
    // Reset UI filter elements.
    document.getElementById('screenshot-search').value = '';
    document.getElementById('screenshot-filter-type').value = '';
    document.getElementById('screenshot-sort').value = 'created_at_desc'; // Default sort.
    // Reset filter state.
    myRecordsState.screenshotsFilters = { searchQuery: '', chartType: '', sortBy: 'created_at', sortOrder: 'desc', literatureId: null };
    myRecordsState.selectedLiteratureId = null; // Clear any selected literature context.
    
    // Update URL to remove literatureId parameter.
    const url = new URL(window.location); 
    url.searchParams.delete('literatureId');
    window.history.pushState({}, '', url);
    // Remove selection highlight from literature list if it was displayed.
    document.querySelectorAll('#literature-container .literature-item.selected').forEach(el => el.classList.remove('selected','bg-blue-50','border-l-blue-500'));
    loadScreenshots(1); // Reload screenshots.
}

/** Switches the display mode for screenshots (grid vs. grouped by article). */
function switchScreenshotViewMode(mode) {
    if (myRecordsState.viewMode === mode) return; // No change if already in this mode.
    myRecordsState.viewMode = mode;
    // Update button styling to reflect active mode.
    document.getElementById('group-by-article')?.classList.toggle('btn-primary', mode === 'groupedByArticle');
    document.getElementById('group-by-article')?.classList.toggle('btn-ghost', mode !== 'groupedByArticle');
    document.getElementById('view-all-screenshots')?.classList.toggle('btn-primary', mode === 'grid');
    document.getElementById('view-all-screenshots')?.classList.toggle('btn-ghost', mode !== 'grid');
    displayScreenshots(myRecordsState.currentScreenshots); // Re-render with new view mode.
}

// --- Literature Tab Specific Functions ---

/**
 * Loads literature records based on current filters and pagination state.
 * Fetches data using `window.literatureApi.getList` (from api.js).
 * @param {number} [page=myRecordsState.literaturePagination.currentPage] - Page number to load.
 */
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
        // yearRange: myRecordsState.literatureFilters.yearRange || undefined, // Backend support for year range filter is pending.
        sort_by: myRecordsState.literatureFilters.sortBy,
        sort_order: myRecordsState.literatureFilters.sortOrder,
    };
    try {
        const response = await window.literatureApi.getList(params); // API call from api.js.
        if (response.success && response.data) {
            myRecordsState.literatureRecords = response.data.items || [];
            myRecordsState.literaturePagination = { ...myRecordsState.literaturePagination, ...response.data };
            delete myRecordsState.literaturePagination.items; // Avoid duplication.
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

/** Displays literature records in the UI. Uses `createLiteratureItem` from components.js. */
function displayLiteratureRecords(items) {
    const container = document.getElementById('literature-container');
    if (!container) return;
    if (!items || items.length === 0) { // Handle empty state.
        let msg = 'No literature records. ';
        if (myRecordsState.literatureFilters.searchQuery) msg += 'Try different filters.';
        else msg += 'Upload some on the Dashboard.';
        container.innerHTML = window.components.createEmptyState('fa-book', 'No Literature', msg); 
        return;
    }
    container.innerHTML = ''; // Clear previous items.
    items.forEach(item => {
        // createLiteratureItem from components.js.
        const itemHtml = window.components.createLiteratureItem(item, myRecordsState.selectedLiteratureId === item.id);
        container.innerHTML += itemHtml;
    });
    // Re-attach listeners for item selection.
    container.querySelectorAll('.literature-item').forEach(itemEl => {
        itemEl.addEventListener('click', () => selectLiteratureRecord(parseInt(itemEl.dataset.id)));
    });
}

/** Renders pagination controls for the literature records list. */
function renderLiteraturePagination() {
    const el = document.getElementById('literature-pagination-controls');
    if (!el) return;
    const { currentPage, totalPages } = myRecordsState.literaturePagination;
    if (totalPages <= 1) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = window.components.createPaginationComponent(currentPage, totalPages, 'window.myRecords.changeLiteraturePage');
}
/** Handles page change for literature pagination. */
function changeLiteraturePage(page) {
    if (page >= 1 && page <= myRecordsState.literaturePagination.totalPages) loadLiteratureRecords(page);
}

/** Handles changes in literature filter inputs. */
function handleLiteratureFilterChange() {
    myRecordsState.literatureFilters.searchQuery = document.getElementById('literature-search-input')?.value.trim() || '';
    myRecordsState.literatureFilters.yearRange = document.getElementById('literature-filter-year-range')?.value.trim() || ''; // Backend support pending.
    const sortVal = document.getElementById('literature-sort-select')?.value.split('_');
    if (sortVal?.length === 2) { 
        myRecordsState.literatureFilters.sortBy = sortVal[0]; 
        myRecordsState.literatureFilters.sortOrder = sortVal[1]; 
    }
    if (myRecordsState.literatureFilters.yearRange) window.showToast("Year range filter backend support pending.", "info");
    loadLiteratureRecords(1);
}
/** Clears all literature filters and reloads the list. */
function clearLiteratureFilters() {
    document.getElementById('literature-search-input').value = '';
    document.getElementById('literature-filter-year-range').value = '';
    document.getElementById('literature-sort-select').value = 'created_at_desc';
    myRecordsState.literatureFilters = { searchQuery: '', yearRange: '', sortBy: 'created_at', sortOrder: 'desc' };
    loadLiteratureRecords(1);
}

/**
 * Handles selection of a literature record.
 * Updates selection state, applies it as a filter for screenshots, and switches to screenshots tab.
 * @param {number} literatureId - The ID of the selected literature item.
 */
function selectLiteratureRecord(literatureId) {
    const previouslySelected = myRecordsState.selectedLiteratureId;
    if (previouslySelected === literatureId) { // If clicking the same item, deselect it.
        myRecordsState.selectedLiteratureId = null;
        myRecordsState.screenshotsFilters.literatureId = null; // Clear screenshot filter.
        document.querySelector(`#literature-container .literature-item[data-id="${literatureId}"]`)?.classList.remove('selected', 'bg-blue-50', 'border-l-blue-500');
    } else { // Selecting a new item.
        myRecordsState.selectedLiteratureId = literatureId;
        myRecordsState.screenshotsFilters.literatureId = literatureId; // Set screenshot filter.
        // Update UI for selection.
        if (previouslySelected) {
            document.querySelector(`#literature-container .literature-item[data-id="${previouslySelected}"]`)?.classList.remove('selected', 'bg-blue-50', 'border-l-blue-500');
        }
        document.querySelector(`#literature-container .literature-item[data-id="${literatureId}"]`)?.classList.add('selected', 'bg-blue-50', 'border-l-blue-500');
    }
    switchTab('screenshots'); // Automatically switch to screenshots tab to view associated items.
}

/** Navigates to a specific literature item in the literature tab (e.g., from a screenshot card link). */
function navigateToLiterature(literatureId) {
    myRecordsState.selectedLiteratureId = literatureId; // Set selected item.
    switchTab('literature'); // Switch to literature tab.
    // After a short delay (for tab content to render), scroll the item into view.
    setTimeout(() => { 
        const itemEl = document.querySelector(`#literature-container .literature-item[data-id="${literatureId}"]`);
        if (itemEl) itemEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        else console.warn(`Lit item ${literatureId} not in view after nav.`);
    }, 300);
}

// --- Shared/Utility Functions Specific to My Records Page ---

/** Updates the display of summary statistics (total literature, total screenshots). */
function updateStatsDisplay() {
    document.getElementById('total-literature').textContent = myRecordsState.literaturePagination.totalItems ?? '-';
    document.getElementById('total-screenshots').textContent = myRecordsState.screenshotsPagination.totalItems ?? '-';
    // Placeholders for other stats; would require dedicated API endpoints or more complex data aggregation.
    document.getElementById('total-pdfs').textContent = '-'; 
    document.getElementById('total-extractions').textContent = '-'; 
}

/** 
 * Displays screenshot details in a modal.
 * Called from screenshot cards generated by `components.js`.
 * Relies on global `window.editScreenshot` (from app.js) for edit action.
 * @param {number} screenshotId - The ID of the screenshot to display.
 */
function showScreenshotModal(screenshotId) {
    const screenshot = myRecordsState.currentScreenshots.find(s => s.id === screenshotId);
    if (!screenshot) { window.showToast("Screenshot data not found.", 'error'); return; }
    
    const modalContent = document.getElementById('screenshot-view-content');
    if (!modalContent) { console.error("Screenshot view modal content el not found."); return; }
    
    // Construct image URL (window.API_BASE_URL from api.js).
    const baseApiDomain = window.API_BASE_URL ? window.API_BASE_URL.replace('/api', '') : '';
    const imageUrl = screenshot.image_url ? `${baseApiDomain}${screenshot.image_url}` : '';
    const litTitle = screenshot.literature_article?.title ? window.components.escapeHtml(screenshot.literature_article.title) : 'N/A';

    // Populate modal with screenshot details.
    // window.components.escapeHtml and window.components.formatDate are from components.js.
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
             {/* Edit button calls global window.editScreenshot (from app.js) after hiding this modal. */}
             <button class="btn btn-ghost btn-sm" onclick="window.hideModal('screenshot-view-modal'); window.editScreenshot(${screenshot.id});"><i class="fas fa-edit mr-2"></i>Edit</button>
             {/* Delete button calls local deleteScreenshot specific to My Records context. */}
             <button class="btn btn-ghost btn-sm text-red-600 hover:bg-red-50" onclick="window.hideModal('screenshot-view-modal'); window.myRecords.deleteScreenshot(${screenshot.id});"><i class="fas fa-trash mr-2"></i>Delete</button>
        </div>`;
    window.showModal('screenshot-view-modal'); // showModal from components.js.
}

/**
 * Deletes a screenshot. This version is specific to My Records page context.
 * Updates local state and UI.
 * @param {number} screenshotId - The ID of the screenshot to delete.
 */
async function deleteScreenshot(screenshotId) {
    if (!confirm('Delete this screenshot? This cannot be undone.')) return;
    window.showToast(`Deleting screenshot ${screenshotId}...`, 'info'); // showToast from components.js.
    try {
        const response = await window.screenshotApi.deleteScreenshot(screenshotId); // API call from api.js.
        if (response.success) {
            window.showToast(`Screenshot ${screenshotId} deleted.`, 'success');
            // Update local state and UI.
            myRecordsState.currentScreenshots = myRecordsState.currentScreenshots.filter(s => s.id !== screenshotId);
            if(myRecordsState.screenshotsPagination.totalItems > 0) myRecordsState.screenshotsPagination.totalItems--;
            displayScreenshots(myRecordsState.currentScreenshots); 
            renderScreenshotsPagination();
            updateStatsDisplay();
        } else { throw response; }
    } catch (errorResponse) {
        window.handleApiError(errorResponse, `DeleteScreenshot ${screenshotId}`); // Global error handler.
    }
}

/**
 * Fallback function to delete a literature item, specific to My Records context.
 * This is defined if `window.deleteLiteratureItem` (expected from app.js for dashboard context)
 * is not already present. Ensures delete functionality on literature cards works on this page.
 * @param {number} id - The ID of the literature item to delete.
 */
if (!window.deleteLiteratureItem) {
    window.deleteLiteratureItem = async function(id) {
        const item = myRecordsState.literatureRecords.find(it => it.id === id);
        if (!item) { showToast(`Article ${id} not found to delete.`, 'error'); return; }
        
        if (confirm(`Delete "${item.title}"? This also deletes its DB screenshot records (files may need separate cleanup if not handled by screenshot delete).`)) {
            try {
                const response = await literatureApi.deleteArticle(id); // literatureApi from api.js.
                if (response.success) {
                    showToast(`Article "${item.title}" deleted.`, 'success');
                    // Update local state and UI.
                    myRecordsState.literatureRecords = myRecordsState.literatureRecords.filter(lit => lit.id !== id);
                    if(myRecordsState.literaturePagination.totalItems > 0) myRecordsState.literaturePagination.totalItems--;
                    // If the deleted item was the one used for filtering screenshots, clear that filter.
                    if (myRecordsState.selectedLiteratureId === id) {
                         clearScreenshotFiltersAndSelection(); // This also reloads screenshots.
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

// Initialize the My Records page when the DOM is fully loaded.
// window.myRecords.initializeMyRecords is part of the global export from this file.
document.addEventListener('DOMContentLoaded', window.myRecords.initializeMyRecords);



