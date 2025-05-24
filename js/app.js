// Main application state and initialization (for dashboard.html)
let appState = {
    currentUser: null,
    currentLiterature: null,
    currentScreenshots: [], 
    literatureList: [],
    literaturePagination: {
        currentPage: 1,
        totalPages: 1,
        totalItems: 0,
        pageSize: 10
    },
    literatureFilters: {
        searchQuery: '',
        filterBy: 'pdf_status', 
        filterValue: null, 
        sortBy: 'created_at',
        sortOrder: 'desc'
    },
    editingLiteratureId: null 
};

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
        if (window.initializePdfViewer) window.initializePdfViewer();
        else console.error("PDF viewer 'initializePdfViewer' not found.");

        showPdfPlaceholder();
        await loadLiteratureList(); // Load main list first

        // Handle URL parameters for specific literature item and modal opening
        const urlParams = new URLSearchParams(window.location.search);
        const literatureIdFromParam = urlParams.get('literatureId');
        const openEditModalFlag = urlParams.get('openEditModal');

        if (literatureIdFromParam) {
            const litId = parseInt(literatureIdFromParam);
            const itemToSelectOrEdit = appState.literatureList.find(item => item.id === litId);
            if (itemToSelectOrEdit) {
                await selectLiteratureItem(litId); // Selects and loads PDF if available
                if (openEditModalFlag === 'true') {
                    window.editLiteratureItem(litId); // Open the edit modal
                }
            } else {
                showToast(`Literature item ID ${litId} (from URL) not found. Displaying full list.`, 'warning');
            }
            // Optional: Clear URL params after processing to avoid re-triggering on refresh.
            // window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
        }

        console.log('Dashboard initialized successfully');
    } catch (error) {
        console.error('Failed to initialize dashboard:', error);
        const errorMessage = handleApiError(error, 'InitializeDashboard');
    }
}

