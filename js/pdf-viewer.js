// js/pdf-viewer.js: Handles PDF rendering using PDF.js library, navigation (page, zoom),
// fullscreen mode, and screenshot capture functionality.
// Depends on: PDF.js library (assumed globally available as pdfjsLib),
// js/api.js (for window.screenshotApi, window.getAuthToken),
// js/app.js (for window.appState, window.showPdfPlaceholder, window.disablePdfControls,
// window.enablePdfControls, window.editScreenshot, window.loadScreenshotsForLiterature),
// js/components.js (for window.showToast).

// --- Module-level state variables for PDF viewer ---
let pdfDoc = null;          // Stores the loaded PDF document object from PDF.js.
let currentPageNum = 1;     // Current page number being viewed.
let totalPageCount = 0;     // Total pages in the loaded PDF.
let currentZoomLevel = 1.0; // Current zoom level of the PDF.

let pdfCanvas = null;       // The HTML canvas element for rendering PDF pages.
let pdfCtx = null;          // The 2D rendering context of the canvas.

// State for screenshot capture mode.
let isCaptureModeActive = false;  // True if capture mode is active.
let captureStartCoords = null;    // {x, y} coordinates where capture drag started.
let isDraggingForCapture = false; // True if user is currently dragging to select capture area.

/**
 * @global
 * Stores dimensions of the currently rendered PDF page.
 * Updated by `renderCurrentPage` and used by `captureAndSaveScreenshot` for metadata.
 * - viewportWidth/Height: Dimensions of the page as currently rendered on canvas (respects zoom).
 * - originalWidth/Height: Natural dimensions of the PDF page at 100% zoom.
 */
window.currentPageDimensions = {
    viewportWidth: 0, 
    viewportHeight: 0, 
    originalWidth: 0, 
    originalHeight: 0 
};

/**
 * Initializes the PDF viewer components and event listeners.
 * Called from app.js during dashboard initialization.
 * @global
 */
function initializePdfViewer() {
    pdfCanvas = document.getElementById('pdf-canvas');
    if (!pdfCanvas) { console.error("PDF canvas element not found!"); return; }
    pdfCtx = pdfCanvas.getContext('2d');
    
    setupPdfControls();          // Sets up listeners for PDF navigation buttons (zoom, page change etc.).
    setupCaptureOverlayEvents(); // Sets up listeners for the screenshot capture overlay.
    console.log("PDF Viewer initialized.");
}

/**
 * Sets up event listeners for PDF control buttons (pagination, zoom, fullscreen, capture)
 * and keyboard shortcuts for navigation.
 */
