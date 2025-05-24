// js/app.js: Manages the primary state and UI logic for the main dashboard page (dashboard.html).
// Handles literature listing, PDF viewing, screenshot capture, and associated modals.
// Depends on: js/api.js, js/auth.js, js/components.js, js/pdf-viewer.js.

/**
 * Main application state for the dashboard.
 * @property {object|null} currentUser - Information about the logged-in user.
 * @property {object|null} currentLiterature - The currently selected/viewed literature item.
 * @property {Array<object>} currentScreenshots - Screenshots associated with the currentLiterature.
 * @property {Array<object>} literatureList - The list of all literature items displayed.
 * @property {object} literaturePagination - Pagination state for the literature list.
 * @property {object} literatureFilters - Filtering and sorting state for the literature list.
 * @property {number|null} editingLiteratureId - ID of the literature item currently being edited.
 */
let appState = {
    currentUser: null,
    currentLiterature: null,
    currentScreenshots: [], 
    literatureList: [],
    literaturePagination: {
        currentPage: 1,
        totalPages: 1,
        totalItems: 0,
        pageSize: 10 // Default page size for literature list.
    },
    literatureFilters: {
        searchQuery: '',
        filterBy: 'pdf_status', // Default filter category.
        filterValue: null,     // Default filter value (e.g., 'exists', 'missing').
        sortBy: 'created_at',  // Default sort field.
        sortOrder: 'desc'      // Default sort order.
    },
    editingLiteratureId: null // Tracks which literature item is in the edit modal.
};

/**
 * Initializes the dashboard page.
 * Fetches user data, sets up event listeners, loads initial literature list,
 * and handles any URL parameters for pre-selecting items or opening modals.
 */
async function initializeDashboard() {
     const isAuthenticated = window.isAuthenticated(); 
     if (!isAuthenticated) {
        window.location.href = 'login.html';
        return;
     }
    try {
        const userResponse = await authApi.getCurrentUser();
        if (userResponse.success && userResponse.data.user) {
            appState.currentUser = userResponse.data.user;
            updateUserDisplay(appState.currentUser);
        } else {
             handleApiError(userResponse, 'InitializeDashboard User Fetch');
             return;
        }
        setupEventListeners();
        // Initialize PDF viewer if available (from pdf-viewer.js).
        if (window.initializePdfViewer) window.initializePdfViewer();
        else console.error("PDF viewer 'initializePdfViewer' not found.");

        showPdfPlaceholder(); // Initially show placeholder until a PDF is loaded.
        await loadLiteratureList(); // Load main literature list.

        // Handle URL parameters for deep linking, e.g., selecting a specific literature item
        // or opening an edit modal directly on page load.
        const urlParams = new URLSearchParams(window.location.search);
        const literatureIdFromParam = urlParams.get('literatureId');
        const openEditModalFlag = urlParams.get('openEditModal');

        if (literatureIdFromParam) {
            const litId = parseInt(literatureIdFromParam);
            // Check if the pre-selected item exists in the loaded list.
            const itemToSelectOrEdit = appState.literatureList.find(item => item.id === litId);
            if (itemToSelectOrEdit) {
                await selectLiteratureItem(litId); // Selects the item and loads its PDF if available.
                if (openEditModalFlag === 'true') {
                    // If 'openEditModal' flag is true, open the literature edit modal.
                    // window.editLiteratureItem is defined later in this file or in components.js as a fallback.
                    window.editLiteratureItem(litId); 
                }
            } else {
                // If item from URL not found, show a warning.
                showToast(`Literature item ID ${litId} (from URL) not found. Displaying full list.`, 'warning');
            }
            // Optional: Clear URL parameters after processing to avoid re-triggering on refresh.
            // This can be useful if the user refreshes the page, to prevent re-processing.
            // window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
        }

        console.log('Dashboard initialized successfully');
    } catch (error) {
        console.error('Failed to initialize dashboard:', error);
        const errorMessage = handleApiError(error, 'InitializeDashboard');
    }
}

/**
 * Sets up primary event listeners for dashboard controls and modals.
 */
function setupEventListeners() {
    // User menu dropdown (top right)
    const userMenuButton = document.getElementById('user-menu-button');
    const dropdownMenu = document.getElementById('dropdown-menu');
    if (userMenuButton && dropdownMenu) {
        userMenuButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent click from immediately closing menu.
            dropdownMenu.classList.toggle('hidden');
        });
        // Close dropdown if clicking outside of it.
        document.addEventListener('click', (e) => {
            if (!userMenuButton.contains(e.target) && !dropdownMenu.contains(e.target)) {
                dropdownMenu.classList.add('hidden');
            }
        });
    }

    // Logout button (relies on window.handleLogout from auth.js or components.js)
    document.getElementById('logout-btn')?.addEventListener('click', window.handleLogout);
    
    // Upload literature modal trigger
    document.getElementById('upload-literature-btn')?.addEventListener('click', () => showModal('upload-modal'));
    setupUploadModalListeners(); // Sets up listeners specific to the upload modal.

    // Literature list controls: search, filter, sort
    document.getElementById('literature-search')?.addEventListener('input', debounce(handleLiteratureSearch, 500));
    document.getElementById('literature-filter')?.addEventListener('change', handleLiteratureFilterChange);
    document.getElementById('literature-sort')?.addEventListener('change', handleLiteratureSortChange);

    // Screenshot edit modal listeners (function from components.js)
    if (window.setupScreenshotEditModalListeners) { 
        window.setupScreenshotEditModalListeners();
    } else if (document.getElementById('screenshot-edit-modal')) {
        // Warn if the modal exists but its setup function is missing.
        console.warn("setupScreenshotEditModalListeners not found, modal might not function fully from app.js context alone.")
    }

    // Edit Literature Modal listeners
    const editLitModal = document.getElementById('edit-literature-modal');
    const closeEditLitModalBtn = document.getElementById('close-edit-literature-modal-btn'); // Close button (X icon)
    const cancelEditLitBtn = document.getElementById('cancel-edit-literature'); // "Cancel" button
    const saveLitChangesBtn = document.getElementById('save-literature-changes-btn'); // "Save Changes" button
    const editLitForm = document.getElementById('edit-literature-form'); // The form element itself
    const pdfUploadFileInput = document.getElementById('edit-lit-pdf-upload-file'); // PDF file input in the modal
    const pdfUploadStatusEl = document.getElementById('edit-lit-pdf-upload-status'); // Text element to show PDF upload status


    if (editLitModal) {
        // Listeners for closing the edit literature modal.
        closeEditLitModalBtn?.addEventListener('click', () => {
            hideModal('edit-literature-modal');
            resetLiteratureEditForm(editLitForm); // Reset form on close.
        });
        cancelEditLitBtn?.addEventListener('click', () => {
            hideModal('edit-literature-modal');
            resetLiteratureEditForm(editLitForm); // Reset form on cancel.
        });
        // Listener for saving changes (triggers API call).
        saveLitChangesBtn?.addEventListener('click', handleSaveLiteratureChanges);
        // Allow closing modal by clicking outside of its content area.
        editLitModal.addEventListener('click', (e) => {
            if (e.target === editLitModal) { // Check if click is on the modal backdrop.
                hideModal('edit-literature-modal');
                resetLiteratureEditForm(editLitForm);
            }
        });

        // Listener for PDF file input changes within the edit literature modal.
        // Provides immediate feedback on file selection and validation.
        pdfUploadFileInput?.addEventListener('change', (e) => {
             const file = e.target.files[0];
             if (file) {
                 if (file.type !== 'application/pdf') {
                     pdfUploadStatusEl.textContent = 'Invalid: Must be a PDF file.';
                     pdfUploadStatusEl.classList.add('text-red-500');
                     pdfUploadFileInput.value = ''; 
                     showToast('Invalid file type. Please select a PDF.', 'warning');
                 } else {
                     pdfUploadStatusEl.textContent = `Selected: ${file.name}`;
                     pdfUploadStatusEl.classList.remove('text-red-500');
                 }
             } else {
                  const currentItem = appState.literatureList.find(it => it.id === appState.editingLiteratureId);
                  if (currentItem?.pdf_server_path) {
                     pdfUploadStatusEl.textContent = 'Server PDF exists. New upload will replace it.';
                  } else {
                     pdfUploadStatusEl.textContent = 'No server PDF. Upload one or add external URL.';
                  }
                  pdfUploadStatusEl.classList.remove('text-red-500');
             }
        });
    }
}

