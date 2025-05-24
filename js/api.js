// API communication layer
const API_BASE_URL = 'http://localhost:5000/api';

// Generic API call function
async function apiCall(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = getAuthToken(); // from auth.js

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
        let data;
        const contentType = response.headers.get('content-type');

        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else if (contentType && (contentType.includes('text/') || contentType.includes('image/'))) { // Broader check for text or image types (like SVG)
             if (response.ok && contentType.includes('image/')) { // Handle successful image blob directly
                return {
                    success: true,
                    data: await response.blob(),
                    status: response.status,
                    headers: response.headers
                };
             }
            data = await response.text();
        } else { 
             if (!response.ok) {
                 const errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
                 console.error(`API call failed (Non-JSON/text response): ${endpoint}`, { error: errorMsg, status: response.status });
                 throw { success: false, error: errorMsg, status: response.status, data: null };
             }
            return { 
                success: true,
                data: await response.blob(), // Assume blob for other successful unknown content types
                status: response.status,
                headers: response.headers
            };
        }

        if (!response.ok) {
            let errorMsg = `HTTP ${response.status}`;
            if (typeof data === 'object' && data !== null && (data.error || data.message || data.msg)) {
                errorMsg = data.error || data.message || data.msg;
            } else if (typeof data === 'string' && data.length < 200) { 
                errorMsg = data;
            } else if (response.statusText) {
                errorMsg = response.statusText;
            }
            const errorDetails = { success: false, error: errorMsg, data: data, status: response.status };
            console.error(`API call failed (JSON/Text response): ${endpoint}`, errorDetails);
            throw errorDetails;
        }

        return { success: true, data, status: response.status, headers: response.headers };

    } catch (error) {
        if (!(typeof error === 'object' && error !== null && error.success === false)) {
            console.error(`API call exception: ${endpoint}`, error);
        }
        return {
            success: false,
            error: (error && error.error) ? error.error : 'Network error or processing issue. Could not connect or parse response.',
            data: (error && error.data) ? error.data : null,
            status: (error && error.status) ? error.status : 0
        };
    }
}

const literatureApi = {
    async getList(params = {}) {
        return apiCall('/literature/', { params });
    },
    async uploadFile(file) { 
        const formData = new FormData();
        formData.append('file', file);
        return apiCall('/literature/upload', { method: 'POST', body: formData });
    },
    // MODIFICATION: Add new API call for updating a literature article
    async updateArticle(articleId, updateData) {
        return apiCall(`/literature/${articleId}`, {
            method: 'PUT',
            body: updateData 
        });
    },
    // MODIFICATION: Add API call for deleting a literature article
     async deleteArticle(articleId) {
         return apiCall(`/literature/${articleId}`, {
             method: 'DELETE'
         });
     }
};

const pdfApi = { // This API might be partially superseded by literatureApi.updateArticle for PDF URL
    async associateLink(articleId, pdfUrl) {
        return apiCall('/pdfs/associate_link', { // Keeping for now if it has specific logic
            method: 'POST', 
            body: { article_id: articleId, pdf_url: pdfUrl }
        });
    },
};

const screenshotApi = {
    // MODIFICATION: Save interacts with new ScreenshotMetadata DB model
    async save(data) { // data is an object with imageFile and metadata fields
        const formData = new FormData();
        if (data.imageFile instanceof Blob) { // Ensure it's a blob/file
            formData.append('image_file', data.imageFile, data.filename || 'screenshot.png');
        }
        
        // Append other metadata fields
        // Backend expects these as form fields, JSON stringified if objects
        Object.keys(data).forEach(key => {
            if (key !== 'imageFile' && key !== 'filename') {
                const value = data[key];
                if (value !== undefined && value !== null) {
                    if (typeof value === 'object') {
                        formData.append(key, JSON.stringify(value));
                    } else {
                        formData.append(key, String(value));
                    }
                }
            }
        });
        
        return apiCall('/save_screenshot', {
            method: 'POST',
            body: formData
        });
    },
    // MODIFICATION: updateMetadata now updates ScreenshotMetadata DB model
    async updateMetadata(screenshotId, metadataUpdate) {
        return apiCall(`/screenshots/${screenshotId}/metadata`, {
            method: 'POST', 
            body: metadataUpdate 
        });
    },
    // MODIFICATION: getScreenshots fetches from DB, supports new filters
    async getScreenshots(params = {}) {
         return apiCall('/ml/screenshots', { params });
    },
    // MODIFICATION: Add API call for deleting a screenshot
     async deleteScreenshot(screenshotId) {
         return apiCall(`/screenshots/${screenshotId}`, {
             method: 'DELETE'
         });
     }
};