function setupEventListeners() {
    const userMenuButton = document.getElementById('user-menu-button');
    const dropdownMenu = document.getElementById('dropdown-menu');
    if (userMenuButton && dropdownMenu) {
        userMenuButton.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle('hidden');
        });
        document.addEventListener('click', (e) => {
            if (!userMenuButton.contains(e.target) && !dropdownMenu.contains(e.target)) {
                dropdownMenu.classList.add('hidden');
            }
        });
    }
    document.getElementById('logout-btn')?.addEventListener('click', window.handleLogout);
    document.getElementById('upload-literature-btn')?.addEventListener('click', () => showModal('upload-modal'));
    setupUploadModalListeners(); 

    document.getElementById('literature-search')?.addEventListener('input', debounce(handleLiteratureSearch, 500));
    document.getElementById('literature-filter')?.addEventListener('change', handleLiteratureFilterChange);
    document.getElementById('literature-sort')?.addEventListener('change', handleLiteratureSortChange);

    if (window.setupScreenshotEditModalListeners) { 
        window.setupScreenshotEditModalListeners();
    } else if (document.getElementById('screenshot-edit-modal')) {
        console.warn("setupScreenshotEditModalListeners not found, modal might not function fully from app.js context alone.")
    }

    const editLitModal = document.getElementById('edit-literature-modal');
    const closeEditLitModalBtn = document.getElementById('close-edit-literature-modal-btn');
    const cancelEditLitBtn = document.getElementById('cancel-edit-literature');
    const saveLitChangesBtn = document.getElementById('save-literature-changes-btn');
    const editLitForm = document.getElementById('edit-literature-form');
    const pdfUploadFileInput = document.getElementById('edit-lit-pdf-upload-file');
    const pdfUploadStatusEl = document.getElementById('edit-lit-pdf-upload-status');


    if (editLitModal) {
        closeEditLitModalBtn?.addEventListener('click', () => {
            hideModal('edit-literature-modal');
            resetLiteratureEditForm(editLitForm);
        });
        cancelEditLitBtn?.addEventListener('click', () => {
            hideModal('edit-literature-modal');
            resetLiteratureEditForm(editLitForm);
        });
        saveLitChangesBtn?.addEventListener('click', handleSaveLiteratureChanges);
        editLitModal.addEventListener('click', (e) => {
            if (e.target === editLitModal) {
                hideModal('edit-literature-modal');
                resetLiteratureEditForm(editLitForm);
            }
        });

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

function resetLiteratureEditForm(formElement) {
    if (formElement) {
        formElement.reset();
    }
    document.getElementById('edit-literature-id').value = '';
    const fileInput = document.getElementById('edit-lit-pdf-upload-file');
    if(fileInput) fileInput.value = ''; 
    const statusEl = document.getElementById('edit-lit-pdf-upload-status');
    if(statusEl) {
        statusEl.textContent = 'No server PDF. Upload one or add external URL.';
        statusEl.classList.remove('text-red-500');
    }
    appState.editingLiteratureId = null;
}

async function updateLiteratureItemApi(articleId, updateData, pdfFile = null) {
    const saveButton = document.getElementById('save-literature-changes-btn');
    const pdfUploadStatusEl = document.getElementById('edit-lit-pdf-upload-status');
    
    try {
        if(saveButton) saveButton.disabled = true;
        if(pdfUploadStatusEl && pdfFile) pdfUploadStatusEl.textContent = "Uploading PDF...";
        else if(pdfUploadStatusEl) pdfUploadStatusEl.textContent = "Saving changes...";

        let finalArticleData = null;

        if (pdfFile) {
            const uploadResponse = await literatureApi.uploadPdfFile(
                articleId,
                pdfFile,
                (progress) => { 
                     const percent = Math.round(progress);
                     if(pdfUploadStatusEl) pdfUploadStatusEl.textContent = `PDF Uploading: ${percent}%`;
                 }
            );

            if (!uploadResponse.success) {
                if(pdfUploadStatusEl) pdfUploadStatusEl.textContent = `PDF Upload failed.`;
                throw uploadResponse; 
            }
            if(pdfUploadStatusEl) pdfUploadStatusEl.textContent = `PDF Uploaded! Saving other changes...`;
            finalArticleData = uploadResponse.data?.article; 
        }

        const putResponse = await literatureApi.updateArticle(articleId, updateData);

        if (!putResponse.success) {
            throw putResponse;
        }
        finalArticleData = putResponse.data?.article; // Use the latest data from PUT

        showToast(pdfFile ? "PDF uploaded & changes saved!" : "Changes saved successfully!", "success");
        
        if (finalArticleData) {
            const index = appState.literatureList.findIndex(item => item.id === finalArticleData.id);
            if (index !== -1) {
                appState.literatureList[index] = finalArticleData;
                const itemEl = document.querySelector(`#literature-list .literature-item[data-id="${finalArticleData.id}"]`);
                if (itemEl) {
                    const wasSelected = itemEl.classList.contains('selected');
                    itemEl.outerHTML = createLiteratureItem(finalArticleData, wasSelected); 
                    const newItemEl = document.querySelector(`#literature-list .literature-item[data-id="${finalArticleData.id}"]`);
                    if(newItemEl) {
                        newItemEl.addEventListener('click', () => selectLiteratureItem(finalArticleData.id));
                        // Re-attach delegated button listeners after re-render of this item.
                        // displayLiteratureList usually handles this for the whole list, but here we only updated one item.
                        // For simplicity, can rely on broader re-render or ensure new item's buttons are wired.
                        // The createLiteratureItem attaches onclicks for edit/delete. For view/upload:
                        newItemEl.querySelector('.view-pdf-btn')?.addEventListener('click', (e) => { e.stopPropagation(); selectLiteratureItem(finalArticleData.id); });
                        newItemEl.querySelector('.upload-pdf-btn-trigger')?.addEventListener('click', (e) => { e.stopPropagation(); window.editLiteratureItem(finalArticleData.id); });
                    }
                 }
            }

            if (appState.currentLiterature && appState.currentLiterature.id === finalArticleData.id) {
                 const oldPdfServerPath = appState.currentLiterature.pdf_server_path;
                 const oldPdfUrl = appState.currentLiterature.original_columns_data?.pdf_url;
                 appState.currentLiterature = { ...finalArticleData }; // Update current selection state, ensure it's a fresh copy

                 const pdfSourceChanged = (oldPdfServerPath !== finalArticleData.pdf_server_path) ||
                                          (oldPdfUrl !== finalArticleData.original_columns_data?.pdf_url && !finalArticleData.pdf_server_path);
                 
                 if (pdfSourceChanged && window.loadPdfForViewing) {
                      await window.loadPdfForViewing(appState.currentLiterature);
                 } else if (!finalArticleData.pdf_server_path && !finalArticleData.original_columns_data?.pdf_url) {
                     showPdfPlaceholder('No PDF associated.');
                     disablePdfControls();
                 }
            }
            return finalArticleData;
        }
        return null;
    } catch (errorResponse) {
        console.error('Error updating literature item:', errorResponse);
        handleApiError(errorResponse, `UpdateLiteratureItem ${articleId}`);
        if(pdfUploadStatusEl) pdfUploadStatusEl.textContent = errorResponse.error || 'Update failed.';
        throw errorResponse; 
    } finally {
        if(saveButton) saveButton.disabled = false;
        // Status text reset handled by resetLiteratureEditForm when modal closes
    }
}

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

function displayLiteratureList(items) {
    const container = document.getElementById('literature-list');
    if (!container) return;
    if (!items || items.length === 0) {
        container.innerHTML = createEmptyState('fa-book-open', 'No literature found.',
            (appState.literatureFilters.searchQuery || appState.literatureFilters.filterValue) ?
            'Try adjusting search/filters.' : 'Upload literature to begin.',
            !(appState.literatureFilters.searchQuery || appState.literatureFilters.filterValue) ?
            `<button class="btn btn-sm btn-primary mt-2" onclick="showModal('upload-modal')">Upload Literature</button>` : null
        );
        showPdfPlaceholder(); displayScreenshots([]); 
        return;
    }
    container.innerHTML = items.map(item => createLiteratureItem(item, appState.currentLiterature?.id === item.id)).join('');
    
    container.querySelectorAll('.literature-item').forEach(itemEl => {
        itemEl.addEventListener('click', () => selectLiteratureItem(parseInt(itemEl.dataset.id)));
    });

    // Delegated event listeners for buttons inside literature items
    container.addEventListener('click', function(event) {
        const target = event.target.closest('button');
        if (!target) return;

        const literatureItemDiv = target.closest('.literature-item');
        if (!literatureItemDiv) return;
        
        const articleId = parseInt(literatureItemDiv.dataset.id);

        if (target.classList.contains('view-pdf-btn')) {
            event.stopPropagation();
            const item = appState.literatureList.find(lit => lit.id === articleId);
            if (item) {
                selectLiteratureItem(articleId); // This will also trigger PDF load
            } else {
                 showToast("Could not load PDF: item not found.", "error");
            }
        } else if (target.classList.contains('upload-pdf-btn-trigger')) {
            event.stopPropagation();
            const item = appState.literatureList.find(lit => lit.id === articleId);
             if (item) {
                 selectLiteratureItem(articleId); // Select item first
                 window.editLiteratureItem(articleId); // Then open edit modal
             } else {
                 showToast("Could not prepare for PDF upload: item not found.", "error");
             }
        }
        // Edit and Delete buttons are handled by onclick attributes in createLiteratureItem
    });
}

function renderLiteraturePagination() {
    const paginationEl = document.getElementById('literature-pagination');
    if (!paginationEl) return;
    const { currentPage, totalPages } = appState.literaturePagination;
    if (totalPages <= 1) { paginationEl.innerHTML = ''; return; }
    paginationEl.innerHTML = createPaginationComponent(currentPage, totalPages, 'loadLiteratureList');
}

async function selectLiteratureItem(id) {
    const item = appState.literatureList.find(lit => lit.id === id);
    if (!item) {
        console.error('Selected literature item not found:', id);
        showToast('Selected item not found.', 'error');
        return;
    }
    document.querySelectorAll('#literature-list .literature-item.selected').forEach(el => el.classList.remove('selected', 'bg-blue-50', 'border-l-blue-500'));
    document.querySelector(`#literature-list .literature-item[data-id="${id}"]`)?.classList.add('selected', 'bg-blue-50', 'border-l-blue-500');

    appState.currentLiterature = { ...item }; // Store a copy to avoid direct state mutation issues

    if (window.loadPdfForViewing) {
         await window.loadPdfForViewing(appState.currentLiterature);
    } else {
        console.error("loadPdfForViewing function is not available.");
        showPdfPlaceholder(item.pdf_server_path || item.original_columns_data?.pdf_url ? 'PDF viewer not ready.' : 'No PDF associated.');
        disablePdfControls();
    }
    await loadScreenshotsForLiterature(id);
}

function showPdfPlaceholder(message = 'Select literature with a PDF to view.') {
    document.getElementById('pdf-placeholder')?.classList.remove('hidden');
    document.getElementById('pdf-viewer')?.classList.add('hidden');
    const placeholderTextEl = document.querySelector('#pdf-placeholder p:first-of-type');
    if (placeholderTextEl) placeholderTextEl.textContent = message;
    
    const subPlaceholderTextEl = document.querySelector('#pdf-placeholder p.text-xs');
    if (subPlaceholderTextEl) {
        if (appState.currentLiterature && (!appState.currentLiterature.pdf_server_path && !appState.currentLiterature.original_columns_data?.pdf_url)) {
            subPlaceholderTextEl.textContent = 'You can add an external PDF URL or upload a PDF file via "Edit".';
        } else {
             subPlaceholderTextEl.textContent = 'Either associate an external PDF URL or upload a PDF file.';
        }
    }
    disablePdfControls();
}

function disablePdfControls() {
    ['prev-page', 'next-page', 'page-num-input', 'zoom-in', 'zoom-out', 'capture-btn']
        .forEach(id => document.getElementById(id)?.setAttribute('disabled', 'true'));
    const pageInfoEl = document.getElementById('page-info');
    if(pageInfoEl) pageInfoEl.textContent = 'of 0';
    const pageNumInput = document.getElementById('page-num-input');
    if(pageNumInput) pageNumInput.value = '';
    const zoomLevelEl = document.getElementById('zoom-level');
    if(zoomLevelEl) zoomLevelEl.textContent = '100%';
    document.getElementById('capture-rectangle')?.classList.add('hidden');
    if (window.toggleCaptureMode) window.toggleCaptureMode(false); // Ensure capture mode is off
}

function enablePdfControls() {
     ['prev-page', 'next-page', 'page-num-input', 'zoom-in', 'zoom-out', 'capture-btn']
        .forEach(id => document.getElementById(id)?.removeAttribute('disabled'));
}

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

    if (!modal || !dropZone || !fileInput || !confirmBtn) return;

    function resetUploadModal() {
        fileInput.value = '';
        if(selectedFileInfo) selectedFileInfo.textContent = '';
        confirmBtn.disabled = true;
        progressDiv.classList.add('hidden');
        progressBar.style.width = '0%';
        if(statusText) statusText.textContent = 'Uploading...';
        if(percentageText) percentageText.textContent = '0%';
        errorMsgEl.classList.add('hidden');
        if(errorMsgEl) errorMsgEl.textContent = '';
    }
    
    function handleFileSelection(selectedFile) {
        if (selectedFile) {
            const validTypes = ['.csv', '.xlsx', '.xls'];
            const fileNameLower = selectedFile.name.toLowerCase();
            const isValid = validTypes.some(ext => fileNameLower.endsWith(ext));
            if (!isValid) {
                showToast('Invalid file type. Please upload CSV or Excel.', 'warning');
                fileInput.value = ''; 
                confirmBtn.disabled = true;
                if(selectedFileInfo) selectedFileInfo.textContent = 'Invalid file chosen.';
                errorMsgEl.textContent = 'Invalid file type. Please choose CSV or Excel.';
                errorMsgEl.classList.remove('hidden');
                return;
            }
            confirmBtn.disabled = false;
            if(selectedFileInfo) selectedFileInfo.textContent = selectedFile.name;
            errorMsgEl.classList.add('hidden');
        } else {
            confirmBtn.disabled = true;
            if(selectedFileInfo) selectedFileInfo.textContent = '';
        }
    }

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFileSelection(e.target.files[0]));
    ['dragenter', 'dragover'].forEach(evt => dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add('dragover','border-accent'); }));
    ['dragleave', 'drop'].forEach(evt => dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove('dragover','border-accent'); }));
    dropZone.addEventListener('drop', (e) => {
         if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleFileSelection(e.dataTransfer.files[0]);
              // Manually assign to fileInput if needed, some browsers might not allow direct assignment
              // For modern browsers, creating a new FileList and assigning is complex.
              // It's better if `handleFileSelection` can use the file directly or trigger logic.
              // For this simple case, we can assume if user drops, then confirm button uses `e.dataTransfer.files[0]`
              // Or simpler: just update UI and let confirm button use fileInput.files[0] which should be set by change event.
              // The current `handleFileSelection` already updates the confirmBtn state.
         }
     });

    cancelBtn?.addEventListener('click', () => { hideModal('upload-modal'); resetUploadModal(); });
    closeBtn?.addEventListener('click', () => { hideModal('upload-modal'); resetUploadModal(); });

     confirmBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];
        if (!file) return;

        confirmBtn.disabled = true; 
        progressDiv.classList.remove('hidden');
        errorMsgEl.classList.add('hidden'); 
        progressBar.style.width = '0%';
        statusText.textContent = 'Uploading...';
        percentageText.textContent = '0%';

        try {
             const uploadResponse = await window.literatureApi.uploadFile(file, (progress) => { 
                 const percent = Math.round(progress);
                 progressBar.style.width = percent + '%';
                 percentageText.textContent = percent + '%';
             });

            if (uploadResponse.success) {
                statusText.textContent = 'Processing complete!';
                progressBar.style.width = '100%';
                percentageText.textContent = '100%';
                showToast(uploadResponse.data?.message || "Literature list uploaded successfully.", "success");
                setTimeout(() => { // Give toast time to show
                    hideModal('upload-modal');
                    resetUploadModal();
                    loadLiteratureList(1); // Reload to show new/updated items
                }, 1500);

            } else {
                 const msg = uploadResponse.error || 'Upload failed.';
                 errorMsgEl.textContent = msg;
                 errorMsgEl.classList.remove('hidden');
                 statusText.textContent = 'Failed';
                 showToast(msg, 'error');
            }
        } catch (error) {
             const msg = error.error || 'Network error during upload.';
             errorMsgEl.textContent = msg;
             errorMsgEl.classList.remove('hidden');
             statusText.textContent = 'Failed';
             handleApiError(error, 'LiteratureUpload');
        } finally {
            confirmBtn.disabled = false; 
        }
     });
    modal.addEventListener('click', (e) => { if (e.target === modal) { hideModal('upload-modal'); resetUploadModal(); }});
}