function setupPdfControls() {
    // PDF navigation buttons
    document.getElementById('prev-page')?.addEventListener('click', () => changePage(-1));
    document.getElementById('next-page')?.addEventListener('click', () => changePage(1));
    const pageNumInput = document.getElementById('page-num-input');
    if (pageNumInput) {
        // Allow direct page number input.
        pageNumInput.addEventListener('change', (e) => {
            const newPage = parseInt(e.target.value);
            if (!isNaN(newPage) && newPage >= 1 && newPage <= totalPageCount) {
                currentPageNum = newPage; 
                renderCurrentPage(); 
                updatePdfPageControlsUI();
            } else { // Reset to current page if input is invalid.
                e.target.value = currentPageNum; 
            }
        });
        // Allow submitting page number with Enter key.
        pageNumInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') pageNumInput.blur(); });
    }
    document.getElementById('zoom-in')?.addEventListener('click', () => zoomPdf(1.2));
    document.getElementById('zoom-out')?.addEventListener('click', () => zoomPdf(1 / 1.2));
    document.getElementById('fullscreen-btn')?.addEventListener('click', togglePdfFullscreen);
    document.getElementById('capture-btn')?.addEventListener('click', () => toggleCaptureMode());

    // Keyboard shortcuts for PDF navigation and actions.
    document.addEventListener('keydown', (e) => {
        if (!pdfDoc) return; // Only active if a PDF is loaded.
        // Ignore shortcuts if typing in an input field, except for Escape key.
        const targetIsInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
        if (targetIsInput && e.key !== 'Escape') return;

        let handled = false; // Flag to prevent default browser actions if shortcut is handled.
        if (e.key === 'ArrowLeft' && !targetIsInput) { changePage(-1); handled = true; }
        if (e.key === 'ArrowRight' && !targetIsInput) { changePage(1); handled = true; }
        if ((e.key === '+' || e.key === '=') && (e.ctrlKey || e.metaKey)) { zoomPdf(1.1); handled = true; } // Ctrl/Cmd + '+' or '=' for zoom in.
        if (e.key === '-' && (e.ctrlKey || e.metaKey)) { zoomPdf(1 / 1.1); handled = true; } // Ctrl/Cmd + '-' for zoom out.
        if (e.key === 'c' && (e.ctrlKey || e.metaKey) && !targetIsInput) { toggleCaptureMode(); handled = true; } // Ctrl/Cmd + 'c' for capture.
        
        if (e.key === 'Escape') { // Escape key handling.
            if (isCaptureModeActive) { toggleCaptureMode(false); handled = true; } // Exit capture mode.
            if (document.fullscreenElement) { document.exitFullscreen(); handled = true; } // Exit fullscreen.
            if(targetIsInput) e.target.blur(); // Blur input field.
        }
        if (handled) e.preventDefault(); // Prevent default browser behavior for handled shortcuts.
    });

    // Ctrl/Cmd + Mouse Wheel zoom functionality.
    const canvasContainer = document.getElementById('pdf-canvas-container');
    if (canvasContainer) {
        canvasContainer.addEventListener('wheel', (e) => {
            if (!pdfDoc || !(e.ctrlKey || e.metaKey)) return; // Only zoom if Ctrl/Cmd key is pressed.
            e.preventDefault(); // Prevent page scroll.
            zoomPdf(e.deltaY < 0 ? 1.1 : 1 / 1.1); // Zoom in for wheel up, out for wheel down.
        }, { passive: false }); // `passive: false` is necessary for `preventDefault`.
    }
}

/** Changes the current PDF page by a given delta (e.g., +1 for next, -1 for prev). */
function changePage(delta) {
    if (!pdfDoc) return;
    const newPage = currentPageNum + delta;
    if (newPage >= 1 && newPage <= totalPageCount) { // Check bounds.
        currentPageNum = newPage;
        renderCurrentPage();
        updatePdfPageControlsUI();
    }
}

/** Zooms the PDF view by a given factor. Clamps zoom level between min/max values. */
function zoomPdf(factor) {
    if (!pdfDoc) return;
    const newZoom = Math.max(0.25, Math.min(currentZoomLevel * factor, 5.0)); // Zoom limits: 25% - 500%.
    if (Math.abs(newZoom - currentZoomLevel) < 0.01) return; // Avoid re-rendering if zoom change is negligible.
    currentZoomLevel = newZoom;
    renderCurrentPage();
    updatePdfZoomUI();
}

/**
 * Loads a PDF document for viewing.
 * Called from app.js when a literature item is selected.
 * @global
 * @param {object} literatureItem - The literature item object, expected to have `original_columns_data.pdf_url`.
 */
