// js/api.js: Handles all client-server communication.
// Defines a generic API call function and specific API interaction objects (literatureApi, screenshotApi, etc.).
// Depends on: js/auth.js (for getAuthToken).

// TODO: In a production environment, this URL should be configured dynamically
// (e.g., via a global config object injected by the server or build process)
// For development, it's set to the local Flask server.
const API_BASE_URL = 'http://localhost:5000/api';

/**
 * Generic function to make API calls.
 * Handles request setup, authorization, response parsing, and error handling.
 * @param {string} endpoint - The API endpoint (e.g., '/literature/').
 * @param {object} options - Fetch API options (method, body, headers, params).
 * @returns {Promise<object>} - An object with { success: boolean, data: any, status: number, error?: string }.
 */
async function apiCall(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = getAuthToken(); // from auth.js; Used for authenticated requests.

    const headers = {
        // 'Content-Type' will be set based on body type or removed for FormData
        ...options.headers
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        method: options.method || 'GET',
        headers,
        ...options
    };

    if (options.body instanceof FormData) {
        delete config.headers['Content-Type']; 
    } else if (options.body && typeof options.body === 'object' && !(options.body instanceof Blob) && !(options.body instanceof ArrayBuffer) && !(options.body instanceof URLSearchParams)) {
        config.headers['Content-Type'] = config.headers['Content-Type'] || 'application/json';
        if(config.headers['Content-Type'] === 'application/json' && typeof options.body !== 'string') {
            config.body = JSON.stringify(options.body);
        }
    }

    let finalUrl = url;
    if (options.params) {
        const params = new URLSearchParams(Object.fromEntries(Object.entries(options.params).filter(([_, v]) => v !== undefined)));
        finalUrl += (finalUrl.includes('?') ? '&' : '?') + params.toString();
    }
    
    try {
        const response = await fetch(finalUrl, config);
        const contentType = response.headers.get('content-type');
        let data;

        // Early exit for non-ok responses to handle errors before attempting to parse body as success.
        if (!response.ok) {
            let errorData = null;
            let errorMsg = `HTTP Error ${response.status}: ${response.statusText}`; // Default error message.

            // Attempt to parse error response based on content type for more specific messages.
            try {
                if (contentType && contentType.includes('application/json')) {
                    // If error response is JSON, parse it for a structured error message.
                    errorData = await response.json();
                    // Extract error message from common error fields in JSON response.
                    if (typeof errorData === 'object' && errorData !== null && (errorData.error || errorData.message || errorData.msg)) {
                        errorMsg = errorData.error || errorData.message || errorData.msg;
                    } else if (typeof errorData === 'string' && errorData.length < 200) { // Or if the JSON error is a short string.
                        errorMsg = errorData; 
                    }
                } else if (contentType && contentType.includes('text/')) {
                    // If error response is text (e.g., HTML error page), capture it.
                    const textError = await response.text();
                    errorData = textError; 
                    if (textError.length < 200) { // Use short text errors as the primary message.
                        errorMsg = textError;
                    } else if (response.statusText) { // Otherwise, prefer the HTTP status text if available.
                        errorMsg = response.statusText;
                    }
                    // If textError is long (like an HTML page), it's stored in errorData but not used as the primary errorMsg.
                }
                // If not JSON or text, errorData remains null, and errorMsg is the default HTTP status error.
            } catch (e) {
                // Catch errors during parsing of the error response body (e.g., malformed JSON).
                console.warn(`API call: Error parsing error response for ${endpoint} (Status: ${response.status}):`, e);
                // errorMsg already has a default value (HTTP statusText).
                // errorData might be partially parsed or what response.text() returned before erroring.
            }
            
            const errorDetails = { success: false, error: errorMsg, data: errorData, status: response.status };
            console.error(`API call failed: ${endpoint}`, errorDetails);
            throw errorDetails; // Throw to be caught by the outer catch block.
        }

        // Process successful response (response.ok is true).
        // Determine response data type based on Content-Type header.
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else if (contentType && contentType.includes('image/')) { // Specific handling for image blobs.
            data = await response.blob();
        } else if (contentType && contentType.includes('text/')) { // Broader check for text types (e.g., text/html, text/plain, text/csv).
            data = await response.text();
        } else { 
            // For other successful content types (or if no content-type is specified),
            // assume it's a binary file and try to parse as a blob.
            // This handles cases like PDF downloads (`application/pdf`) or other binary files.
            // If the response is a 204 No Content, .blob() will produce an empty blob, which is acceptable.
            data = await response.blob(); 
        }

        return { success: true, data, status: response.status, headers: response.headers };

    } catch (error) {
        // Handles errors thrown from the !response.ok block or network errors from fetch itself.
        if (!(typeof error === 'object' && error !== null && error.success === false)) {
            // Log if it's an unexpected error structure (not our thrown errorDetails).
            console.error(`API call exception: ${endpoint}`, error);
        }
        // Standardize error response structure.
        return {
            success: false,
            error: (error && error.error) ? error.error : 'Network error or processing issue. Could not connect or parse response.',
            data: (error && error.data) ? error.data : null,
            status: (error && error.status) ? error.status : 0 // Default to 0 for network errors where status might not be available.
        };
    }
}