function handleLiteratureSearch(event) {
    appState.literatureFilters.searchQuery = event.target.value.trim();
    loadLiteratureList(1);
}
function handleLiteratureFilterChange(event) {
    const value = event.target.value;
    if (value === 'all') { appState.literatureFilters.filterValue = null; }
    else if (value === 'with-pdf') { appState.literatureFilters.filterBy = 'pdf_status'; appState.literatureFilters.filterValue = 'exists'; }
    else if (value === 'without-pdf') { appState.literatureFilters.filterBy = 'pdf_status'; appState.literatureFilters.filterValue = 'missing'; }
    else { appState.literatureFilters.filterBy = 'pdf_status'; appState.literatureFilters.filterValue = null;} // Default to all if unknown filter value
    loadLiteratureList(1);
}
function handleLiteratureSortChange(event) {
    const [field, order] = event.target.value.split('_');
    appState.literatureFilters.sortBy = field; appState.literatureFilters.sortOrder = order;
    loadLiteratureList(1);
}

function updateUserDisplay(user) {
    document.querySelectorAll('#username-display').forEach(el => {
        if (el && user?.username) el.textContent = user.username;
    });
}
async function handleLogout() {
    try { await window.authApi.logout(); } catch (e) { console.warn('Logout API fail:', e); }
    finally { window.removeAuthToken(); window.location.href = 'index.html'; }
}

