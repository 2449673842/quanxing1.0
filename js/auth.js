// js/auth.js: Handles user authentication, token management (localStorage),
// registration, login, logout, and UI updates related to auth state.
// Depends on: js/api.js (implicitly, for API_BASE_URL used in fetch calls).

/**
 * Checks if a user is authenticated by looking for an auth token in localStorage.
 * @returns {boolean} True if authenticated, false otherwise.
 */
function isAuthenticated() {
    const token = localStorage.getItem('auth_token');
    return token !== null;
}

/**
 * Retrieves the authentication token from localStorage.
 * @returns {string|null} The auth token, or null if not found.
 */
function getAuthToken() {
    return localStorage.getItem('auth_token');
}

/**
 * Stores the authentication token in localStorage.
 * @param {string} token - The authentication token to store.
 */
function setAuthToken(token) {
    localStorage.setItem('auth_token', token);
}

/**
 * Removes the authentication token from localStorage.
 */
function removeAuthToken() {
    localStorage.removeItem('auth_token');
}

/**
 * Checks the current authentication state by verifying the token with the backend.
 * Updates UI elements (auth buttons, user menu) based on the authentication status.
 * This is typically called on page load to ensure UI consistency.
 */
async function checkAuthState() {
    const authButtons = document.getElementById('auth-buttons'); // Container for login/register buttons.
    const userMenu = document.getElementById('user-menu');       // Container for user-specific menu (e.g., username, logout).
    
    if (isAuthenticated()) { // Check local token first.
        try {
            // Verify token with the backend to ensure it's still valid.
            // window.API_BASE_URL is from api.js.
            const response = await fetch(`${window.API_BASE_URL}/auth/verify-token`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getAuthToken()}`, // Send token for verification.
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.valid && data.user) {
                // User is authenticated and token is valid. Show user menu.
                if (authButtons) authButtons.classList.add('hidden');
                if (userMenu) {
                    userMenu.classList.remove('hidden');
                    const usernameEl = document.getElementById('username-display');
                    if (usernameEl) usernameEl.textContent = data.user.username;
                }
            } else {
                // Token is invalid (e.g., expired, revoked). Remove it and show auth buttons.
                removeAuthToken();
                if (authButtons) authButtons.classList.remove('hidden');
                if (userMenu) userMenu.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error verifying auth:', error);
            // On error (e.g., network issue), assume not authenticated for safety.
            removeAuthToken();
            if (authButtons) authButtons.classList.remove('hidden');
            if (userMenu) userMenu.classList.add('hidden');
        }
    } else {
        // Not authenticated (no local token). Show auth buttons.
        if (authButtons) authButtons.classList.remove('hidden');
        if (userMenu) userMenu.classList.add('hidden');
    }
}

/**
 * Handles user registration form submission.
 * Validates input, calls the registration API, and provides user feedback.
 * @param {Event} event - The form submission event.
 */
async function handleRegister(event) {
    event.preventDefault(); // Prevent default form submission.
    
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries()); // Convert FormData to plain object.
    
    // Basic client-side password confirmation validation.
    if (data.password !== data['confirm-password']) {
        showError('Passwords do not match'); // showError is a local helper in this file.
        return;
    }
    
    // Remove confirm-password field as it's not needed by the backend.
    delete data['confirm-password'];
    
    try {
        setLoading(true, 'register'); // setLoading is a local helper for button state.
        
        // API call to register user. window.API_BASE_URL from api.js.
        const response = await fetch(`${window.API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data) // Send registration data as JSON.
        });
        
        const result = await response.json(); // Parse API response.
        
        if (response.ok) { // Registration successful.
            showSuccess('Registration successful! Redirecting to sign in...');
            setTimeout(() => {
                window.location.href = 'login.html'; // Redirect to login page.
            }, 2000);
        } else { // Registration failed.
            showError(result.error || 'Registration failed');
        }
    } catch (error) { // Network or other errors.
        console.error('Registration error:', error);
        showError('Registration failed. Please try again.');
    } finally {
        setLoading(false, 'register'); // Reset button loading state.
    }
}

/**
 * Handles user login form submission.
 * Calls the login API, stores the auth token on success, and redirects to dashboard.
 * @param {Event} event - The form submission event.
 */