/**
 * Resets the literature edit form to its default state and clears related app state.
 * @param {HTMLFormElement} formElement - The form element to reset.
 */
function resetLiteratureEditForm(formElement) {
    if (formElement) {
        formElement.reset(); // Standard HTML form reset.
    }
    // Clear specific fields and state not handled by form.reset().
    document.getElementById('edit-literature-id').value = ''; // Hidden ID field.
    const fileInput = document.getElementById('edit-lit-pdf-upload-file');
    if(fileInput) fileInput.value = ''; // Clear file input.
    const statusEl = document.getElementById('edit-lit-pdf-upload-status');
    if(statusEl) { // Reset PDF upload status message.
        statusEl.textContent = 'No server PDF. Upload one or add external URL.';
        statusEl.classList.remove('text-red-500'); // Remove any error styling.
    }
    appState.editingLiteratureId = null; // Clear the ID of the item being edited.
}

/**
 * Handles updating a literature item via API, including optional PDF file upload.
 * This function orchestrates two potential API calls: one for PDF upload, one for metadata update.
 * @param {number} articleId - The ID of the article to update.
 * @param {object} updateData - Object containing metadata fields to update (title, pdf_url, authors, etc.).
 * @param {File|null} pdfFile - Optional PDF file to upload.
 * @returns {Promise<object|null>} The updated article data from the API, or null if update fails.
 */
async function updateLiteratureItemApi(articleId, updateData, pdfFile = null) {
    const saveButton = document.getElementById('save-literature-changes-btn');
    const pdfUploadStatusEl = document.getElementById('edit-lit-pdf-upload-status');
    
    try {
        if(saveButton) saveButton.disabled = true; // Disable save button during operation.
        // Update status message based on whether a PDF is being uploaded.
        if(pdfUploadStatusEl && pdfFile) pdfUploadStatusEl.textContent = "Uploading PDF...";
        else if(pdfUploadStatusEl) pdfUploadStatusEl.textContent = "Saving changes...";

        let finalArticleData = null; // To store the article data returned by the API.

        // Step 1: Handle PDF file upload if a file is provided.
        if (pdfFile) {
            // Uses literatureApi.uploadPdfFile which internally uses createUploadHandler for progress.
            const uploadResponse = await literatureApi.uploadPdfFile(
                articleId,
                pdfFile,
                (progress) => { // Progress callback for UI updates.
                     const percent = Math.round(progress);
                     if(pdfUploadStatusEl) pdfUploadStatusEl.textContent = `PDF Uploading: ${percent}%`;
                 }
            );

            if (!uploadResponse.success) { // Handle PDF upload failure.
                if(pdfUploadStatusEl) pdfUploadStatusEl.textContent = `PDF Upload failed.`;
                throw uploadResponse; // Propagate error to main catch block.
            }
            if(pdfUploadStatusEl) pdfUploadStatusEl.textContent = `PDF Uploaded! Saving other changes...`;
            // The backend might return the updated article data after PDF upload.
            finalArticleData = uploadResponse.data?.article; 
        }

        // Step 2: Update literature metadata (title, authors, etc.).
        // This runs regardless of whether a PDF was uploaded, using `updateData`.
        const putResponse = await literatureApi.updateArticle(articleId, updateData);

        if (!putResponse.success) { // Handle metadata update failure.
            throw putResponse; // Propagate error.
        }
        // The PUT response should contain the latest article data.
        // This overwrites finalArticleData if it was set by PDF upload, ensuring it's the most current.
        finalArticleData = putResponse.data?.article; 

        showToast(pdfFile ? "PDF uploaded & changes saved!" : "Changes saved successfully!", "success");
        
        // Step 3: Update local app state and UI with the new article data.
        if (finalArticleData) {
            // Update the item in the main literature list.
            const index = appState.literatureList.findIndex(item => item.id === finalArticleData.id);
            if (index !== -1) {
                appState.literatureList[index] = finalArticleData;
                // Re-render the specific list item in the UI.
                const itemEl = document.querySelector(`#literature-list .literature-item[data-id="${finalArticleData.id}"]`);
                if (itemEl) {
                    const wasSelected = itemEl.classList.contains('selected');
                    // createLiteratureItem is from components.js
                    itemEl.outerHTML = createLiteratureItem(finalArticleData, wasSelected); 
                    // Re-attach event listeners to the newly created item.
                    const newItemEl = document.querySelector(`#literature-list .literature-item[data-id="${finalArticleData.id}"]`);
                    if(newItemEl) {
                        newItemEl.addEventListener('click', () => selectLiteratureItem(finalArticleData.id));
                        // Buttons inside item (view, upload triggers) need listeners re-attached.
                        // Note: Edit/Delete buttons in createLiteratureItem use inline onclicks, so they don't need this.
                        newItemEl.querySelector('.view-pdf-btn')?.addEventListener('click', (e) => { e.stopPropagation(); selectLiteratureItem(finalArticleData.id); });
                        newItemEl.querySelector('.upload-pdf-btn-trigger')?.addEventListener('click', (e) => { e.stopPropagation(); window.editLiteratureItem(finalArticleData.id); });
                    }
                 }
            }

            // If the updated item is the currently selected one, update `appState.currentLiterature`.
            if (appState.currentLiterature && appState.currentLiterature.id === finalArticleData.id) {
                 const oldPdfServerPath = appState.currentLiterature.pdf_server_path;
                 const oldPdfUrl = appState.currentLiterature.original_columns_data?.pdf_url;
                 appState.currentLiterature = { ...finalArticleData }; // Ensure it's a fresh copy.

                 // Check if the PDF source has changed and reload the PDF viewer if necessary.
                 const pdfSourceChanged = (oldPdfServerPath !== finalArticleData.pdf_server_path) ||
                                          (oldPdfUrl !== finalArticleData.original_columns_data?.pdf_url && !finalArticleData.pdf_server_path);
                 
                 if (pdfSourceChanged && window.loadPdfForViewing) { // window.loadPdfForViewing from pdf-viewer.js
                      await window.loadPdfForViewing(appState.currentLiterature);
                 } else if (!finalArticleData.pdf_server_path && !finalArticleData.original_columns_data?.pdf_url) {
                     // If no PDF is associated after update, show placeholder.
                     showPdfPlaceholder('No PDF associated.');
                     disablePdfControls(); // Defined in this file, affects PDF viewer controls.
                 }
            }
            return finalArticleData; // Return the updated article data.
        }
        return null; // Should not be reached if API calls are successful and return data.
    } catch (errorResponse) {
        // Catch errors from either PDF upload or metadata update.
        console.error('Error updating literature item:', errorResponse);
        handleApiError(errorResponse, `UpdateLiteratureItem ${articleId}`); // Show toast via global handler.
        if(pdfUploadStatusEl) pdfUploadStatusEl.textContent = errorResponse.error || 'Update failed.';
        throw errorResponse; // Re-throw for the calling function (handleSaveLiteratureChanges) if needed.
    } finally {
        if(saveButton) saveButton.disabled = false; // Re-enable save button.
        // Status text (like "Uploading...") is reset when the modal closes via resetLiteratureEditForm.
    }
}