async function loadScreenshotsForLiterature(literatureId) {
    const listEl = document.getElementById('screenshots-list');
    const placeholder = document.getElementById('screenshots-placeholder');
    if (listEl) listEl.innerHTML = createLoadingComponent('Loading screenshots...');
    if (placeholder) placeholder.style.display = 'none';

    try {
        // Using mlApi alias for screenshotApi.getScreenshots
        const response = await window.mlApi.getScreenshots({ literatureId: literatureId, per_page: 1000 }); // Fetch all for selected article
        if (response.success && response.data?.items) {
            appState.currentScreenshots = response.data.items;
            displayScreenshots(appState.currentScreenshots);
        } else { throw response; }
    } catch (errorResponse) {
        console.error(`Error loading screenshots for lit ${literatureId}:`, errorResponse);
        const errorMsg = handleApiError(errorResponse, `LoadScreenshots ${literatureId}`);
        if (listEl) listEl.innerHTML = createErrorComponent(errorMsg, () => loadScreenshotsForLiterature(literatureId));
        if (placeholder) placeholder.style.display = 'none'; // Still hide placeholder on error, show error component
    }
}

function displayScreenshots(screenshots) {
     const container = document.getElementById('screenshots-list');
     const placeholder = document.getElementById('screenshots-placeholder');
     if (!container) return;
     container.innerHTML = ''; // Clear previous
     if (!screenshots || screenshots.length === 0) {
         if (placeholder) {
            placeholder.style.display = 'block';
            const pText = placeholder.querySelector('p:first-of-type');
            if (pText) pText.textContent = appState.currentLiterature ? "No screenshots for this article yet." : "No screenshots.";
         } else {
            container.innerHTML = createEmptyState('fa-camera', 'No Screenshots', 'No screenshots for this item or PDF viewer not active.');
         }
         return;
     }
     if (placeholder) placeholder.style.display = 'none';
     container.innerHTML = screenshots.map(ss => createScreenshotCard(ss)).join('');
}

