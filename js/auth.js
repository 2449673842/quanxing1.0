// Authentication handling
const API_BASE_URL = 'http://localhost:5000/api';

// Check if user is authenticated
function isAuthenticated() {
    const token = localStorage.getItem('auth_token');
    return token !== null;
}

// Get auth token
function getAuthToken() {
    return localStorage.getItem('auth_token');
}

// Set auth token
function setAuthToken(token) {
    localStorage.setItem('auth_token', token);
}

// Remove auth token
function removeAuthToken() {
    localStorage.removeItem('auth_token');
}

// Check authentication state and update UI
async function checkAuthState() {
    const authButtons = document.getElementById('auth-buttons');
    const userMenu = document.getElementById('user-menu');
    
    if (isAuthenticated()) {
        try {
            // Verify token and get user info
            const response = await fetch(`${API_BASE_URL}/auth/verify-token`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getAuthToken()}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.valid && data.user) {
                // User is authenticated, show user menu
                if (authButtons) authButtons.classList.add('hidden');
                if (userMenu) {
                    userMenu.classList.remove('hidden');
                    const usernameEl = document.getElementById('username-display');
                    if (usernameEl) usernameEl.textContent = data.user.username;
                }
            } else {
                // Token is invalid, remove it
                removeAuthToken();
                if (authButtons) authButtons.classList.remove('hidden');
                if (userMenu) userMenu.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error verifying auth:', error);
            // On error, assume not authenticated
            removeAuthToken();
            if (authButtons) authButtons.classList.remove('hidden');
            if (userMenu) userMenu.classList.add('hidden');
        }
    } else {
        // Not authenticated, show auth buttons
        if (authButtons) authButtons.classList.remove('hidden');
        if (userMenu) userMenu.classList.add('hidden');
    }
}

// Handle user registration
async function handleRegister(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    // Validate passwords match
    if (data.password !== data['confirm-password']) {
        showError('Passwords do not match');
        return;
    }
    
    // Remove confirm password from data
    delete data['confirm-password'];
    
    try {
        setLoading(true, 'register');
        
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showSuccess('Registration successful! Redirecting to sign in...');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } else {
            showError(result.error || 'Registration failed');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showError('Registration failed. Please try again.');
    } finally {
        setLoading(false, 'register');
    }
}

// Handle user login
async function handleLogin(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    try {
        setLoading(true, 'login');
        
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            setAuthToken(result.access_token);
            showSuccess('Login successful! Redirecting...');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
        } else {
            showError(result.error || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('Login failed. Please check your connection.');
    } finally {
        setLoading(false, 'login');
    }
}

// Handle user logout
async function logout() {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`,
                'Content-Type': 'application/json'
            }
        });
        
        // Always remove token, regardless of API response
        removeAuthToken();
        
        return true;
    } catch (error) {
        console.error('Logout error:', error);
        // Still remove token on error
        removeAuthToken();
        return true;
    }
}

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    const successDiv = document.getElementById('success-message');
    
    if (errorDiv && errorText) {
        errorText.textContent = message;
        errorDiv.classList.remove('hidden');
    }
    
    if (successDiv) {
        successDiv.classList.add('hidden');
    }
    
    // Scroll to top to ensure error is visible
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Show success message
function showSuccess(message) {
    const successDiv = document.getElementById('success-message');
    const errorDiv = document.getElementById('error-message');
    
    if (successDiv) {
        const messageEl = successDiv.querySelector('p');
        if (messageEl) messageEl.textContent = message;
        successDiv.classList.remove('hidden');
    }
    
    if (errorDiv) {
        errorDiv.classList.add('hidden');
    }
    
    // Scroll to top to ensure success message is visible
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Set loading state for buttons
function setLoading(isLoading, type) {
    const button = document.getElementById(`${type}-button`);
    const text = document.getElementById(`${type}-text`);
    const spinner = document.getElementById(`${type}-spinner`);
    
    if (button) {
        button.disabled = isLoading;
    }
    
    if (isLoading) {
        if (text) text.classList.add('hidden');
        if (spinner) spinner.classList.remove('hidden');
    } else {
        if (text) text.classList.remove('hidden');
        if (spinner) spinner.classList.add('hidden');
    }
}

// Setup user menu interactions
document.addEventListener('DOMContentLoaded', function() {
    const userMenuButton = document.getElementById('user-menu-button');
    const dropdownMenu = document.getElementById('dropdown-menu');
    const logoutBtn = document.getElementById('logout-btn');
    
    if (userMenuButton && dropdownMenu) {
        userMenuButton.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdownMenu.classList.toggle('hidden');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function() {
            dropdownMenu.classList.add('hidden');
        });
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function() {
            await logout();
            window.location.href = 'index.html';
        });
    }
});

// Export functions for use in other scripts
window.isAuthenticated = isAuthenticated;
window.getAuthToken = getAuthToken;
window.setAuthToken = setAuthToken;
window.removeAuthToken = removeAuthToken;
window.checkAuthState = checkAuthState;
window.handleRegister = handleRegister;
window.handleLogin = handleLogin;
window.logout = logout;