async function handleLogin(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    try {
        setLoading(true, 'login');
        
        // API call to login user. window.API_BASE_URL from api.js.
        const response = await fetch(`${window.API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data) // Send login credentials as JSON.
        });
        
        const result = await response.json();
        
        if (response.ok) { // Login successful.
            setAuthToken(result.access_token); // Store the received token.
            showSuccess('Login successful! Redirecting...');
            setTimeout(() => {
                window.location.href = 'dashboard.html'; // Redirect to dashboard.
            }, 1000);
        } else { // Login failed.
            showError(result.error || 'Login failed');
        }
    } catch (error) { // Network or other errors.
        console.error('Login error:', error);
        showError('Login failed. Please check your connection.');
    } finally {
        setLoading(false, 'login');
    }
}

/**
 * Handles user logout.
 * Calls the logout API (if possible) and always removes the local auth token.
 * @returns {Promise<boolean>} True, indicating logout process was attempted.
 */
async function logout() {
    try {
        // Attempt to call backend logout endpoint to invalidate session/token server-side.
        // window.API_BASE_URL from api.js.
        await fetch(`${window.API_BASE_URL}/auth/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`, // Send current token.
                'Content-Type': 'application/json'
            }
        });
        // Regardless of API call success, always remove local token.
    } catch (error) {
        console.error('Logout error:', error);
        // Still remove local token even if API call fails.
    } finally {
        removeAuthToken(); // Ensure local token is cleared.
    }
    return true; // Indicate logout attempt was made.
}

// --- UI Helper Functions for Auth Pages (login.html, register.html) ---

/**
 * Displays an error message in a designated area on the page.
 * @param {string} message - The error message to display.
 */
function showError(message) {
    const errorDiv = document.getElementById('error-message');    // Assumes an element with this ID exists.
    const errorText = document.getElementById('error-text');      // Assumes an element with this ID exists.
    const successDiv = document.getElementById('success-message'); // Assumes an element with this ID exists.
    
    if (errorDiv && errorText) {
        errorText.textContent = message;
        errorDiv.classList.remove('hidden'); // Make error message visible.
    }
    
    if (successDiv) {
        successDiv.classList.add('hidden'); // Hide any existing success message.
    }
    
    // Scroll to top of page to ensure the message is visible, especially on mobile.
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Displays a success message in a designated area on the page.
 * @param {string} message - The success message to display.
 */
function showSuccess(message) {
    const successDiv = document.getElementById('success-message');
    const errorDiv = document.getElementById('error-message');
    
    if (successDiv) {
        const messageEl = successDiv.querySelector('p'); // Assumes success message is within a <p> tag.
        if (messageEl) messageEl.textContent = message;
        successDiv.classList.remove('hidden'); // Make success message visible.
    }
    
    if (errorDiv) {
        errorDiv.classList.add('hidden'); // Hide any existing error message.
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Sets the loading state for form submission buttons (disables button, shows spinner).
 * @param {boolean} isLoading - True to set loading state, false to reset.
 * @param {string} type - The type of button (e.g., 'register', 'login'), used to find elements by ID.
 */
function setLoading(isLoading, type) {
    const button = document.getElementById(`${type}-button`);    // e.g., 'login-button'
    const text = document.getElementById(`${type}-text`);        // e.g., 'login-text' (button text span)
    const spinner = document.getElementById(`${type}-spinner`);  // e.g., 'login-spinner' (loading spinner element)
    
    if (button) {
        button.disabled = isLoading; // Disable button during loading.
    }
    
    // Toggle visibility of button text and spinner.
    if (isLoading) {
        if (text) text.classList.add('hidden');
        if (spinner) spinner.classList.remove('hidden');
    } else {
        if (text) text.classList.remove('hidden');
        if (spinner) spinner.classList.add('hidden');
    }
}

// --- Event Listeners for Shared UI Components (e.g., User Menu in Navbar) ---

// Setup user menu interactions (dropdown, logout button) once DOM is loaded.
// This is relevant for pages that include the standard navbar with user menu.
document.addEventListener('DOMContentLoaded', function() {
    const userMenuButton = document.getElementById('user-menu-button');
    const dropdownMenu = document.getElementById('dropdown-menu');
    const logoutBtn = document.getElementById('logout-btn'); // Actual logout button in the dropdown.
    
    if (userMenuButton && dropdownMenu) {
        userMenuButton.addEventListener('click', function(e) {
            e.stopPropagation(); // Prevent click from immediately closing the menu.
            dropdownMenu.classList.toggle('hidden');
        });
        
        // Close dropdown if user clicks anywhere outside of it.
        document.addEventListener('click', function(event) {
            // Check if the click was outside the button AND outside the menu itself.
            if (!userMenuButton.contains(event.target) && !dropdownMenu.contains(event.target)) {
                dropdownMenu.classList.add('hidden');
            }
        });
    }
    
    // Attach logout functionality to the logout button in the user menu.
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function() {
            await logout(); // Perform logout operations.
            window.location.href = 'index.html'; // Redirect to home/login page after logout.
        });
    }
});

// --- Global Exports ---
// Expose functions to be used by other scripts or inline in HTML.
// These are attached to the window object, making them globally accessible.

/** @global */
window.isAuthenticated = isAuthenticated;
/** @global */
window.getAuthToken = getAuthToken;
/** @global */
window.setAuthToken = setAuthToken;
/** @global */
window.removeAuthToken = removeAuthToken;
/** @global */
window.checkAuthState = checkAuthState; // Important for initializing UI based on auth status.
/** @global (typically used by register.html) */
window.handleRegister = handleRegister;
/** @global (typically used by login.html) */
window.handleLogin = handleLogin;
/** @global (used by navbar logout button, potentially other logout triggers) */
window.logout = logout; 
// Note: showError, showSuccess, setLoading are local helpers for auth pages, not typically needed globally.