if (!window.editLiteratureItem) {
    window.editLiteratureItem = async function(id) {
        console.log('Dashboard: Edit literature ID', id);
        const item = appState.literatureList.find(it => it.id === id);
        if (!item) {
            showToast(`Article ${id} not found for edit.`, 'error');
            return;
        }

        appState.editingLiteratureId = id;
        const editLitForm = document.getElementById('edit-literature-form');
        const pdfUploadFileInput = document.getElementById('edit-lit-pdf-upload-file');
        const pdfUploadStatusEl = document.getElementById('edit-lit-pdf-upload-status');

        document.getElementById('edit-literature-id').value = id;
        document.getElementById('edit-lit-title').value = item.title || '';
        const originalData = item.original_columns_data || {};
        document.getElementById('edit-lit-pdf-url').value = originalData.pdf_url || '';

        if (item.pdf_server_path) {
            pdfUploadStatusEl.textContent = 'Server PDF exists. Uploading new will replace it.';
        } else {
            pdfUploadStatusEl.textContent = 'No server PDF. Upload one or add external URL.';
        }
        pdfUploadStatusEl.classList.remove('text-red-500');
        pdfUploadFileInput.value = ''; 

        document.getElementById('edit-lit-authors').value = originalData.authors || ''; 
        document.getElementById('edit-lit-year').value = originalData.year || '';
        document.getElementById('edit-lit-doi').value = originalData.doi || '';
        document.getElementById('edit-lit-source').value = originalData.source || '';
        document.getElementById('edit-lit-status').value = originalData.status || '';
        document.getElementById('edit-lit-notes').value = originalData.notes || '';

        document.getElementById('save-literature-changes-btn').disabled = false;
        showModal('edit-literature-modal');
    };
}