/**
 * Loads the list of literature items from the API based on current pagination and filter state.
 * Updates appState and re-renders the literature list and pagination controls.
 * @param {number} [page=appState.literaturePagination.currentPage] - The page number to load.
 */
async function loadLiteratureList(page = appState.literaturePagination.currentPage) {
    const listEl = document.getElementById('literature-list');
    const paginationEl = document.getElementById('literature-pagination');
    if (listEl) listEl.innerHTML = createLoadingComponent('Loading literature...');
    if (paginationEl) paginationEl.innerHTML = '';

    appState.literaturePagination.currentPage = page;
    const params = {
        page: appState.literaturePagination.currentPage,
        per_page: appState.literaturePagination.pageSize,
        sort_by: appState.literatureFilters.sortBy,
        sort_order: appState.literatureFilters.sortOrder,
        filter_by: appState.literatureFilters.filterBy, // Should be 'pdf_status'
        filter_value: appState.literatureFilters.filterValue // 'exists' or 'missing' or null
    };
    if (appState.literatureFilters.searchQuery) {
        params.search_query = appState.literatureFilters.searchQuery;
    }

    try {
        const response = await literatureApi.getList(params);
        if (response.success && response.data) {
            appState.literatureList = response.data.items || [];
            appState.literaturePagination = {
                ...appState.literaturePagination,
                currentPage: response.data.page,
                totalPages: response.data.total_pages,
                totalItems: response.data.total_items,
            };
            displayLiteratureList(appState.literatureList);
            renderLiteraturePagination();
        } else {
            throw response;
        }
    } catch (errorResponse) {
        console.error('Error loading literature:', errorResponse);
        const errorMessage = handleApiError(errorResponse, 'LoadLiteratureList');
        if (listEl) listEl.innerHTML = createErrorComponent(errorMessage, () => loadLiteratureList());
    }
}

// --- UI Rendering Functions ---

/**
 * Renders the list of literature items in the UI.
 * Uses createLiteratureItem from components.js to generate HTML for each item.
 * @param {Array<object>} items - Array of literature item objects to display.
 */
function displayLiteratureList(items) {
    const container = document.getElementById('literature-list');
    if (!container) return; // Ensure the container element exists.

    if (!items || items.length === 0) {
        // Display an empty state message if no items are available.
        // createEmptyState is from components.js.
        container.innerHTML = createEmptyState('fa-book-open', 'No literature found.',
            // Customize message based on whether filters are active.
            (appState.literatureFilters.searchQuery || appState.literatureFilters.filterValue) ?
            'Try adjusting search/filters.' : 'Upload literature to begin.',
            // Offer an upload button if no filters are active and list is empty.
            !(appState.literatureFilters.searchQuery || appState.literatureFilters.filterValue) ?
            `<button class="btn btn-sm btn-primary mt-2" onclick="showModal('upload-modal')">Upload Literature</button>` : null
        );
        showPdfPlaceholder(); // Show PDF placeholder if list is empty.
        displayScreenshots([]); // Clear screenshots list.
        return;
    }
    // Map literature data to HTML card elements and join them.
    // createLiteratureItem is from components.js.
    container.innerHTML = items.map(item => createLiteratureItem(item, appState.currentLiterature?.id === item.id)).join('');
    
    // Add click listeners to each literature item for selection.
    container.querySelectorAll('.literature-item').forEach(itemEl => {
        itemEl.addEventListener('click', () => selectLiteratureItem(parseInt(itemEl.dataset.id)));
    });

    // Setup delegated event listeners for buttons within literature items (e.g., view PDF, upload PDF trigger).
    // This is more efficient than adding listeners to each button individually, especially for dynamic content.
    container.addEventListener('click', function(event) {
        const target = event.target.closest('button'); // Find the closest button ancestor of the click target.
        if (!target) return; // Exit if click was not on or inside a button.

        const literatureItemDiv = target.closest('.literature-item');
        if (!literatureItemDiv) return; // Exit if button is not within a literature item.
        
        const articleId = parseInt(literatureItemDiv.dataset.id); // Get article ID from data attribute.

        if (target.classList.contains('view-pdf-btn')) { // Handle 'View PDF' button click.
            event.stopPropagation(); // Prevent triggering item selection.
            const item = appState.literatureList.find(lit => lit.id === articleId);
            if (item) {
                selectLiteratureItem(articleId); // This will also trigger PDF load.
            } else {
                 showToast("Could not load PDF: item not found.", "error");
            }
        } else if (target.classList.contains('upload-pdf-btn-trigger')) { // Handle 'Upload PDF' trigger (opens edit modal).
            event.stopPropagation();
            const item = appState.literatureList.find(lit => lit.id === articleId);
             if (item) {
                 selectLiteratureItem(articleId); // Select item first.
                 window.editLiteratureItem(articleId); // Then open edit modal.
             } else {
                 showToast("Could not prepare for PDF upload: item not found.", "error");
             }
        }
        // Note: Edit and Delete buttons within literature items are handled by inline onclick attributes
        // defined in `createLiteratureItem` (components.js), which call global functions like
        // `window.editLiteratureItem` and `window.deleteLiteratureItem`.
    });
}