// API interaction object for literature-related endpoints.
const literatureApi = {
    /** Fetches a list of literature items. Supports pagination and filtering via params. */
    async getList(params = {}) {
        return apiCall('/literature/', { params });
    },
    /** Uploads a literature data file (e.g., CSV, Excel) for bulk import. */
    async uploadFile(file) { 
        const formData = new FormData();
        formData.append('file', file); // 'file' is the expected key by the backend.
        return apiCall('/literature/upload', { method: 'POST', body: formData });
    },
    /** Updates a specific literature article's metadata. */
    async updateArticle(articleId, updateData) {
        return apiCall(`/literature/${articleId}`, {
            method: 'PUT',
            body: updateData // `updateData` is expected to be an object with fields to update.
        });
    },
    /** Deletes a specific literature article. */
     async deleteArticle(articleId) {
         return apiCall(`/literature/${articleId}`, {
             method: 'DELETE'
         });
     },
    /** Uploads a PDF file for a specific literature article. Uses createUploadHandler for progress. */
    async uploadPdfFile(articleId, file, onProgress) {
        const handler = createUploadHandler(
            onProgress, // Callback for upload progress updates.
            null,       // onComplete - handled by the promise resolve/reject from handler.
            null        // onError - handled by the promise resolve/reject from handler.
        );
        // Endpoint for PDF upload associated with a specific article.
        return handler(file, `/literature/${articleId}/upload_pdf`);
    }
};

// API interaction object for PDF-related actions.
const pdfApi = { 
    /** Associates an external PDF URL with a literature article.
     * This might be partially superseded by literatureApi.updateArticle if pdf_url is a direct field.
     */
    async associateLink(articleId, pdfUrl) {
        return apiCall('/pdfs/associate_link', { 
            method: 'POST', 
            body: { article_id: articleId, pdf_url: pdfUrl }
        });
    },
};

// API interaction object for screenshot-related endpoints.
const screenshotApi = {
    /** 
     * Saves a new screenshot. 
     * Interacts with the ScreenshotMetadata DB model on the backend.
     * @param {object} data - Contains imageFile (Blob) and other metadata (literature_article_id, page_number, etc.).
     */
    async save(data) { 
        const formData = new FormData();
        if (data.imageFile instanceof Blob) { // Check if imageFile is a Blob/File object.
            formData.append('image_file', data.imageFile, data.filename || 'screenshot.png'); // 'image_file' is expected by backend.
        }
        
        // Append other metadata fields to FormData.
        // The backend expects these as separate form fields.
        // Complex objects (like original_page_dimensions) are JSON stringified.
        Object.keys(data).forEach(key => {
            if (key !== 'imageFile' && key !== 'filename') { // Avoid re-appending the file itself or its original name.
                const value = data[key];
                if (value !== undefined && value !== null) {
                    if (typeof value === 'object') { // e.g., original_page_dimensions.
                        formData.append(key, JSON.stringify(value));
                    } else { // e.g., literature_article_id, page_number.
                        formData.append(key, String(value));
                    }
                }
            }
        });
        
        return apiCall('/save_screenshot', { // Endpoint for creating new screenshots.
            method: 'POST',
            body: formData
        });
    },
    /** Updates metadata for an existing screenshot (e.g., chart_type, description, wpd_data). */
    async updateMetadata(screenshotId, metadataUpdate) {
        return apiCall(`/screenshots/${screenshotId}/metadata`, { // Endpoint for updating metadata.
            method: 'POST', // Using POST, could also be PUT depending on API design.
            body: metadataUpdate // `metadataUpdate` contains fields like chart_type, description.
        });
    },
    /** Fetches screenshots from the database. Supports filtering and pagination via params. */
    async getScreenshots(params = {}) {
         return apiCall('/ml/screenshots', { params }); // Note: Uses '/ml/screenshots' endpoint.
    },
    /** Deletes a specific screenshot. */
     async deleteScreenshot(screenshotId) {
         return apiCall(`/screenshots/${screenshotId}`, {
             method: 'DELETE'
         });
     }
};