async function handleSaveLiteratureChanges() {
    const form = document.getElementById('edit-literature-form');
    const pdfUploadFileInput = document.getElementById('edit-lit-pdf-upload-file');
    const pdfFile = pdfUploadFileInput.files[0]; 

    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const articleId = parseInt(document.getElementById('edit-literature-id').value);
    if (!articleId) {
        showToast('Error: Article ID missing.', 'error');
        return;
    }

    const title = document.getElementById('edit-lit-title').value.trim();
    if (!title) {
        showToast('Title is required.', 'error');
        document.getElementById('edit-lit-title').focus();
        return;
    }

    const payload = {
        title: title,
        pdf_url: document.getElementById('edit-lit-pdf-url').value.trim() || null,
        authors: document.getElementById('edit-lit-authors').value.trim() || null,
        year: document.getElementById('edit-lit-year').value.trim() ? parseInt(document.getElementById('edit-lit-year').value.trim()) : null,
        doi: document.getElementById('edit-lit-doi').value.trim() || null,
        source: document.getElementById('edit-lit-source').value.trim() || null,
        status: document.getElementById('edit-lit-status').value.trim() || null,
        notes: document.getElementById('edit-lit-notes').value.trim() || null,
    };
    
    try {
        const updatedArticle = await updateLiteratureItemApi(articleId, payload, pdfFile);
        if (updatedArticle) {
            hideModal('edit-literature-modal');
            resetLiteratureEditForm(form); 
        }
    } catch (errorResponse) {
        // Errors are handled and toasted by updateLiteratureItemApi/handleApiError
        // The finally block in updateLiteratureItemApi handles button state
        console.error("handleSaveLiteratureChanges caught error from updateLiteratureItemApi", errorResponse);
    }
}