/**
 * Renders pagination controls for the literature list.
 * Uses createPaginationComponent from components.js.
 */
function renderLiteraturePagination() {
    const paginationEl = document.getElementById('literature-pagination');
    if (!paginationEl) return;
    const { currentPage, totalPages } = appState.literaturePagination;
    if (totalPages <= 1) { // Hide pagination if only one page or no pages.
        paginationEl.innerHTML = ''; 
        return; 
    }
    // createPaginationComponent is from components.js.
    // 'loadLiteratureList' is passed as the function name string for the onclick handlers.
    paginationEl.innerHTML = createPaginationComponent(currentPage, totalPages, 'loadLiteratureList');
}

// --- State Update & Interaction Functions ---

/**
 * Handles selection of a literature item.
 * Updates UI to mark item as selected, updates `appState.currentLiterature`,
 * loads the associated PDF for viewing, and loads its screenshots.
 * @param {number} id - The ID of the literature item to select.
 */
async function selectLiteratureItem(id) {
    const item = appState.literatureList.find(lit => lit.id === id);
    if (!item) {
        console.error('Selected literature item not found:', id);
        showToast('Selected item not found.', 'error');
        return;
    }
    // Update UI for selected item.
    document.querySelectorAll('#literature-list .literature-item.selected').forEach(el => el.classList.remove('selected', 'bg-blue-50', 'border-l-blue-500'));
    document.querySelector(`#literature-list .literature-item[data-id="${id}"]`)?.classList.add('selected', 'bg-blue-50', 'border-l-blue-500');

    appState.currentLiterature = { ...item }; // Store a copy to avoid direct state mutation issues.

    // Load PDF for viewing (function from pdf-viewer.js).
    if (window.loadPdfForViewing) {
         await window.loadPdfForViewing(appState.currentLiterature);
    } else {
        console.error("loadPdfForViewing function is not available.");
        // Fallback if PDF viewer function isn't loaded.
        showPdfPlaceholder(item.pdf_server_path || item.original_columns_data?.pdf_url ? 'PDF viewer not ready.' : 'No PDF associated.');
        disablePdfControls();
    }
    // Load screenshots associated with this literature item.
    await loadScreenshotsForLiterature(id);
}

// --- PDF Viewer UI Control Functions ---

/**
 * Shows the PDF placeholder message and hides the PDF viewer.
 * @param {string} [message='Select literature with a PDF to view.'] - Message to display.
 */
function showPdfPlaceholder(message = 'Select literature with a PDF to view.') {
    document.getElementById('pdf-placeholder')?.classList.remove('hidden');
    document.getElementById('pdf-viewer')?.classList.add('hidden');
    const placeholderTextEl = document.querySelector('#pdf-placeholder p:first-of-type');
    if (placeholderTextEl) placeholderTextEl.textContent = message;
    
    // Provide helpful sub-text if a literature item is selected but has no PDF.
    const subPlaceholderTextEl = document.querySelector('#pdf-placeholder p.text-xs');
    if (subPlaceholderTextEl) {
        if (appState.currentLiterature && (!appState.currentLiterature.pdf_server_path && !appState.currentLiterature.original_columns_data?.pdf_url)) {
            subPlaceholderTextEl.textContent = 'You can add an external PDF URL or upload a PDF file via "Edit".';
        } else {
             subPlaceholderTextEl.textContent = 'Either associate an external PDF URL or upload a PDF file.';
        }
    }
    disablePdfControls(); // Disable PDF controls when placeholder is shown.
}

/** Disables PDF viewer controls (buttons, inputs). */
function disablePdfControls() {
    ['prev-page', 'next-page', 'page-num-input', 'zoom-in', 'zoom-out', 'capture-btn']
        .forEach(id => document.getElementById(id)?.setAttribute('disabled', 'true'));
    const pageInfoEl = document.getElementById('page-info');
    if(pageInfoEl) pageInfoEl.textContent = 'of 0'; // Reset page count display.
    const pageNumInput = document.getElementById('page-num-input');
    if(pageNumInput) pageNumInput.value = ''; // Reset page number input.
    const zoomLevelEl = document.getElementById('zoom-level');
    if(zoomLevelEl) zoomLevelEl.textContent = '100%'; // Reset zoom display.
    document.getElementById('capture-rectangle')?.classList.add('hidden'); // Hide capture rectangle.
    if (window.toggleCaptureMode) window.toggleCaptureMode(false); // Ensure capture mode is off (from pdf-viewer.js).
}

/** Enables PDF viewer controls. */
function enablePdfControls() {
     ['prev-page', 'next-page', 'page-num-input', 'zoom-in', 'zoom-out', 'capture-btn']
        .forEach(id => document.getElementById(id)?.removeAttribute('disabled'));
}

// --- Modal Specific Logic ---