async function loadPdfForViewing(literatureItem) {
    // Check if a valid PDF URL is provided.
    // `literatureItem.original_columns_data.pdf_url` is where the PDF link is stored from CSV/database.
    if (!literatureItem || !literatureItem.original_columns_data?.pdf_url) {
        console.warn("No literature item or PDF URL for viewing.");
        // window.showPdfPlaceholder and window.disablePdfControls are from app.js or components.js.
        window.showPdfPlaceholder('No PDF URL. Select literature with a PDF.');
        window.disablePdfControls();
        pdfDoc = null; totalPageCount = 0; currentPageNum = 1; // Reset PDF state.
        updatePdfPageControlsUI(); updatePdfZoomUI(); // Update UI elements.
        return;
    }
    const pdfUrl = literatureItem.original_columns_data.pdf_url;
    console.log("Loading PDF from URL:", pdfUrl);
    window.showToast("Loading PDF...", "info", 2000); // Toast from components.js.

    try {
        const token = window.getAuthToken(); // For authenticated PDF requests, if needed by server.
        // Use PDF.js library to load the document.
        const loadingTask = pdfjsLib.getDocument({ url: pdfUrl, httpHeaders: token ? { 'Authorization': `Bearer ${token}` } : {} });
        pdfDoc = await loadingTask.promise; // `pdfDoc` is the main PDF object.
        
        // Update PDF state and UI.
        totalPageCount = pdfDoc.numPages; 
        currentPageNum = 1; 
        currentZoomLevel = 1.0;
        
        document.getElementById('pdf-placeholder')?.classList.add('hidden');
        document.getElementById('pdf-viewer')?.classList.remove('hidden');
        window.enablePdfControls(); // From app.js or components.js.
        await renderCurrentPage();
        updatePdfPageControlsUI(); 
        updatePdfZoomUI();
        console.log(`PDF "${literatureItem.title}" loaded: ${totalPageCount} pages.`);
        window.showToast(`PDF "${literatureItem.title}" loaded.`, 'success');
    } catch (error) {
        console.error('Error loading PDF:', error);
        pdfDoc = null; totalPageCount = 0; currentPageNum = 1; // Reset PDF state on error.
        const errorMsg = (error.message?.includes('Missing PDF')) ? 'PDF file not found.' : 'Failed to load PDF.';
        window.showPdfPlaceholder(errorMsg + ' Check console.');
        window.disablePdfControls();
        updatePdfPageControlsUI(); updatePdfZoomUI();
        window.showToast(errorMsg, 'error');
        // If error indicates an auth issue, use global API error handler.
        if (error.status === 401 || error.message?.toLowerCase().includes('token')) {
             window.handleApiError(error, 'loadPdfForViewing'); // handleApiError from api.js.
        }
    }
}

/** Renders the current page of the loaded PDF onto the canvas. */
async function renderCurrentPage() {
    if (!pdfDoc || !pdfCanvas || !pdfCtx) return; // Ensure PDF is loaded and canvas is ready.
    try {
        const page = await pdfDoc.getPage(currentPageNum);
        // Get viewport at 100% scale to store original dimensions.
        const viewportUnscaled = page.getViewport({ scale: 1.0 });
        // Get viewport at current zoom level for rendering.
        const viewport = page.getViewport({ scale: currentZoomLevel });
        
        pdfCanvas.height = viewport.height; 
        pdfCanvas.width = viewport.width;
        
        // Adjust canvas wrapper size to match canvas, helps with layout and scrolling.
        const canvasWrapper = document.getElementById('canvas-wrapper');
        if(canvasWrapper) {
            canvasWrapper.style.width = viewport.width + 'px';
            canvasWrapper.style.height = viewport.height + 'px';
        }
        
        await page.render({ canvasContext: pdfCtx, viewport: viewport }).promise;
        
        // Update global state with current page dimensions (used for screenshot metadata).
        window.currentPageDimensions = {
            viewportWidth: viewport.width, viewportHeight: viewport.height,
            originalWidth: viewportUnscaled.width, originalHeight: viewportUnscaled.height
        };
    } catch (error) {
        console.error(`Error rendering page ${currentPageNum}:`, error);
        window.showToast(`Error rendering page ${currentPageNum}.`, 'error');
    }
}

/** Updates UI elements related to PDF page navigation (current page, total pages, button states). */
function updatePdfPageControlsUI() {
    const pageInfo = document.getElementById('page-info');
    const pageNumInput = document.getElementById('page-num-input');
    if (pageInfo) pageInfo.textContent = `of ${totalPageCount || 0}`;
    if (pageNumInput) {
        pageNumInput.value = currentPageNum; 
        pageNumInput.max = totalPageCount;
        pageNumInput.disabled = !pdfDoc; // Disable if no PDF loaded.
    }
    document.getElementById('prev-page')?.setAttribute('disabled', String(currentPageNum <= 1 || !pdfDoc));
    document.getElementById('next-page')?.setAttribute('disabled', String(currentPageNum >= totalPageCount || !pdfDoc));
}