// API interaction object for authentication-related endpoints.
const authApi = {
    /** Logs in a user with credentials (e.g., username, password). */
    async login(credentials) {
        return apiCall('/auth/login', { method: 'POST', body: credentials });
    },
    /** Fetches details of the currently authenticated user. */
    async getCurrentUser() {
        return apiCall('/auth/me'); // Typically a GET request to fetch user info.
    },
    /** Verifies the validity of the current authentication token. */
    async verifyToken() {
        return apiCall('/auth/verify-token', { method: 'POST' }); // POST might be used to send token in body if not header.
    },
    /** Logs out the current user. */
    async logout() {
        return apiCall('/auth/logout', { method: 'POST' }); // POST to invalidate session/token on server.
    }
};

/** Performs a health check of the backend API. */
async function healthCheck() {
    try {
        // Health check endpoint is often outside the main /api prefix.
        const response = await fetch(`${API_BASE_URL.replace('/api', '')}/health`);
        if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Global error handler for API responses.
 * Logs the error, standardizes the error message, and optionally shows a toast notification.
 * @param {object} errorResponse - The error object, typically from apiCall.
 * @param {string} [context=''] - Optional context for logging (e.g., 'Login Attempt').
 * @returns {string} The processed error message.
 */
function handleApiError(errorResponse, context = '') {
    console.error(`API Error${context ? ` (${context})` : ''}:`, errorResponse);
    let message = 'An unknown error occurred.'; // Default message.

    if (typeof errorResponse === 'object' && errorResponse !== null) {
        // Prioritize specific error message from response, then stringified data, then default.
        message = errorResponse.error || errorResponse.message || errorResponse.msg || JSON.stringify(errorResponse.data) || message;
        
        // Special handling for 401 Unauthorized errors (token issues).
        if (errorResponse.status === 401 || (message.toLowerCase().includes('token') && !message.toLowerCase().includes('invalid json token'))) { 
            message = 'Authentication failed or token expired. Please log in again.';
            removeAuthToken(); // From auth.js
            // Redirect to login unless already on login/register page.
            if (!['/login.html', '/register.html'].some(path => window.location.pathname.endsWith(path))) {
                 setTimeout(() => { window.location.href = 'login.html'; }, 100); // Delay to allow toast to show.
            }
        } else if (errorResponse.status === 404) {
            message = 'The requested resource was not found.';
        } else if (errorResponse.status >= 500) {
            message = 'A server error occurred. Please try again later.';
        } else if (errorResponse.status > 0 && errorResponse.status !== 200 && errorResponse.status !== 201) {
            // For other client-side errors (4xx) or specific server errors, keep the message if already set.
        } else if (errorResponse.status === 0 || message.toLowerCase().includes('network error') || message.toLowerCase().includes('failed to fetch')) {
             // Handle network errors or fetch failures.
             message = 'Network error: Could not connect to the server.';
        }
         // If server returns an HTML page as an error (common for some frameworks).
         if (typeof errorResponse.data === 'string' && errorResponse.data.includes('<html')) {
             message = `Server returned an unexpected response (Status: ${errorResponse.status || 'N/A'}). Please check server logs.`;
         }
    } else if (typeof errorResponse === 'string') {
        // If errorResponse is just a string.
        message = errorResponse;
    }

    // Show toast notification using the global showToast function (if available).
    // window.showToast is typically defined in components.js or app.js.
    if (window.showToast) {
        window.showToast(message, 'error');
    }
    return message; // Return the processed message for local handling if needed.
}

/**
 * Creates a reusable XMLHttpRequest upload handler.
 * Provides progress, completion, and error callbacks.
 * @param {function} onProgress - Callback for upload progress (receives percentage).
 * @param {function} onComplete - Callback for successful upload (receives response data).
 * @param {function} onError - Callback for upload error (receives error details).
 * @returns {function} - A function that takes (file, endpoint, additionalData) and returns a Promise.
 */
function createUploadHandler(onProgress, onComplete, onError) {
    // This returned function is what's actually called to perform an upload.
    return function(file, endpoint, additionalData = {}) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const formData = new FormData();
            formData.append('file', file, file.name); // 'file' is the typical field name for the file.

            // Append any additional data to the FormData.
            Object.keys(additionalData).forEach(key => {
                 if (typeof additionalData[key] === 'object' && additionalData[key] !== null) {
                     formData.append(key, JSON.stringify(additionalData[key]));
                 } else if (additionalData[key] !== undefined && additionalData[key] !== null){
                     formData.append(key, additionalData[key]);
                 }
            });

            // Event listener for upload progress.
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable && onProgress) {
                    onProgress((e.loaded / e.total) * 100);
                }
            });

            // Event listener for when the request is complete (load).
            xhr.addEventListener('load', () => {
                let responseData; 
                let isJson = false;
                try {
                     const contentType = xhr.getResponseHeader('Content-Type');
                     if (contentType && contentType.includes('application/json')) {
                         responseData = JSON.parse(xhr.responseText); 
                         isJson = true;
                     } else { 
                         responseData = xhr.responseText; 
                     }
                } catch (e) { // Error parsing the response.
                    const errDetails = { success: false, error: `Upload failed: Invalid JSON (Status: ${xhr.status})`, status: xhr.status, data: xhr.responseText };
                    if (onError) onError(errDetails); 
                    return reject(errDetails);
                }

                if (xhr.status >= 200 && xhr.status < 300) { // Successful HTTP status.
                    const successDetails = { success: true, data: responseData, status: xhr.status };
                    if (onComplete) onComplete(responseData); 
                    resolve(successDetails);
                } else { // HTTP error status.
                    const errorMsg = isJson && responseData && (responseData.error || responseData.message || responseData.msg) ?
                                     (responseData.error || responseData.message || responseData.msg) : `Upload failed: ${xhr.status}`;
                    const errDetails = { success: false, error: errorMsg, data: responseData, status: xhr.status };
                    if (onError) onError(errDetails); 
                    reject(errDetails);
                }
            });

            // Event listener for network errors.
            xhr.addEventListener('error', () => {
                const errDetails = { success: false, error: 'Network error during upload.', status: 0 };
                if (onError) onError(errDetails); 
                reject(errDetails);
            });

            // Event listener for when the upload is aborted.
            xhr.addEventListener('abort', () => {
                const errDetails = { success: false, error: 'Upload aborted.', status: 0 };
                if (onError) onError(errDetails); 
                reject(errDetails);
            });

            const token = getAuthToken(); // From auth.js for authenticated uploads.
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            
            xhr.open('POST', `${API_BASE_URL}${endpoint}`);
            xhr.send(formData);
        });
    };
}

// Expose key functions and objects globally for use by other scripts.
// These are typically imported or accessed via the window object in other files.
window.apiCall = apiCall;
window.literatureApi = literatureApi;
window.pdfApi = pdfApi;
window.screenshotApi = screenshotApi;
window.authApi = authApi;
window.healthCheck = healthCheck;
window.handleApiError = handleApiError;         // Global error handler.
window.createUploadHandler = createUploadHandler; // Global utility for XHR uploads.
window.API_BASE_URL = API_BASE_URL;             // Global constant for API base URL.

// Alias for screenshotApi.getScreenshots, potentially for specific use cases (e.g., "ML" related features).
window.mlApi = { getScreenshots: screenshotApi.getScreenshots };