/** Sets up event listeners and logic for the literature upload modal. */
function setupUploadModalListeners() {
    const modal = document.getElementById('upload-modal');
    const dropZone = document.getElementById('upload-drop-zone');
    const fileInput = document.getElementById('literature-file-input');
    const cancelBtn = document.getElementById('cancel-upload');
    const closeBtn = document.getElementById('close-upload-modal-btn');
    const confirmBtn = document.getElementById('confirm-upload');
    const selectedFileInfo = document.getElementById('selected-file-info');
    const progressDiv = document.getElementById('upload-progress');
    const progressBar = document.getElementById('upload-progress-bar');
    const statusText = document.getElementById('upload-status-text');
    const percentageText = document.getElementById('upload-percentage');
    const errorMsgEl = document.getElementById('upload-error-message');

    if (!modal || !dropZone || !fileInput || !confirmBtn) {
        console.warn("Upload modal elements missing for listener setup.");
        return;
    }

    /** Resets the upload modal to its initial state. */
    function resetUploadModal() {
        fileInput.value = ''; // Clear file input.
        if(selectedFileInfo) selectedFileInfo.textContent = ''; // Clear selected file info display.
        confirmBtn.disabled = true; // Disable confirm button.
        progressDiv.classList.add('hidden'); // Hide progress bar.
        progressBar.style.width = '0%';
        if(statusText) statusText.textContent = 'Uploading...'; // Reset status text.
        if(percentageText) percentageText.textContent = '0%';
        errorMsgEl.classList.add('hidden'); // Hide error message.
        if(errorMsgEl) errorMsgEl.textContent = '';
    }
    
    /** Handles file selection, validates file type, and updates UI. */
    function handleFileSelection(selectedFile) {
        if (selectedFile) {
            const validTypes = ['.csv', '.xlsx', '.xls']; // Allowed file extensions.
            const fileNameLower = selectedFile.name.toLowerCase();
            const isValid = validTypes.some(ext => fileNameLower.endsWith(ext));
            if (!isValid) { // If file type is invalid.
                showToast('Invalid file type. Please upload CSV or Excel.', 'warning');
                fileInput.value = ''; 
                confirmBtn.disabled = true;
                if(selectedFileInfo) selectedFileInfo.textContent = 'Invalid file chosen.';
                errorMsgEl.textContent = 'Invalid file type. Please choose CSV or Excel.';
                errorMsgEl.classList.remove('hidden');
                return;
            }
            // If file type is valid.
            confirmBtn.disabled = false;
            if(selectedFileInfo) selectedFileInfo.textContent = selectedFile.name;
            errorMsgEl.classList.add('hidden'); // Hide any previous error message.
        } else { // If no file is selected (e.g., selection cancelled).
            confirmBtn.disabled = true;
            if(selectedFileInfo) selectedFileInfo.textContent = '';
        }
    }

    // Event listeners for file input and drag-and-drop.
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFileSelection(e.target.files[0]));
    ['dragenter', 'dragover'].forEach(evt => dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add('dragover','border-accent'); }));
    ['dragleave', 'drop'].forEach(evt => dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove('dragover','border-accent'); }));
    dropZone.addEventListener('drop', (e) => { // Handle file drop.
         if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleFileSelection(e.dataTransfer.files[0]);
              // Note: For drag-and-drop, fileInput.files might not be automatically populated by all browsers.
              // The `handleFileSelection` function should ideally work with the passed `selectedFile` directly
              // or the confirm button logic should check `e.dataTransfer.files[0]` if `fileInput.files[0]` is empty.
              // Current implementation relies on `handleFileSelection` enabling/disabling confirmBtn, and confirmBtn using `fileInput.files[0]`.
         }
     });

    // Listeners for modal close/cancel buttons.
    cancelBtn?.addEventListener('click', () => { hideModal('upload-modal'); resetUploadModal(); });
    closeBtn?.addEventListener('click', () => { hideModal('upload-modal'); resetUploadModal(); });

    // Listener for confirm upload button.
     confirmBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];
        if (!file) return; // No file selected.

        // Update UI for upload start.
        confirmBtn.disabled = true; 
        progressDiv.classList.remove('hidden');
        errorMsgEl.classList.add('hidden'); 
        progressBar.style.width = '0%';
        statusText.textContent = 'Uploading...';
        percentageText.textContent = '0%';

        try {
             // API call for file upload (from api.js), with progress callback.
             // window.literatureApi.uploadFile uses createUploadHandler.
             const uploadResponse = await window.literatureApi.uploadFile(file, (progress) => { 
                 const percent = Math.round(progress);
                 progressBar.style.width = percent + '%';
                 percentageText.textContent = percent + '%';
             });

            if (uploadResponse.success) { // Handle successful upload.
                statusText.textContent = 'Processing complete!';
                progressBar.style.width = '100%';
                percentageText.textContent = '100%';
                showToast(uploadResponse.data?.message || "Literature list uploaded successfully.", "success");
                setTimeout(() => { // Delay to allow toast to be seen before modal closes.
                    hideModal('upload-modal');
                    resetUploadModal();
                    loadLiteratureList(1); // Reload literature list to show new/updated items.
                }, 1500);

            } else { // Handle upload failure reported by API.
                 const msg = uploadResponse.error || 'Upload failed.';
                 errorMsgEl.textContent = msg;
                 errorMsgEl.classList.remove('hidden');
                 statusText.textContent = 'Failed';
                 showToast(msg, 'error'); // Also show toast for API errors.
            }
        } catch (error) { // Handle network errors or other exceptions during upload.
             const msg = error.error || 'Network error during upload.';
             errorMsgEl.textContent = msg;
             errorMsgEl.classList.remove('hidden');
             statusText.textContent = 'Failed';
             handleApiError(error, 'LiteratureUpload'); // Use global error handler.
        } finally {
            confirmBtn.disabled = false; // Re-enable confirm button.
        }
     });
    // Listener to close modal by clicking on backdrop.
    modal.addEventListener('click', (e) => { if (e.target === modal) { hideModal('upload-modal'); resetUploadModal(); }});
}

// --- Event Handlers for Literature Filters & Sort ---

/** Handles literature search input changes. */
function handleLiteratureSearch(event) {
    appState.literatureFilters.searchQuery = event.target.value.trim();
    loadLiteratureList(1); // Reload list from page 1 with new search query.
}
/** Handles literature filter dropdown changes (e.g., PDF status). */
function handleLiteratureFilterChange(event) {
    const value = event.target.value;
    if (value === 'all') { appState.literatureFilters.filterValue = null; }
    else if (value === 'with-pdf') { appState.literatureFilters.filterBy = 'pdf_status'; appState.literatureFilters.filterValue = 'exists'; }
    else if (value === 'without-pdf') { appState.literatureFilters.filterBy = 'pdf_status'; appState.literatureFilters.filterValue = 'missing'; }
    else { appState.literatureFilters.filterBy = 'pdf_status'; appState.literatureFilters.filterValue = null;} // Default.
    loadLiteratureList(1); // Reload list from page 1 with new filter.
}
/** Handles literature sort order changes. */
function handleLiteratureSortChange(event) {
    const [field, order] = event.target.value.split('_'); // Value format: "field_order", e.g., "title_asc".
    appState.literatureFilters.sortBy = field; 
    appState.literatureFilters.sortOrder = order;
    loadLiteratureList(1); // Reload list from page 1 with new sort order.
}

// --- User Display & Logout ---

/** Updates username display in the UI. */
function updateUserDisplay(user) {
    document.querySelectorAll('#username-display').forEach(el => {
        if (el && user?.username) el.textContent = user.username;
    });
}
/** Handles user logout action. Calls API and redirects to index page. */
async function handleLogout() {
    try { await window.authApi.logout(); } // authApi from api.js.
    catch (e) { console.warn('Logout API fail:', e); } // Log error but proceed with local logout.
    finally { 
        window.removeAuthToken(); // removeAuthToken from auth.js.
        window.location.href = 'index.html'; // Redirect to home/login page.
    }
}

// --- Screenshot Loading & Display ---
// These functions are primarily for the dashboard's screenshot panel,
// which shows screenshots related to the currently selected literature item.

