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
        
        // Show department restriction notice for Leaders
        if (permissions.departmentRestricted && this.currentUser.department) {
            const noticeEl = document.getElementById('dept-restriction-notice');
            const deptNameEl = document.getElementById('user-department-name');
            if (noticeEl && deptNameEl) {
                deptNameEl.textContent = this.currentUser.department;
                noticeEl.style.display = 'block';
            }
        }
        
        // Disable registration button if no permission
        if (!permissions.canRegister) {
            this.disableRegistration();
        }
        
        // Show create buttons for Admins only
        if (this.isAdmin()) {
            this.showAdminButtons();
        }
    }
    
    /**
     * Show admin-only buttons (Create Event, Create Announcement)
     */
    showAdminButtons() {
        const addEventBtn = document.getElementById('add-event-btn-container');
        const addAnnouncementBtn = document.getElementById('add-announcement-btn-container');
        
        if (addEventBtn) {
            addEventBtn.style.display = 'block';
        }
        if (addAnnouncementBtn) {
            addAnnouncementBtn.style.display = 'block';
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
     * Add logout button to header
     */
    
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
    
    /**
     * Open profile edit modal
     */
    openProfileEdit() {
        if (!this.currentUser) {
            alert('Please login first');
            return;
        }
        
        // Populate form with current user data
        document.getElementById('profile-staff-id').value = this.currentUser.staffId || '';
        document.getElementById('profile-name').value = this.currentUser.name || '';
        document.getElementById('profile-department').value = this.currentUser.department || '';
        document.getElementById('profile-email').value = this.currentUser.email || '';
        document.getElementById('profile-phone').value = this.currentUser.phone || '';
        
        // Clear any previous messages
        document.getElementById('profile-message').innerHTML = '';
        
        // Open modal
        const modal = new bootstrap.Modal(document.getElementById('profileEditModal'));
        modal.show();
    }
    
    /**
     * Save profile changes
     */
    async saveProfile() {
        const email = document.getElementById('profile-email').value.trim();
        const phone = document.getElementById('profile-phone').value.trim();
        const messageDiv = document.getElementById('profile-message');
        
        // Validation
        if (!email) {
            messageDiv.innerHTML = '<div class="alert alert-danger">Email is required</div>';
            return;
        }
        
        if (!phone) {
            messageDiv.innerHTML = '<div class="alert alert-danger">Phone is required</div>';
            return;
        }
        
        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            messageDiv.innerHTML = '<div class="alert alert-danger">Please enter a valid email address</div>';
            return;
        }
        
        // Show loading
        messageDiv.innerHTML = '<div class="alert alert-info"><i class="fas fa-spinner fa-spin"></i> Updating profile...</div>';
        
        try {
            // Call backend to update profile
            const response = await fetch(`${CONFIG.API_URL}?action=updateProfile&staffId=${this.currentUser.staffId}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`);
            const data = await response.json();
            
            if (data.success) {
                // Update local user data
                this.currentUser.email = email;
                this.currentUser.phone = phone;
                this.saveUser(this.currentUser);
                
                // Show success message
                messageDiv.innerHTML = '<div class="alert alert-success"><i class="fas fa-check-circle"></i> Profile updated successfully!</div>';
                
                // Close modal after 2 seconds
                setTimeout(() => {
                    const modal = bootstrap.Modal.getInstance(document.getElementById('profileEditModal'));
                    if (modal) modal.hide();
                    messageDiv.innerHTML = '';
                }, 2000);
            } else {
                messageDiv.innerHTML = `<div class="alert alert-danger"><i class="fas fa-times-circle"></i> ${data.message || 'Update failed'}</div>`;
            }
        } catch (error) {
            console.error('Profile update error:', error);
            messageDiv.innerHTML = '<div class="alert alert-danger"><i class="fas fa-times-circle"></i> Error updating profile. Please try again.</div>';
        }
    }
}

// Initialize auth manager globally
const authManager = new AuthManager();