/** Updates UI elements related to PDF zoom (zoom level display, button states). */
function updatePdfZoomUI() {
    const zoomDisplay = document.getElementById('zoom-level');
    if (zoomDisplay) zoomDisplay.textContent = `${Math.round(currentZoomLevel * 100)}%`;
    document.getElementById('zoom-in')?.setAttribute('disabled', String(!pdfDoc));
    document.getElementById('zoom-out')?.setAttribute('disabled', String(!pdfDoc));
}

/** Toggles fullscreen mode for the PDF viewer container. */
function togglePdfFullscreen() {
    const container = document.getElementById('pdf-viewer'); // The main PDF viewer container.
    if (!container) return;
    if (!document.fullscreenElement) { // If not currently in fullscreen.
        container.requestFullscreen().catch(err => {
            window.showToast('Failed to enter fullscreen.', 'error'); 
            console.error('Fullscreen error:', err);
        });
    } else { // If in fullscreen, exit.
        document.exitFullscreen().catch(err => {
             window.showToast('Failed to exit fullscreen.', 'error'); 
             console.error('Exit fullscreen error:', err);
        });
    }
}

// --- Screenshot Capture Logic ---

/** Sets up event listeners for the screenshot capture overlay and selection rectangle. */
function setupCaptureOverlayEvents() {
    const overlay = document.getElementById('capture-overlay');        // Transparent overlay for drawing selection.
    const rectangle = document.getElementById('capture-rectangle');    // Visual feedback for selection area.
    const canvasContainer = document.getElementById('pdf-canvas-container'); // Parent of canvas, for coordinate calculations.
    
    if (!overlay || !rectangle || !canvasContainer) { 
        console.error("Capture elements missing! Cannot setup overlay events."); 
        return; 
    }

    // Mouse down: Starts the capture selection process.
    overlay.addEventListener('mousedown', (e) => {
        if (!isCaptureModeActive || e.button !== 0) return; // Only active in capture mode, left-click only.
        e.preventDefault();
        isDraggingForCapture = true;
        
        // Calculate starting coordinates relative to the scrollable canvasContainer.
        const containerRect = canvasContainer.getBoundingClientRect();
        const scrollLeft = canvasContainer.scrollLeft; 
        const scrollTop = canvasContainer.scrollTop;
        captureStartCoords = { 
            x: e.clientX - containerRect.left + scrollLeft, 
            y: e.clientY - containerRect.top + scrollTop 
        };
        
        // Position the selection rectangle relative to its direct parent (canvas-wrapper).
        const canvasWrapper = document.getElementById('canvas-wrapper'); 
        if (!canvasWrapper) return;
        const canvasWrapperRect = canvasWrapper.getBoundingClientRect();
        // Adjust coordinates to be relative to the canvas-wrapper.
        const rectX = captureStartCoords.x - (canvasWrapperRect.left - containerRect.left + scrollLeft);
        const rectY = captureStartCoords.y - (canvasWrapperRect.top - containerRect.top + scrollTop);
        
        rectangle.style.left = rectX + 'px'; 
        rectangle.style.top = rectY + 'px';
        rectangle.style.width = '0px'; 
        rectangle.style.height = '0px';
        rectangle.classList.remove('hidden'); // Show selection rectangle.
    });

    // Mouse move: Adjusts the selection rectangle size while dragging.
    overlay.addEventListener('mousemove', (e) => {
        if (!isDraggingForCapture || !isCaptureModeActive) return;
        e.preventDefault();
        
        const containerRect = canvasContainer.getBoundingClientRect();
        const scrollLeft = canvasContainer.scrollLeft; 
        const scrollTop = canvasContainer.scrollTop;
        const currentX = e.clientX - containerRect.left + scrollLeft;
        const currentY = e.clientY - containerRect.top + scrollTop;
        
        const canvasWrapper = document.getElementById('canvas-wrapper'); 
        if (!canvasWrapper) return;
        const canvasWrapperRect = canvasWrapper.getBoundingClientRect();

        // Calculate top-left corner and dimensions of the rectangle.
        const newX_container = Math.min(captureStartCoords.x, currentX); // Top-left X relative to container.
        const newY_container = Math.min(captureStartCoords.y, currentY); // Top-left Y relative to container.
        const width = Math.abs(currentX - captureStartCoords.x);
        const height = Math.abs(currentY - captureStartCoords.y);

        // Adjust coordinates to be relative to the canvas-wrapper for styling.
        const rectX = newX_container - (canvasWrapperRect.left - containerRect.left + scrollLeft);
        const rectY = newY_container - (canvasWrapperRect.top - containerRect.top + scrollTop);
        
        rectangle.style.left = rectX + 'px'; 
        rectangle.style.top = rectY + 'px';
        rectangle.style.width = width + 'px'; 
        rectangle.style.height = height + 'px';
    });

    // Mouse up: Finalizes the capture selection.
    overlay.addEventListener('mouseup', (e) => {
        if (!isDraggingForCapture || !isCaptureModeActive || e.button !== 0) return;
        e.preventDefault();
        isDraggingForCapture = false;
        // Get final dimensions of the selection rectangle.
        const captureArea = { 
            x: parseFloat(rectangle.style.left), 
            y: parseFloat(rectangle.style.top), 
            width: parseFloat(rectangle.style.width), 
            height: parseFloat(rectangle.style.height) 
        };
        rectangle.classList.add('hidden'); // Hide selection rectangle.
        
        // Only proceed if selection is reasonably sized.
        if (captureArea.width > 10 && captureArea.height > 10) {
            captureAndSaveScreenshot(captureArea);
        } else { 
            window.showToast("Capture area too small.", 'warning'); 
            toggleCaptureMode(false); // Exit capture mode.
        }
    });

    // Mouse leave: Cancels capture if dragging and mouse leaves overlay.
    overlay.addEventListener('mouseleave', () => {
        if (isDraggingForCapture) {
            isDraggingForCapture = false; 
            rectangle.classList.add('hidden'); 
            toggleCaptureMode(false); // Exit capture mode.
            window.showToast("Capture cancelled: mouse left area.", "info");
        }
    });
}