/**
 * Loads screenshots for the currently selected literature item.
 * @param {number} literatureId - The ID of the literature item.
 */
async function loadScreenshotsForLiterature(literatureId) {
    const listEl = document.getElementById('screenshots-list');
    const placeholder = document.getElementById('screenshots-placeholder');
    if (listEl) listEl.innerHTML = createLoadingComponent('Loading screenshots...');
    if (placeholder) placeholder.style.display = 'none';

    try {
        // API call to fetch screenshots for the given literature ID.
        // Uses mlApi.getScreenshots (alias for screenshotApi.getScreenshots from api.js).
        // Fetches a large number of items per page to effectively get all screenshots for the article.
        const response = await window.mlApi.getScreenshots({ literatureId: literatureId, per_page: 1000 }); 
        if (response.success && response.data?.items) {
            appState.currentScreenshots = response.data.items; // Update app state.
            displayScreenshots(appState.currentScreenshots);    // Re-render the screenshots list.
        } else { 
            throw response; // Propagate API error if not successful.
        }
    } catch (errorResponse) {
        console.error(`Error loading screenshots for lit ${literatureId}:`, errorResponse);
        const errorMsg = handleApiError(errorResponse, `LoadScreenshots ${literatureId}`);
        // Display an error component in the screenshots list area.
        if (listEl) listEl.innerHTML = createErrorComponent(errorMsg, () => loadScreenshotsForLiterature(literatureId));
        if (placeholder) placeholder.style.display = 'none'; // Hide placeholder on error.
    }
}

/**
 * Renders the list of screenshots in the UI.
 * Uses createScreenshotCard from components.js to generate HTML for each screenshot.
 * @param {Array<object>} screenshots - Array of screenshot objects to display.
 */
function displayScreenshots(screenshots) {
     const container = document.getElementById('screenshots-list');
     const placeholder = document.getElementById('screenshots-placeholder');
     if (!container) return; // Ensure container element exists.
     container.innerHTML = ''; // Clear previous screenshots.

     if (!screenshots || screenshots.length === 0) {
         // Display placeholder if no screenshots are available.
         if (placeholder) {
            placeholder.style.display = 'block';
            const pText = placeholder.querySelector('p:first-of-type');
            if (pText) {
                // Customize placeholder message based on whether a literature item is selected.
                pText.textContent = appState.currentLiterature ? "No screenshots for this article yet." : "No screenshots.";
            }
         } else {
            // Fallback if placeholder element itself is missing (though it should be in dashboard.html).
            container.innerHTML = createEmptyState('fa-camera', 'No Screenshots', 'No screenshots for this item or PDF viewer not active.');
         }
         return;
     }
     if (placeholder) placeholder.style.display = 'none'; // Hide placeholder if there are screenshots.
     // Map screenshot data to HTML card elements and join them.
     container.innerHTML = screenshots.map(ss => createScreenshotCard(ss)).join('');
}

// --- Global Function Definitions (if not already provided by other scripts like my-records.js) ---
// These functions are made global (attached to window) so they can be called from
// inline onclick attributes in HTML generated by components.js, or by other scripts.

/**
 * Global function to open the literature edit modal and populate it with item data.
 * If not already defined (e.g., by my-records.js for its context), this provides
 * the dashboard-specific implementation.
 * @global
 * @function editLiteratureItem
 * @param {number} id - The ID of the literature item to edit.
 */
if (!window.editLiteratureItem) {
    window.editLiteratureItem = async function(id) {
        console.log('Dashboard: Edit literature ID', id);
        const item = appState.literatureList.find(it => it.id === id);
        if (!item) {
            showToast(`Article ${id} not found for edit.`, 'error');
            return;
        }

        appState.editingLiteratureId = id; // Track the item being edited.
        
        // Populate form fields in the 'edit-literature-modal'.
        const editLitForm = document.getElementById('edit-literature-form'); // Not strictly needed here but good for context.
        const pdfUploadFileInput = document.getElementById('edit-lit-pdf-upload-file');
        const pdfUploadStatusEl = document.getElementById('edit-lit-pdf-upload-status');

        document.getElementById('edit-literature-id').value = id;
        document.getElementById('edit-lit-title').value = item.title || '';
        const originalData = item.original_columns_data || {}; // Access potentially nested original data.
        document.getElementById('edit-lit-pdf-url').value = originalData.pdf_url || '';

        // Update PDF upload status message based on whether a server PDF exists.
        if (item.pdf_server_path) {
            pdfUploadStatusEl.textContent = 'Server PDF exists. Uploading new will replace it.';
        } else {
            pdfUploadStatusEl.textContent = 'No server PDF. Upload one or add external URL.';
        }
        pdfUploadStatusEl.classList.remove('text-red-500'); // Clear previous error styling.
        if (pdfUploadFileInput) pdfUploadFileInput.value = ''; // Reset file input.

        // Populate other metadata fields from original_columns_data.
        document.getElementById('edit-lit-authors').value = originalData.authors || ''; 
        document.getElementById('edit-lit-year').value = originalData.year || '';
        document.getElementById('edit-lit-doi').value = originalData.doi || '';
        document.getElementById('edit-lit-source').value = originalData.source || '';
        document.getElementById('edit-lit-status').value = originalData.status || ''; // e.g., 'To Read', 'In Progress'
        document.getElementById('edit-lit-notes').value = originalData.notes || '';   // User's notes

        document.getElementById('save-literature-changes-btn').disabled = false; // Ensure save button is enabled.
        showModal('edit-literature-modal'); // showModal is from components.js.
    };
}

/**
 * Handles saving changes made in the literature edit modal.
 * Collects form data, calls updateLiteratureItemApi, and updates UI on success.
 * This is an internal helper, not typically global.
 */
