/**
 * Authentication Module
 * Handles user authentication, authorization, and role-based access control
 */

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.init();
    }
    
    init() {
        // Load user from localStorage
        this.currentUser = this.loadUser();
        
        // If not logged in and not on login page, redirect to login
        if (!this.currentUser && !window.location.pathname.includes('login.html')) {
            window.location.href = 'login.html';
            return;
        }
        
        // If logged in, apply role-based UI restrictions
        if (this.currentUser) {
            this.applyRoleRestrictions();
            this.updateUI();
        }
    }
    
    /**
     * Load user from localStorage
     */
    loadUser() {
        const userStr = localStorage.getItem('cpdUser');
        if (!userStr) return null;
        
        try {
            return JSON.parse(userStr);
        } catch (error) {
            console.error('Error parsing user data:', error);
            return null;
        }
    }
    
    /**
     * Save user to localStorage
     */
    saveUser(user) {
        localStorage.setItem('cpdUser', JSON.stringify(user));
        this.currentUser = user;
    }
    
    /**
     * Logout user with confirmation
     */
    logout() {
        // Show confirmation dialog
        if (confirm('Are you sure you want to logout?')) {
            // Clear user data
            localStorage.removeItem('cpdUser');
            this.currentUser = null;
            
            // Show logout message
            const header = document.querySelector('header');
            if (header) {
                const logoutMsg = document.createElement('div');
                logoutMsg.className = 'alert alert-success position-fixed top-0 start-50 translate-middle-x mt-3';
                logoutMsg.style.zIndex = '9999';
                logoutMsg.innerHTML = '<i class="fas fa-check-circle"></i> Logged out successfully. Redirecting...';
                document.body.appendChild(logoutMsg);
            }
            
            // Redirect to login page after short delay
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1000);
        }
    }
    
    /**
     * Get current user
     */
    getUser() {
        return this.currentUser;
    }
    
    /**
     * Check if user has permission
     */
    hasPermission(permission) {
        if (!this.currentUser || !this.currentUser.permissions) {
            return false;
        }
        return this.currentUser.permissions[permission] === true;
    }
    
    /**
     * Get user role
     */
    getRole() {
        return this.currentUser ? this.currentUser.role : 'User';
    }
    
    /**
     * Apply role-based restrictions to UI
     */
    applyRoleRestrictions() {
        const permissions = this.currentUser.permissions;
        
        // Hide/show navigation items based on permissions
        this.toggleNavItem('nav-dashboard', permissions.canViewDashboard);
        this.toggleNavItem('nav-calendar', permissions.canViewCalendar);
        this.toggleNavItem('nav-leaders', permissions.canViewLeaders);
        this.toggleNavItem('nav-registration', permissions.canRegister);
        
        // Hide/show sections based on permissions
        if (!permissions.canViewDashboard) {
            this.hideSection('dashboard');
        }
        
        if (!permissions.canViewCalendar) {
            this.hideSection('calendar');
        }
        
        if (!permissions.canViewLeaders) {
            this.hideSection('leaders');
        }
        
        if (!permissions.canRegister) {
            this.hideSection('registration');
        }
        
        // Disable registration button if no permission
        if (!permissions.canRegister) {
            this.disableRegistration();
        }
    }
    
    /**
     * Toggle navigation item visibility
     */
    toggleNavItem(itemId, show) {
        const item = document.getElementById(itemId);
        if (item) {
            item.style.display = show ? 'block' : 'none';
        }
    }
    
    /**
     * Hide entire section
     */
    hideSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (section) {
            section.style.display = 'none';
        }
    }
    
    /**
     * Disable registration functionality
     */
    disableRegistration() {
        // Hide registration modal trigger button
        const registerButtons = document.querySelectorAll('[data-bs-target="#registerModal"]');
        registerButtons.forEach(btn => {
            btn.style.display = 'none';
        });
        
        // Add message to events if user can't register
        const eventsSection = document.getElementById('events');
        if (eventsSection && !this.hasPermission('canRegister')) {
            const notice = document.createElement('div');
            notice.className = 'alert alert-info';
            notice.innerHTML = '<i class="fas fa-info-circle"></i> You do not have permission to register for events. Contact your administrator if you need access.';
            eventsSection.insertBefore(notice, eventsSection.firstChild);
        }
    }
    
    /**
     * Update UI with user information
     */
    updateUI() {
        // Update user info in sidebar only (header user info removed)
        const sidebarUserInfo = document.getElementById('sidebar-user-info');
        if (sidebarUserInfo) {
            const roleClass = this.getRoleClass(this.currentUser.role);
            sidebarUserInfo.innerHTML = `
                <div class="mb-2">
                    <i class="fas fa-user-circle fa-3x text-primary"></i>
                </div>
                <div class="fw-bold">${this.currentUser.name}</div>
                <small class="text-muted d-block mb-2">${this.currentUser.designation}</small>
                <span class="badge ${roleClass}">${this.currentUser.role}</span>
            `;
        }
    }
    
    /**
     * Get CSS class for role badge
     */
    getRoleClass(role) {
        const roleClasses = {
            'Admin': 'bg-danger',
            'Moderator': 'bg-info',
            'Leader': 'bg-primary',
            'User': 'bg-secondary'
        };
        return roleClasses[role] || 'bg-secondary';
    }
    
    /**
    
    /**
     * Show access denied message
     */
    showAccessDenied(section) {
        return `
            <div class="alert alert-warning" role="alert">
                <h5><i class="fas fa-lock"></i> Access Denied</h5>
                <p>You do not have permission to access ${section}.</p>
                <p class="mb-0"><small>Your role: <strong>${this.getRole()}</strong></small></p>
            </div>
        `;
    }
}

// Initialize auth manager globally
const authManager = new AuthManager();