/**
 * Toggles screenshot capture mode.
 * @param {boolean|null} [explicitState=null] - Optionally set state directly (true for on, false for off).
 * @global Used by app.js to ensure capture mode is off when PDF controls are disabled.
 */
function toggleCaptureMode(explicitState = null) {
    // Determine new state: toggle if explicitState is null, otherwise use explicitState.
    // Capture mode can only be active if a PDF is loaded.
    isCaptureModeActive = pdfDoc ? (explicitState !== null ? explicitState : !isCaptureModeActive) : false;
    
    const overlay = document.getElementById('capture-overlay');
    const captureBtn = document.getElementById('capture-btn');
    const canvasWrapper = document.getElementById('canvas-wrapper'); // Used to size the overlay.

    if (overlay && canvasWrapper) {
        // Size and position the overlay to match the canvas wrapper.
        overlay.style.width = canvasWrapper.offsetWidth + 'px'; 
        overlay.style.height = canvasWrapper.offsetHeight + 'px';
        overlay.style.left = canvasWrapper.offsetLeft + 'px'; 
        overlay.style.top = canvasWrapper.offsetTop + 'px';
        overlay.classList.toggle('hidden', !isCaptureModeActive); // Show/hide overlay.
        if (isCaptureModeActive) window.showToast("Capture mode: Drag to select area.", 'info');
    }
    
    // Update capture button text and styling.
    if (captureBtn) {
        captureBtn.innerHTML = isCaptureModeActive ? '<i class="fas fa-times mr-1"></i>Cancel' : '<i class="fas fa-camera mr-1"></i>Capture';
        captureBtn.classList.toggle('bg-red-500', isCaptureModeActive);       // Red when active.
        captureBtn.classList.toggle('hover:bg-red-600', isCaptureModeActive);
        captureBtn.classList.toggle('btn-accent', !isCaptureModeActive);    // Accent color when inactive.
    }
    
    // If exiting capture mode, hide rectangle and reset dragging state.
    if (!isCaptureModeActive) { 
        document.getElementById('capture-rectangle')?.classList.add('hidden'); 
        isDraggingForCapture = false; 
        captureStartCoords = null; 
    }
}