async function handleSaveLiteratureChanges() {
    const form = document.getElementById('edit-literature-form');
    const pdfUploadFileInput = document.getElementById('edit-lit-pdf-upload-file');
    const pdfFile = pdfUploadFileInput.files[0]; // Get the selected PDF file, if any.

    // Basic form validation.
    if (!form.checkValidity()) {
        form.reportValidity(); // Browser's built-in validation UI.
        return;
    }

    const articleId = parseInt(document.getElementById('edit-literature-id').value);
    if (!articleId) {
        showToast('Error: Article ID missing.', 'error');
        return;
    }

    const title = document.getElementById('edit-lit-title').value.trim();
    if (!title) { // Title is a required field.
        showToast('Title is required.', 'error');
        document.getElementById('edit-lit-title').focus();
        return;
    }

    // Construct payload with data from form fields for the API.
    const payload = {
        title: title,
        pdf_url: document.getElementById('edit-lit-pdf-url').value.trim() || null, // Send null if empty.
        authors: document.getElementById('edit-lit-authors').value.trim() || null,
        year: document.getElementById('edit-lit-year').value.trim() ? parseInt(document.getElementById('edit-lit-year').value.trim()) : null,
        doi: document.getElementById('edit-lit-doi').value.trim() || null,
        source: document.getElementById('edit-lit-source').value.trim() || null,
        status: document.getElementById('edit-lit-status').value.trim() || null,
        notes: document.getElementById('edit-lit-notes').value.trim() || null,
    };
    
    try {
        // Call the API handler function, passing metadata and optional PDF file.
        const updatedArticle = await updateLiteratureItemApi(articleId, payload, pdfFile);
        if (updatedArticle) { // If update was successful and returned data.
            hideModal('edit-literature-modal'); // Close modal on success.
            resetLiteratureEditForm(form);      // Reset form.
        }
    } catch (errorResponse) {
        // Errors are handled and toasted by updateLiteratureItemApi and handleApiError.
        // The finally block in updateLiteratureItemApi also handles re-enabling the save button.
        console.error("handleSaveLiteratureChanges caught error from updateLiteratureItemApi", errorResponse);
    }
}

/**
 * Global function to delete a literature item, intended for use from literature list items.
 * If not already defined (e.g., by my-records.js), this provides the dashboard-specific implementation.
 * @global
 * @function deleteLiteratureItem
 * @param {number} id - The ID of the literature item to delete.
 */
if (!window.deleteLiteratureItem) {
    window.deleteLiteratureItem = async function(id) {
        console.log('Dashboard: Delete literature ID', id);
        const item = appState.literatureList.find(it => it.id === id);
        if (!item) { showToast(`Article ${id} not found for delete.`, 'error'); return; }

        // Confirm deletion with the user.
        // Note: Message indicates related data (screenshots, PDF file) will also be deleted by backend.
        if (confirm(`Are you sure you want to delete "${item.title}"? This will also delete its screenshot database records AND any uploaded PDF file.`)) {
            try {
                const response = await literatureApi.deleteArticle(id); // API call from api.js.
                if (response.success) {
                    showToast(`Article "${item.title}" deleted.`, 'success');
                    // Remove item from local state.
                    appState.literatureList = appState.literatureList.filter(lit => lit.id !== id);
                    // If the deleted item was the currently selected one, clear selection and related views.
                    if (appState.currentLiterature?.id === id) {
                        appState.currentLiterature = null;
                        showPdfPlaceholder(); 
                        displayScreenshots([]); 
                    }
                    displayLiteratureList(appState.literatureList); // Re-render the list.
                    // Update pagination state.
                    appState.literaturePagination.totalItems = Math.max(0, appState.literaturePagination.totalItems -1);
                    // If deletion causes current page to exceed total pages, adjust to last valid page.
                    if(appState.literaturePagination.totalItems > 0 && appState.literaturePagination.currentPage > appState.literaturePagination.totalPages) {
                        loadLiteratureList(Math.max(1, appState.literaturePagination.totalPages));
                    } else {
                        renderLiteraturePagination(); // Otherwise, just re-render pagination.
                    }
                } else { throw response; }
            } catch (errorResponse) {
                handleApiError(errorResponse, `DeleteLiterature ${id}`);
            }
        }
    };
}

// --- Global Function Definitions & Exports ---

// Global exports for PDF viewer interaction (from pdf-viewer.js).
// These provide fallback console warnings if pdf-viewer.js or its functions haven't loaded,
// indicating a potential script loading order issue or missing file.
// `app.js` defines the UI manipulation functions (showPdfPlaceholder, disablePdfControls, enablePdfControls)
// and expects `pdf-viewer.js` to provide the core PDF loading logic (`loadPdfForViewing`).
window.showPdfPlaceholder = window.showPdfPlaceholder || function(message) { console.warn("pdf-viewer.js: showPdfPlaceholder not loaded, message:", message); };
window.disablePdfControls = window.disablePdfControls || function() { console.warn("pdf-viewer.js: disablePdfControls not loaded"); };
window.enablePdfControls = window.enablePdfControls || function() { console.warn("pdf-viewer.js: enablePdfControls not loaded"); };
window.loadPdfForViewing = window.loadPdfForViewing || function(item) { console.warn("pdf-viewer.js: loadPdfForViewing not loaded for item:", item); return Promise.resolve(); };

// App specific globals exposed for use by other scripts (e.g., pdf-viewer.js, components.js).
/** 
 * Loads screenshots for a given literature ID. Exposed globally for pdf-viewer.js.
 * @global
 * @async
 * @function loadScreenshotsForLiterature
 * @param {number} literatureId - The ID of the literature item.
 */
window.loadScreenshotsForLiterature = loadScreenshotsForLiterature;
/** 
 * The main application state object. Exposed globally for access by other modules if needed (e.g. pdf-viewer.js).
 * @global
 * @type {object}
 */
window.appState = appState;
/** 
 * Selects a literature item, updates UI, and loads its PDF/screenshots. Exposed globally.
 * @global
 * @async
 * @function selectLiteratureItem
 * @param {number} id - The ID of the literature item to select.
 */
window.selectLiteratureItem = selectLiteratureItem; 

/**
 * Global function to open the screenshot edit modal with data for a specific screenshot.
 * It attempts to find the screenshot data in either the dashboard's current screenshots
 * or in the My Records page's state if available (allowing modal reuse).
 * This function is attached to `window` to be callable from dynamically generated
 * HTML in `components.js` (e.g., onclick attributes on screenshot cards).
 * @global
 * @async
 * @function editScreenshot
 * @param {number} screenshotId - The ID of the screenshot to edit.
 */