const authApi = {
    async login(credentials) {
        return apiCall('/auth/login', { method: 'POST', body: credentials });
    },
    async getCurrentUser() {
        return apiCall('/auth/me');
    },
    async verifyToken() {
        return apiCall('/auth/verify-token', { method: 'POST' });
    },
    async logout() {
        return apiCall('/auth/logout', { method: 'POST' });
    }
};

async function healthCheck() {
    try {
        const response = await fetch(`${API_BASE_URL.replace('/api', '')}/health`);
        if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function handleApiError(errorResponse, context = '') {
    console.error(`API Error${context ? ` (${context})` : ''}:`, errorResponse);
    let message = 'An unknown error occurred.';

    if (typeof errorResponse === 'object' && errorResponse !== null) {
        message = errorResponse.error || errorResponse.message || errorResponse.msg || JSON.stringify(errorResponse.data) || message;
        if (errorResponse.status === 401 || (message.toLowerCase().includes('token') && !message.toLowerCase().includes('invalid json token'))) { 
            message = 'Authentication failed or token expired. Please log in again.';
            removeAuthToken();
            if (!['/login.html', '/register.html'].some(path => window.location.pathname.endsWith(path))) {
                 setTimeout(() => { window.location.href = 'login.html'; }, 100);
            }
        } else if (errorResponse.status === 404) {
            message = 'The requested resource was not found.';
        } else if (errorResponse.status >= 500) {
            message = 'A server error occurred. Please try again later.';
        } else if (errorResponse.status > 0 && errorResponse.status !== 200 && errorResponse.status !== 201) {
            // Keep the specific message if already set
        } else if (errorResponse.status === 0 || message.toLowerCase().includes('network error') || message.toLowerCase().includes('failed to fetch')) {
             message = 'Network error: Could not connect to the server.';
        }
         if (typeof errorResponse.data === 'string' && errorResponse.data.includes('<html')) {
             message = `Server returned an unexpected response (Status: ${errorResponse.status || 'N/A'}). Please check server logs.`;
         }
    } else if (typeof errorResponse === 'string') {
        message = errorResponse;
    }
    // Show toast using global function if available
    if (window.showToast) {
        window.showToast(message, 'error');
    }
    return message; // Return for local handling if needed
}

function createUploadHandler(onProgress, onComplete, onError) {
    return function(file, endpoint, additionalData = {}) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const formData = new FormData();
            formData.append('file', file, file.name);
            Object.keys(additionalData).forEach(key => {
                 if (typeof additionalData[key] === 'object' && additionalData[key] !== null) {
                     formData.append(key, JSON.stringify(additionalData[key]));
                 } else if (additionalData[key] !== undefined && additionalData[key] !== null){
                     formData.append(key, additionalData[key]);
                 }
            });

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable && onProgress) {
                    onProgress((e.loaded / e.total) * 100);
                }
            });
            xhr.addEventListener('load', () => {
                let responseData; let isJson = false;
                try {
                     const contentType = xhr.getResponseHeader('Content-Type');
                     if (contentType && contentType.includes('application/json')) {
                         responseData = JSON.parse(xhr.responseText); isJson = true;
                     } else { responseData = xhr.responseText; }
                } catch (e) {
                    const errDetails = { success: false, error: `Upload failed: Invalid JSON (Status: ${xhr.status})`, status: xhr.status, data: xhr.responseText };
                    if (onError) onError(errDetails); return reject(errDetails);
                }
                if (xhr.status >= 200 && xhr.status < 300) {
                    const successDetails = { success: true, data: responseData, status: xhr.status };
                    if (onComplete) onComplete(responseData); resolve(successDetails);
                } else {
                    const errorMsg = isJson && responseData && (responseData.error || responseData.message || responseData.msg) ?
                                     (responseData.error || responseData.message || responseData.msg) : `Upload failed: ${xhr.status}`;
                    const errDetails = { success: false, error: errorMsg, data: responseData, status: xhr.status };
                    if (onError) onError(errDetails); reject(errDetails);
                }
            });
            xhr.addEventListener('error', () => {
                const errDetails = { success: false, error: 'Network error during upload.', status: 0 };
                if (onError) onError(errDetails); reject(errDetails);
            });
            xhr.addEventListener('abort', () => {
                const errDetails = { success: false, error: 'Upload aborted.', status: 0 };
                if (onError) onError(errDetails); reject(errDetails);
            });

            const token = getAuthToken();
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.open('POST', `${API_BASE_URL}${endpoint}`);
            xhr.send(formData);
        });
    };
}

window.apiCall = apiCall;
window.literatureApi = literatureApi;
window.pdfApi = pdfApi;
window.screenshotApi = screenshotApi;
window.authApi = authApi;
window.healthCheck = healthCheck;
window.handleApiError = handleApiError;
window.createUploadHandler = createUploadHandler;
window.API_BASE_URL = API_BASE_URL;
window.mlApi = { getScreenshots: screenshotApi.getScreenshots }; // Alias