/**
 * Captures the selected area of the PDF canvas as an image, saves it via API,
 * and then optionally opens the edit modal for the new screenshot.
 * Interacts with new DB-aware save API via `window.screenshotApi.save`.
 * @param {object} area - The {x, y, width, height} of the capture area relative to the canvas.
 */
async function captureAndSaveScreenshot(area) {
    // window.appState.currentLiterature is from app.js, needed for associating screenshot with article.
    if (!pdfCanvas || !pdfDoc || !window.appState?.currentLiterature) {
        window.showToast('Cannot capture: PDF/literature not ready.', 'error');
        toggleCaptureMode(false); // Exit capture mode.
        return;
    }
    window.showToast("Processing screenshot...", 'info', 2000);
    try {
        // Create a temporary canvas to draw the captured portion.
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = area.width; 
        tempCanvas.height = area.height;
        // Draw the selected area from the main PDF canvas to the temporary canvas.
        tempCanvas.getContext('2d').drawImage(pdfCanvas, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
        
        // Convert temporary canvas content to a PNG image Blob.
        const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error("Failed to create image blob.");

        // Prepare screenshot data for API, including metadata.
        // All these fields are expected by the backend `ScreenshotMetadata` model.
        const screenshotData = {
            imageFile: blob, // The image data.
            filename: `screenshot_article_${window.appState.currentLiterature.id}_page_${currentPageNum}.png`, // Suggested filename for FormData.
            literature_article_id: window.appState.currentLiterature.id, // Link to parent article.
            page_number: currentPageNum,       // Page number in PDF.
            capture_scale: currentZoomLevel,   // Zoom level at time of capture.
            original_page_dimensions: window.currentPageDimensions // Original page size (global state updated in renderCurrentPage).
            // Initial chart_type, description, wpd_data are typically null/empty and set via the edit modal post-save.
        };
        
        // API call to save the screenshot (window.screenshotApi from api.js).
        const response = await window.screenshotApi.save(screenshotData);
        if (response.success && response.data?.screenshot_id) {
            window.showToast('Screenshot captured and saved!', 'success');
            // Refresh screenshot list for the current article (window.loadScreenshotsForLiterature from app.js).
            if (window.loadScreenshotsForLiterature && window.appState.currentLiterature) {
                await window.loadScreenshotsForLiterature(window.appState.currentLiterature.id);
            }
            // Automatically open the edit modal for the newly created screenshot.
            // window.editScreenshot is from app.js.
            setTimeout(() => { 
                if (window.editScreenshot) window.editScreenshot(response.data.screenshot_id);
                else console.warn("editScreenshot function not available to open modal.");
            }, 500); // Short delay to allow UI updates.
        } else { 
            throw response; // Propagate API error.
        }
    } catch (errorResponse) {
        console.error('Error capturing/saving screenshot:', errorResponse);
        window.handleApiError(errorResponse, 'CaptureScreenshot'); // Show toast via global error handler.
    } finally {
        toggleCaptureMode(false); // Always exit capture mode.
        // tempCanvas is created in memory and not added to DOM, so no explicit removal needed; it will be garbage collected.
    }
}

// --- Global Exports ---
// Expose functions to be used by other scripts (mainly app.js).

/** @global */
window.initializePdfViewer = initializePdfViewer;
/** @global */
window.loadPdfForViewing = loadPdfForViewing;
/** @global (used by app.js to update UI when PDF viewer is not primary controller) */
window.updatePdfPageControlsUI = updatePdfPageControlsUI; 
/** @global (used by app.js) */
window.updatePdfZoomUI = updatePdfZoomUI; 
/** @global (used by app.js) */
window.toggleCaptureMode = toggleCaptureMode;