window.editScreenshot = async function(screenshotId) {
    console.log(`Attempting to edit screenshot ID: ${screenshotId}`);
    let screenshotData = null;

    // Try finding in appState.currentScreenshots (dashboard context).
    if (appState && appState.currentScreenshots) {
        screenshotData = appState.currentScreenshots.find(ss => ss.id === screenshotId);
    }

    // If not found in dashboard context, try finding in window.myRecords (My Records page context).
    // This allows the same edit modal to be used from both pages.
    // window.myRecords is defined in my-records.js.
    if (!screenshotData && window.myRecords && window.myRecords.myRecordsState && window.myRecords.myRecordsState.currentScreenshots) {
        screenshotData = window.myRecords.myRecordsState.currentScreenshots.find(ss => ss.id === screenshotId);
    }
    
    // Fallback: Could potentially fetch screenshot details directly via API if not found in local state.
    // This is not currently implemented to keep client-side state management simpler and rely on loaded lists.
    // if (!screenshotData && ...) { /* TODO: Implement direct fetch if necessary */ }


    if (screenshotData) {
        // Populate modal fields with existing screenshot data.
        document.getElementById('edit-screenshot-id').value = screenshotData.id;
        
        const chartTypeSelect = document.getElementById('chart-type-select');
        if (chartTypeSelect) {
            chartTypeSelect.value = screenshotData.chart_type || ''; // Default to empty if null/undefined.
        }
        
        const descriptionTextarea = document.getElementById('screenshot-description');
        if (descriptionTextarea) {
            descriptionTextarea.value = screenshotData.description || '';
        }
        
        const wpdDataTextarea = document.getElementById('wpd-data');
        if (wpdDataTextarea) {
            // WPD (WebPlotDigitizer) data is stored as JSON; stringify for textarea display.
            if (screenshotData.wpd_data) {
                try {
                    wpdDataTextarea.value = JSON.stringify(screenshotData.wpd_data, null, 2); // Pretty print JSON.
                } catch (e) {
                    console.error("Error stringifying wpd_data:", e);
                    wpdDataTextarea.value = "Error displaying WPD data."; // Fallback for display.
                }
            } else {
                wpdDataTextarea.value = ''; // Clear if no wpd_data.
            }
        }
        
        showModal('screenshot-edit-modal'); // showModal is from components.js.
    } else {
        // If screenshot data cannot be found in any known state, show an error.
        console.error(`Screenshot with ID ${screenshotId} not found.`);
        showToast(`Screenshot ${screenshotId} data not found. Please refresh and try again.`, 'error');
    }
};

/**
 * Global function to save screenshot metadata changes from the edit modal.
 * Calls the API to update metadata and then refreshes the relevant screenshot list(s).
 * Attached to `window` to be callable from the 'Save Changes' button in the modal,
 * which is part of the main HTML structure but managed by `components.js`.
 * @global
 * @async
 * @function saveScreenshotMetadata
 */
window.saveScreenshotMetadata = async function() {
    const screenshotId = parseInt(document.getElementById('edit-screenshot-id').value);
    if (!screenshotId) {
        showToast('Error: Screenshot ID missing.', 'error');
        return;
    }

    // Collect updated data from form fields in the screenshot edit modal.
    const chartType = document.getElementById('chart-type-select').value;
    const description = document.getElementById('screenshot-description').value.trim();
    const wpdDataString = document.getElementById('wpd-data').value.trim();

    let wpdData = null;
    if (wpdDataString) { // Parse WPD data from JSON string if provided.
        try {
            wpdData = JSON.parse(wpdDataString);
        } catch (e) {
            // Handle invalid JSON in WPD data field.
            showToast('Invalid JSON format in WPD Data. Please correct it or leave empty.', 'error');
            console.error("Error parsing WPD Data JSON:", e);
            document.getElementById('wpd-data').focus(); // Focus the field with invalid JSON.
            document.getElementById('wpd-data').classList.add('border-red-500'); // Add error styling.
            return; // Prevent API call with invalid data.
        }
        document.getElementById('wpd-data').classList.remove('border-red-500'); // Remove error styling on successful parse or if field is cleared.
    }

    // Prepare payload for the API. Send null for empty optional fields to ensure backend handles correctly.
    const collectedData = {
        chart_type: chartType || null, 
        description: description || null, 
        wpd_data: wpdData // Already null if wpdDataString was empty or parsing resulted in null.
    };

    const saveButton = document.querySelector('#screenshot-edit-modal button[onclick="window.saveScreenshotMetadata()"]');
    if(saveButton) saveButton.disabled = true; // Disable button during API call.

    try {
        // API call to update screenshot metadata (uses screenshotApi from api.js).
        const response = await screenshotApi.updateMetadata(screenshotId, collectedData);
        if (response.success) {
            showToast('Screenshot metadata updated successfully!', 'success');
            hideModal('screenshot-edit-modal'); // hideModal from components.js.

            // Refresh the relevant screenshot list based on current application context.
            if (appState && appState.currentLiterature && appState.currentLiterature.id) {
                // If on dashboard and a literature item is selected, reload its screenshots.
                await loadScreenshotsForLiterature(appState.currentLiterature.id);
            } else if (typeof window.myRecords !== 'undefined' && 
                       window.myRecords.myRecordsState && 
                       window.myRecords.myRecordsState.activeTab === 'screenshots') {
                // If on My Records page and screenshots tab is active, reload My Records screenshots.
                // window.myRecords.loadScreenshots is from my-records.js.
                await window.myRecords.loadScreenshots();
            } else {
                // Fallback if context is unclear (should not typically happen).
                console.log('Screenshot metadata saved, but no specific list to refresh in current context.');
            }
        } else {
            throw response; // Let the catch block handle API errors from response (e.g., validation errors).
        }
    } catch (errorResponse) {
        console.error('Error saving screenshot metadata:', errorResponse);
        handleApiError(errorResponse, `SaveScreenshotMetadata ${screenshotId}`); // Show toast via global error handler.
    } finally {
        if(saveButton) saveButton.disabled = false; // Re-enable button regardless of outcome.
    }
};

/**
 * Global function to delete a screenshot, intended for use from screenshot cards on the dashboard.
 * If not already defined (e.g., by my-records.js for its context), this provides
 * the dashboard-specific implementation. This ensures screenshot cards generated by
 * `components.js` can trigger deletion from the dashboard.
 * @global
 * @async
 * @function deleteScreenshot
 * @param {number} screenshotId - The ID of the screenshot to delete.
 */
if (!window.deleteScreenshot) {
    window.deleteScreenshot = async function(screenshotId) {
        // Deletion from dashboard requires a current literature context to refresh the view correctly.
        if (!appState.currentLiterature) {
            showToast("Cannot delete screenshot: no literature context.", "error");
            return;
        }
        // Find screenshot in the current dashboard list.
        const screenshot = appState.currentScreenshots.find(s => s.id === screenshotId);
        if (!screenshot) {
            showToast(`Screenshot ${screenshotId} not found in current view.`, "error");
            return;
        }

        // Confirm deletion with the user.
        if (confirm(`Are you sure you want to delete screenshot ${screenshotId} for article "${appState.currentLiterature.title}"? This cannot be undone.`)) {
            try {
                // API call to delete screenshot (uses screenshotApi from api.js).
                const response = await screenshotApi.deleteScreenshot(screenshotId);
                if (response.success) {
                    showToast(`Screenshot ${screenshotId} deleted.`, 'success');
                    // Refresh screenshots for the current literature item to reflect the deletion.
                    await loadScreenshotsForLiterature(appState.currentLiterature.id);
                } else {
                    throw response; // Let the catch block handle API errors.
                }
            } catch (errorResponse) {
                handleApiError(errorResponse, `DeleteScreenshot ${screenshotId}`);
            }
        }
    };
}

// Initialize the dashboard when the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', initializeDashboard);
