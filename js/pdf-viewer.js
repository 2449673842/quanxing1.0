// PDF viewer and screenshot functionality
let pdfDoc = null; 
let currentPageNum = 1; 
let totalPageCount = 0; 
let currentZoomLevel = 1.0; 

let pdfCanvas = null; 
let pdfCtx = null; 

let isCaptureModeActive = false; 
let captureStartCoords = null; 
let isDraggingForCapture = false; 

// MODIFICATION: window.currentPageDimensions is globally accessible
window.currentPageDimensions = {
    viewportWidth: 0, 
    viewportHeight: 0, 
    originalWidth: 0, 
    originalHeight: 0 
};

function initializePdfViewer() {
    pdfCanvas = document.getElementById('pdf-canvas');
    if (!pdfCanvas) { console.error("PDF canvas element not found!"); return; }
    pdfCtx = pdfCanvas.getContext('2d');
    setupPdfControls();
    setupCaptureOverlayEvents();
    console.log("PDF Viewer initialized.");
}

function setupPdfControls() {
    document.getElementById('prev-page')?.addEventListener('click', () => changePage(-1));
    document.getElementById('next-page')?.addEventListener('click', () => changePage(1));
    const pageNumInput = document.getElementById('page-num-input');
    if (pageNumInput) {
        pageNumInput.addEventListener('change', (e) => {
            const newPage = parseInt(e.target.value);
            if (!isNaN(newPage) && newPage >= 1 && newPage <= totalPageCount) {
                currentPageNum = newPage; renderCurrentPage(); updatePdfPageControlsUI();
            } else { e.target.value = currentPageNum; }
        });
        pageNumInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') pageNumInput.blur(); });
    }
    document.getElementById('zoom-in')?.addEventListener('click', () => zoomPdf(1.2));
    document.getElementById('zoom-out')?.addEventListener('click', () => zoomPdf(1 / 1.2));
    document.getElementById('fullscreen-btn')?.addEventListener('click', togglePdfFullscreen);
    document.getElementById('capture-btn')?.addEventListener('click', () => toggleCaptureMode());

    document.addEventListener('keydown', (e) => {
        if (!pdfDoc) return;
        const targetIsInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
        if (targetIsInput && e.key !== 'Escape') return;
        let handled = false;
        if (e.key === 'ArrowLeft' && !targetIsInput) { changePage(-1); handled = true; }
        if (e.key === 'ArrowRight' && !targetIsInput) { changePage(1); handled = true; }
        if ((e.key === '+' || e.key === '=') && (e.ctrlKey || e.metaKey)) { zoomPdf(1.1); handled = true; }
        if (e.key === '-' && (e.ctrlKey || e.metaKey)) { zoomPdf(1 / 1.1); handled = true; }
        if (e.key === 'c' && (e.ctrlKey || e.metaKey) && !targetIsInput) { toggleCaptureMode(); handled = true; }
        if (e.key === 'Escape') {
            if (isCaptureModeActive) { toggleCaptureMode(false); handled = true; }
            if (document.fullscreenElement) { document.exitFullscreen(); handled = true; }
            if(targetIsInput) e.target.blur();
        }
        if (handled) e.preventDefault();
    });

    const canvasContainer = document.getElementById('pdf-canvas-container');
    if (canvasContainer) {
        canvasContainer.addEventListener('wheel', (e) => {
            if (!pdfDoc || !(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            zoomPdf(e.deltaY < 0 ? 1.1 : 1 / 1.1);
        }, { passive: false });
    }
}

function changePage(delta) {
    if (!pdfDoc) return;
    const newPage = currentPageNum + delta;
    if (newPage >= 1 && newPage <= totalPageCount) {
        currentPageNum = newPage; renderCurrentPage(); updatePdfPageControlsUI();
    }
}

function zoomPdf(factor) {
    if (!pdfDoc) return;
    const newZoom = Math.max(0.25, Math.min(currentZoomLevel * factor, 5.0));
    if (Math.abs(newZoom - currentZoomLevel) < 0.01) return;
    currentZoomLevel = newZoom; renderCurrentPage(); updatePdfZoomUI();
}

async function loadPdfForViewing(literatureItem) {
    if (!literatureItem || !literatureItem.original_columns_data?.pdf_url) {
        console.warn("No literature item or PDF URL for viewing.");
        window.showPdfPlaceholder('No PDF URL. Select literature with a PDF.');
        window.disablePdfControls();
        pdfDoc = null; totalPageCount = 0; currentPageNum = 1;
        updatePdfPageControlsUI(); updatePdfZoomUI();
        return;
    }
    const pdfUrl = literatureItem.original_columns_data.pdf_url;
    console.log("Loading PDF from URL:", pdfUrl);
    window.showToast("Loading PDF...", "info", 2000);

    try {
        const token = window.getAuthToken();
        const loadingTask = pdfjsLib.getDocument({ url: pdfUrl, httpHeaders: token ? { 'Authorization': `Bearer ${token}` } : {} });
        pdfDoc = await loadingTask.promise;
        totalPageCount = pdfDoc.numPages; currentPageNum = 1; currentZoomLevel = 1.0;
        
        document.getElementById('pdf-placeholder')?.classList.add('hidden');
        document.getElementById('pdf-viewer')?.classList.remove('hidden');
        window.enablePdfControls();
        await renderCurrentPage();
        updatePdfPageControlsUI(); updatePdfZoomUI();
        console.log(`PDF "${literatureItem.title}" loaded: ${totalPageCount} pages.`);
        window.showToast(`PDF "${literatureItem.title}" loaded.`, 'success');
    } catch (error) {
        console.error('Error loading PDF:', error);
        pdfDoc = null; totalPageCount = 0; currentPageNum = 1;
        const errorMsg = (error.message?.includes('Missing PDF')) ? 'PDF file not found.' : 'Failed to load PDF.';
        window.showPdfPlaceholder(errorMsg + ' Check console.');
        window.disablePdfControls();
        updatePdfPageControlsUI(); updatePdfZoomUI();
        window.showToast(errorMsg, 'error');
        if (error.status === 401 || error.message?.toLowerCase().includes('token')) {
             window.handleApiError(error, 'loadPdfForViewing');
        }
    }
}

async function renderCurrentPage() {
    if (!pdfDoc || !pdfCanvas || !pdfCtx) return;
    try {
        const page = await pdfDoc.getPage(currentPageNum);
        const viewportUnscaled = page.getViewport({ scale: 1.0 });
        const viewport = page.getViewport({ scale: currentZoomLevel });
        pdfCanvas.height = viewport.height; pdfCanvas.width = viewport.width;
        const canvasWrapper = document.getElementById('canvas-wrapper');
        if(canvasWrapper) {
            canvasWrapper.style.width = viewport.width + 'px';
            canvasWrapper.style.height = viewport.height + 'px';
        }
        await page.render({ canvasContext: pdfCtx, viewport: viewport }).promise;
        window.currentPageDimensions = {
            viewportWidth: viewport.width, viewportHeight: viewport.height,
            originalWidth: viewportUnscaled.width, originalHeight: viewportUnscaled.height
        };
    } catch (error) {
        console.error(`Error rendering page ${currentPageNum}:`, error);
        window.showToast(`Error rendering page ${currentPageNum}.`, 'error');
    }
}

function updatePdfPageControlsUI() {
    const pageInfo = document.getElementById('page-info');
    const pageNumInput = document.getElementById('page-num-input');
    if (pageInfo) pageInfo.textContent = `of ${totalPageCount || 0}`;
    if (pageNumInput) {
        pageNumInput.value = currentPageNum; pageNumInput.max = totalPageCount;
        pageNumInput.disabled = !pdfDoc;
    }
    document.getElementById('prev-page')?.setAttribute('disabled', (currentPageNum <= 1 || !pdfDoc));
    document.getElementById('next-page')?.setAttribute('disabled', (currentPageNum >= totalPageCount || !pdfDoc));
}

function updatePdfZoomUI() {
    const zoomDisplay = document.getElementById('zoom-level');
    if (zoomDisplay) zoomDisplay.textContent = `${Math.round(currentZoomLevel * 100)}%`;
    document.getElementById('zoom-in')?.setAttribute('disabled', !pdfDoc);
    document.getElementById('zoom-out')?.setAttribute('disabled', !pdfDoc);
}

function togglePdfFullscreen() {
    const container = document.getElementById('pdf-viewer');
    if (!container) return;
    if (!document.fullscreenElement) {
        container.requestFullscreen().catch(err => {
            window.showToast('Failed to enter fullscreen.', 'error'); console.error('Fullscreen error:', err);
        });
    } else {
        document.exitFullscreen().catch(err => {
             window.showToast('Failed to exit fullscreen.', 'error'); console.error('Exit fullscreen error:', err);
        });
    }
}

function setupCaptureOverlayEvents() {
    const overlay = document.getElementById('capture-overlay');
    const rectangle = document.getElementById('capture-rectangle');
    const canvasContainer = document.getElementById('pdf-canvas-container');
    if (!overlay || !rectangle || !canvasContainer) { console.error("Capture elements missing!"); return; }

    overlay.addEventListener('mousedown', (e) => {
        if (!isCaptureModeActive || e.button !== 0) return; e.preventDefault();
        isDraggingForCapture = true;
        const containerRect = canvasContainer.getBoundingClientRect();
        const scrollLeft = canvasContainer.scrollLeft; const scrollTop = canvasContainer.scrollTop;
        captureStartCoords = { x: e.clientX - containerRect.left + scrollLeft, y: e.clientY - containerRect.top + scrollTop };
        const canvasWrapper = document.getElementById('canvas-wrapper'); if (!canvasWrapper) return;
        const canvasWrapperRect = canvasWrapper.getBoundingClientRect();
        const rectX = captureStartCoords.x - (canvasWrapperRect.left - containerRect.left + scrollLeft);
        const rectY = captureStartCoords.y - (canvasWrapperRect.top - containerRect.top + scrollTop);
        rectangle.style.left = rectX + 'px'; rectangle.style.top = rectY + 'px';
        rectangle.style.width = '0px'; rectangle.style.height = '0px';
        rectangle.classList.remove('hidden');
    });
    overlay.addEventListener('mousemove', (e) => {
        if (!isDraggingForCapture || !isCaptureModeActive) return; e.preventDefault();
        const containerRect = canvasContainer.getBoundingClientRect();
        const scrollLeft = canvasContainer.scrollLeft; const scrollTop = canvasContainer.scrollTop;
        const currentX = e.clientX - containerRect.left + scrollLeft;
        const currentY = e.clientY - containerRect.top + scrollTop;
        const canvasWrapper = document.getElementById('canvas-wrapper'); if (!canvasWrapper) return;
        const canvasWrapperRect = canvasWrapper.getBoundingClientRect();
        const newX_container = Math.min(captureStartCoords.x, currentX);
        const newY_container = Math.min(captureStartCoords.y, currentY);
        const width = Math.abs(currentX - captureStartCoords.x);
        const height = Math.abs(currentY - captureStartCoords.y);
        const rectX = newX_container - (canvasWrapperRect.left - containerRect.left + scrollLeft);
        const rectY = newY_container - (canvasWrapperRect.top - containerRect.top + scrollTop);
        rectangle.style.left = rectX + 'px'; rectangle.style.top = rectY + 'px';
        rectangle.style.width = width + 'px'; rectangle.style.height = height + 'px';
    });
    overlay.addEventListener('mouseup', (e) => {
        if (!isDraggingForCapture || !isCaptureModeActive || e.button !== 0) return; e.preventDefault();
        isDraggingForCapture = false;
        const captureArea = { x: parseFloat(rectangle.style.left), y: parseFloat(rectangle.style.top), width: parseFloat(rectangle.style.width), height: parseFloat(rectangle.style.height) };
        rectangle.classList.add('hidden');
        if (captureArea.width > 10 && captureArea.height > 10) {
            captureAndSaveScreenshot(captureArea);
        } else { window.showToast("Capture area too small.", 'warning'); toggleCaptureMode(false); }
    });
    overlay.addEventListener('mouseleave', () => {
        if (isDraggingForCapture) {
            isDraggingForCapture = false; rectangle.classList.add('hidden'); toggleCaptureMode(false);
            window.showToast("Capture cancelled: mouse left area.", "info");
        }
    });
}

function toggleCaptureMode(explicitState = null) {
    isCaptureModeActive = pdfDoc ? (explicitState !== null ? explicitState : !isCaptureModeActive) : false;
    const overlay = document.getElementById('capture-overlay');
    const captureBtn = document.getElementById('capture-btn');
    const canvasWrapper = document.getElementById('canvas-wrapper');
    if (overlay && canvasWrapper) {
        overlay.style.width = canvasWrapper.offsetWidth + 'px'; overlay.style.height = canvasWrapper.offsetHeight + 'px';
        overlay.style.left = canvasWrapper.offsetLeft + 'px'; overlay.style.top = canvasWrapper.offsetTop + 'px';
        overlay.classList.toggle('hidden', !isCaptureModeActive);
        if (isCaptureModeActive) window.showToast("Capture mode: Drag to select area.", 'info');
    }
    if (captureBtn) {
        captureBtn.innerHTML = isCaptureModeActive ? '<i class="fas fa-times mr-1"></i>Cancel' : '<i class="fas fa-camera mr-1"></i>Capture';
        captureBtn.classList.toggle('bg-red-500', isCaptureModeActive);
        captureBtn.classList.toggle('hover:bg-red-600', isCaptureModeActive);
        captureBtn.classList.toggle('btn-accent', !isCaptureModeActive);
    }
    if (!isCaptureModeActive) { document.getElementById('capture-rectangle')?.classList.add('hidden'); isDraggingForCapture = false; captureStartCoords = null; }
}

// MODIFICATION: captureAndSaveScreenshot interacts with new DB-aware save API
async function captureAndSaveScreenshot(area) {
    // window.appState is from app.js
    if (!pdfCanvas || !pdfDoc || !window.appState?.currentLiterature) {
        window.showToast('Cannot capture: PDF/literature not ready.', 'error');
        toggleCaptureMode(false); return;
    }
    window.showToast("Processing screenshot...", 'info', 2000);
    try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = area.width; tempCanvas.height = area.height;
        tempCanvas.getContext('2d').drawImage(pdfCanvas, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
        const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error("Failed to create image blob.");

        // MODIFICATION: Ensure all metadata fields are correctly passed
        const screenshotData = {
            imageFile: blob,
            filename: `screenshot_article_${window.appState.currentLiterature.id}_page_${currentPageNum}.png`, // Optional filename for FormData
            literature_article_id: window.appState.currentLiterature.id,
            page_number: currentPageNum,
            capture_scale: currentZoomLevel,
            original_page_dimensions: window.currentPageDimensions // From global state updated in renderCurrentPage
            // Initial chart_type, description, wpd_data are handled by edit modal post-save
        };
        // screenshotApi is from api.js
        const response = await window.screenshotApi.save(screenshotData);
        if (response.success && response.data?.screenshot_id) {
            window.showToast('Screenshot captured and saved!', 'success');
            if (window.loadScreenshotsForLiterature && window.appState.currentLiterature) {
                await window.loadScreenshotsForLiterature(window.appSMRK.currentLiterature.id);
            }
            setTimeout(() => { // Open edit modal for the new screenshot
                if (window.editScreenshot) window.editScreenshot(response.data.screenshot_id);
                else console.warn("editScreenshot function not available to open modal.");
            }, 500);
        } else { throw response; }
    } catch (errorResponse) {
        console.error('Error capturing/saving screenshot:', errorResponse);
        window.handleApiError(errorResponse, 'CaptureScreenshot'); // Show toast via handleApiError
    } finally {
        toggleCaptureMode(false);
        // tempCanvas is not added to DOM, so no removal needed.
    }
}

window.initializePdfViewer = initializePdfViewer;
window.loadPdfForViewing = loadPdfForViewing;
window.updatePdfPageControlsUI = updatePdfPageControlsUI; // For app.js
window.updatePdfZoomUI = updatePdfZoomUI; // For app.js
window.toggleCaptureMode = toggleCaptureMode; // Potentially for external control