if (!window.deleteLiteratureItem) {
    window.deleteLiteratureItem = async function(id) {
        console.log('Dashboard: Delete literature ID', id);
        const item = appState.literatureList.find(it => it.id === id);
        if (!item) { showToast(`Article ${id} not found for delete.`, 'error'); return; }

        if (confirm(`Are you sure you want to delete "${item.title}"? This will also delete its screenshot database records AND any uploaded PDF file.`)) {
            try {
                const response = await literatureApi.deleteArticle(id);
                if (response.success) {
                    showToast(`Article "${item.title}" deleted.`, 'success');
                    appState.literatureList = appState.literatureList.filter(lit => lit.id !== id);
                    if (appState.currentLiterature?.id === id) {
                        appState.currentLiterature = null;
                        showPdfPlaceholder(); 
                        displayScreenshots([]); 
                    }
                    displayLiteratureList(appState.literatureList); 
                    appState.literaturePagination.totalItems = Math.max(0, appState.literaturePagination.totalItems -1);
                    if(appState.literaturePagination.totalItems > 0 && appState.literaturePagination.currentPage > appState.literaturePagination.totalPages) {
                        loadLiteratureList(Math.max(1, appState.literaturePagination.totalPages));
                    } else {
                        renderLiteraturePagination();
                    }
                } else { throw response; }
            } catch (errorResponse) {
                handleApiError(errorResponse, `DeleteLiterature ${id}`);
            }
        }
    };
}

// Global exports for PDF viewer interaction (from pdf-viewer.js)
window.showPdfPlaceholder = window.showPdfPlaceholder || console.warn.bind(console, "pdf-viewer.js: showPdfPlaceholder not loaded");
window.disablePdfControls = window.disablePdfControls || console.warn.bind(console, "pdf-viewer.js: disablePdfControls not loaded");
window.enablePdfControls = window.enablePdfControls || console.warn.bind(console, "pdf-viewer.js: enablePdfControls not loaded");
window.loadPdfForViewing = window.loadPdfForViewing || console.warn.bind(console, "pdf-viewer.js: loadPdfForViewing not loaded");

// App specific globals
window.loadScreenshotsForLiterature = loadScreenshotsForLiterature;
window.appState = appState;
window.selectLiteratureItem = selectLiteratureItem;

document.addEventListener('DOMContentLoaded', initializeDashboard);
