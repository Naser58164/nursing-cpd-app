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
     * Logout user
     */
    logout() {
        localStorage.removeItem('cpdUser');
        this.currentUser = null;
        window.location.href = 'login.html';
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
        // Update welcome message
        const welcomeEl = document.getElementById('welcome-message');
        if (welcomeEl) {
            welcomeEl.textContent = `Welcome, ${this.currentUser.name}`;
        }
        
        // Show user info in header
        const userInfoEl = document.getElementById('user-info');
        if (userInfoEl) {
            const roleClass = this.getRoleClass(this.currentUser.role);
            userInfoEl.innerHTML = `
                <div class="d-flex align-items-center">
                    <div class="me-3">
                        <strong>${this.currentUser.name}</strong><br>
                        <small class="text-muted">${this.currentUser.designation}</small>
                    </div>
                    <span class="badge ${roleClass}">${this.currentUser.role}</span>
                </div>
            `;
        }
        
        // Add logout button
        this.addLogoutButton();
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
     * Add logout button to header
     */
    addLogoutButton() {
        const header = document.querySelector('header .container');
        if (header && !document.getElementById('logout-btn')) {
            const logoutBtn = document.createElement('button');
            logoutBtn.id = 'logout-btn';
            logoutBtn.className = 'btn btn-outline-light btn-sm';
            logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Logout';
            logoutBtn.onclick = () => this.logout();
            
            header.appendChild(logoutBtn);
        }
    }
    
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
