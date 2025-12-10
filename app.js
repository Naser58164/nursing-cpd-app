// Main Application Logic
class NursingCPDApp {
    constructor() {
        this.currentSection = 'main-page';
        this.events = [];
        this.calendar = null;
        this.charts = {};
        this.eventModal = null;
        this.init();
    }

    init() {
        console.log('🚀 Initializing Nursing CPD Portal...');
        this.setupEventListeners();
        this.loadInitialData();
        this.initBootstrapComponents();
    }

    initBootstrapComponents() {
        // Initialize Bootstrap modal
        const modalElement = document.getElementById('eventModal');
        if (modalElement && typeof bootstrap !== 'undefined') {
            this.eventModal = new bootstrap.Modal(modalElement);
        }
    }

    setupEventListeners() {
        // Registration form
        const regForm = document.getElementById('cpd-registration-form');
        if (regForm) {
            regForm.addEventListener('submit', (e) => this.handleRegistration(e));
        }

        // Staff ID input - preview staff details
        const staffIdInput = document.getElementById('staffId');
        if (staffIdInput) {
            staffIdInput.addEventListener('blur', () => this.previewStaffDetails());
        }

        // Search and filters
        const searchInput = document.getElementById('search-events');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.filterEvents());
        }

        const deptFilter = document.getElementById('filter-department');
        if (deptFilter) {
            deptFilter.addEventListener('change', () => this.filterEvents());
        }

        const statusFilter = document.getElementById('filter-status');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => this.filterEvents());
        }
    }

    async loadInitialData() {
        await this.loadEvents();
        // Load announcements and leaders on main page
        this.loadAnnouncements();
        this.loadLeaders();
    }

    // Navigation
    showSection(sectionId) {
        // Map old section IDs to Bootstrap section IDs
        const sectionMap = {
            'events': 'main-page',
            'register': 'registration',
            'calendar': 'calendar',
            'dashboard': 'dashboard',
            'leaders': 'leaders'
        };
        
        const targetSection = sectionMap[sectionId] || sectionId;
        
        // Update active section
        document.querySelectorAll('main section').forEach(section => {
            section.classList.remove('active');
        });
        
        const sectionElement = document.getElementById(targetSection);
        if (sectionElement) {
            sectionElement.classList.add('active');
        }

        // Update active nav button in sidebar
        document.querySelectorAll('.sidebar .nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-section') === targetSection) {
                link.classList.add('active');
            }
        });

        this.currentSection = targetSection;

        // Load section-specific data
        if (targetSection === 'calendar' && !window.calendarInitialized) {
            this.initCalendar();
        } else if (targetSection === 'dashboard') {
            this.loadDashboard();
        } else if (targetSection === 'leaders') {
            this.loadLeaders();
        } else if (targetSection === 'announcements') {
            this.loadAnnouncements();
        }
    }

    toggleMobileMenu() {
        const menu = document.getElementById('mobileMenu');
        if (menu) {
            menu.classList.toggle('active');
        }
    }

    // Events Management
    async loadEvents() {
        const loadingEl = document.getElementById('events-loading');
        const gridEl = document.getElementById('event-list');
        const noEventsEl = document.getElementById('no-events');

        try {
            if (loadingEl) loadingEl.style.display = 'block';
            if (noEventsEl) noEventsEl.style.display = 'none';

            const response = await fetch(`${CONFIG.API_URL}?action=${CONFIG.ENDPOINTS.GET_EVENTS}`);
            const data = await response.json();

            if (data.success && data.events) {
                // Filter to show only today and future events
                const today = new Date();
                today.setHours(0, 0, 0, 0); // Set to start of day for comparison
                
                const upcomingEvents = data.events.filter(event => {
                    const eventDate = new Date(event.eventDate);
                    eventDate.setHours(0, 0, 0, 0);
                    return eventDate >= today; // Only events from today onwards
                });

                this.events = upcomingEvents;
                this.displayEvents(upcomingEvents);
                this.populateEventDropdown(upcomingEvents);
                this.populateDepartmentFilter(upcomingEvents);
            } else {
                throw new Error(data.message || 'Failed to load events');
            }
        } catch (error) {
            console.error('Error loading events:', error);
            if (gridEl) {
                gridEl.innerHTML = `
                    <div class="col-12">
                        <div class="alert alert-danger" role="alert">
                            <i class="fas fa-exclamation-triangle"></i>
                            <strong>Error loading events.</strong> Please check your API configuration and try again.
                        </div>
                    </div>
                `;
            }
        } finally {
            if (loadingEl) loadingEl.style.display = 'none';
        }
    }

    displayEvents(events) {
        const gridEl = document.getElementById('event-list');
        const noEventsEl = document.getElementById('no-events');

        if (!gridEl) return;

        gridEl.innerHTML = '';

        if (!events || events.length === 0) {
            if (noEventsEl) noEventsEl.style.display = 'block';
            return;
        }

        if (noEventsEl) noEventsEl.style.display = 'none';

        events.forEach(event => {
            const card = this.createEventCard(event);
            gridEl.appendChild(card);
        });
    }

    createEventCard(event) {
        const card = document.createElement('div');
        card.className = 'col-md-4 mb-3';

        const availability = (event.maxCapacity || 0) - (event.currentRegistrations || 0);
        const statusClass = event.approvalStatus === 'Approved' ? 'success' : 'warning';
        const availabilityColor = availability > 10 ? 'success' : availability > 0 ? 'warning' : 'danger';

        card.innerHTML = `
            <div class="card card-cpd shadow-sm h-100">
                <div class="card-body">
                    <h5 class="card-title">${this.escapeHtml(event.eventName || 'Untitled Event')}</h5>
                    <h6 class="card-subtitle mb-3 text-muted">
                        <i class="fas fa-calendar"></i> ${this.formatDate(event.eventDate)} | 
                        <i class="fas fa-clock"></i> ${event.duration || 'TBA'} hours
                    </h6>
                    <p class="card-text">
                        <strong><i class="fas fa-map-marker-alt"></i> Venue:</strong> ${this.escapeHtml(event.venue || 'TBA')}<br>
                        <strong><i class="fas fa-chalkboard-teacher"></i> Facilitator:</strong> ${this.escapeHtml(event.facilitator || 'TBA')}<br>
                        <strong><i class="fas fa-building"></i> Department:</strong> ${this.escapeHtml(event.department || 'All')}<br>
                        <strong><i class="fas fa-users"></i> Available:</strong> 
                        <span class="badge bg-${availabilityColor}">${availability} / ${event.maxCapacity || 'Unlimited'}</span>
                    </p>
                    <p class="card-text">
                        Status: <span class="badge bg-${statusClass}">${this.escapeHtml(event.approvalStatus || 'Pending')}</span>
                    </p>
                    <div class="d-grid gap-2">
                        <button class="btn btn-primary btn-sm" onclick="app.quickRegister('${event.eventId}')">
                            <i class="fas fa-user-plus"></i> Register Now
                        </button>
                        <button class="btn btn-outline-secondary btn-sm" onclick="app.showEventDetails('${event.eventId}')">
                            <i class="fas fa-info-circle"></i> View Details
                        </button>
                    </div>
                </div>
            </div>
        `;

        return card;
    }

    populateEventDropdown(events) {
        const select = document.getElementById('cpdEvent');
        if (!select) return;

        select.innerHTML = '<option value="">Select an upcoming event...</option>';

        events.forEach(event => {
            const option = document.createElement('option');
            option.value = event.eventId;
            option.textContent = `${event.eventName} - ${this.formatDate(event.eventDate)}`;
            option.dataset.eventData = JSON.stringify(event);
            select.appendChild(option);
        });
    }

    populateDepartmentFilter(events) {
        const filter = document.getElementById('filter-department');
        if (!filter) return;

        const departments = [...new Set(events.map(e => e.department).filter(d => d))];
        
        filter.innerHTML = '<option value="">All Departments</option>';
        departments.forEach(dept => {
            const option = document.createElement('option');
            option.value = dept;
            option.textContent = dept;
            filter.appendChild(option);
        });
    }

    filterEvents() {
        const searchTerm = document.getElementById('search-events')?.value.toLowerCase() || '';
        const deptFilter = document.getElementById('filter-department')?.value || '';
        const statusFilter = document.getElementById('filter-status')?.value || '';

        const filtered = this.events.filter(event => {
            const matchesSearch = !searchTerm || 
                (event.eventName || '').toLowerCase().includes(searchTerm) ||
                (event.description || '').toLowerCase().includes(searchTerm) ||
                (event.facilitator || '').toLowerCase().includes(searchTerm);

            const matchesDept = !deptFilter || event.department === deptFilter;
            const matchesStatus = !statusFilter || event.approvalStatus === statusFilter;

            return matchesSearch && matchesDept && matchesStatus;
        });

        this.displayEvents(filtered);
    }

    quickRegister(eventId) {
        // Switch to registration section
        document.querySelectorAll('.sidebar .nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-section') === 'registration') {
                link.classList.add('active');
            }
        });
        
        document.querySelectorAll('main section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById('registration').classList.add('active');
        
        // Set the event
        const select = document.getElementById('cpdEvent');
        if (select) {
            select.value = eventId;
        }
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    showEventDetails(eventId) {
        const event = this.events.find(e => e.eventId === eventId);
        if (!event) return;

        const content = document.getElementById('event-modal-content');
        const availability = (event.maxCapacity || 0) - (event.currentRegistrations || 0);
        const statusClass = event.approvalStatus === 'Approved' ? 'success' : 'warning';

        content.innerHTML = `
            <h4>${this.escapeHtml(event.eventName)}</h4>
            <div class="mb-3">
                <span class="badge bg-${statusClass} fs-6">
                    ${this.escapeHtml(event.approvalStatus || 'Pending')}
                </span>
            </div>
            
            <div class="row">
                <div class="col-md-6">
                    <p><strong><i class="fas fa-calendar text-primary"></i> Date:</strong><br>${this.formatDate(event.eventDate)}</p>
                    <p><strong><i class="fas fa-clock text-primary"></i> Duration:</strong><br>${event.duration || 'TBA'} hours</p>
                    <p><strong><i class="fas fa-map-marker-alt text-primary"></i> Venue:</strong><br>${this.escapeHtml(event.venue || 'TBA')}</p>
                </div>
                <div class="col-md-6">
                    <p><strong><i class="fas fa-chalkboard-teacher text-primary"></i> Facilitator:</strong><br>${this.escapeHtml(event.facilitator || 'TBA')}</p>
                    <p><strong><i class="fas fa-building text-primary"></i> Department:</strong><br>${this.escapeHtml(event.department || 'All Departments')}</p>
                    <p><strong><i class="fas fa-hospital text-primary"></i> Unit:</strong><br>${this.escapeHtml(event.unit || 'All Units')}</p>
                </div>
            </div>

            <hr>

            <div class="alert alert-info">
                <p class="mb-1"><strong><i class="fas fa-users"></i> Capacity:</strong> ${event.currentRegistrations || 0} / ${event.maxCapacity || 'Unlimited'} registered</p>
                <p class="mb-0"><strong><i class="fas fa-check-circle"></i> Available Seats:</strong> ${availability > 0 ? availability : 'Full'}</p>
            </div>

            ${event.description ? `
                <div class="mt-3">
                    <h5><i class="fas fa-info-circle"></i> Description</h5>
                    <p>${this.escapeHtml(event.description)}</p>
                </div>
            ` : ''}

            <div class="d-grid gap-2 mt-4">
                <button class="btn btn-primary btn-lg" onclick="app.quickRegister('${event.eventId}'); app.closeEventModal();">
                    <i class="fas fa-user-plus"></i> Register for This Event
                </button>
            </div>
        `;

        if (this.eventModal) {
            this.eventModal.show();
        }
    }

    closeEventModal() {
        if (this.eventModal) {
            this.eventModal.hide();
        }
    }

    // Registration
    async handleRegistration(e) {
        e.preventDefault();

        const eventId = document.getElementById('cpdEvent').value;
        const staffId = document.getElementById('staffId').value.trim();
        const messageDiv = document.getElementById('form-message');
        const submitBtn = e.target.querySelector('button[type="submit"]');

        // Validation
        if (!eventId) {
            this.showMessage(messageDiv, '<i class="fas fa-exclamation-circle"></i> Please select an event', 'danger');
            return;
        }

        if (!staffId) {
            this.showMessage(messageDiv, '<i class="fas fa-exclamation-circle"></i> Please enter Staff ID', 'danger');
            return;
        }

        // Check department restriction for Leaders
        const currentUser = authManager.getUser();
        if (currentUser && currentUser.permissions && currentUser.permissions.departmentRestricted) {
            try {
                // Verify staff department matches user's department
                const staffResponse = await fetch(`${CONFIG.API_URL}?action=${CONFIG.ENDPOINTS.GET_STAFF}&staffId=${staffId}`);
                const staffData = await staffResponse.json();
                
                if (staffData.success && staffData.staff) {
                    if (staffData.staff.department !== currentUser.department) {
                        this.showMessage(messageDiv, 
                            `<i class="fas fa-exclamation-triangle"></i> <strong>Access Denied:</strong> You can only register staff from your department (${currentUser.department}). This staff member is from ${staffData.staff.department}.`, 
                            'danger');
                        return;
                    }
                }
            } catch (error) {
                console.error('Error verifying staff department:', error);
                this.showMessage(messageDiv, '<i class="fas fa-times-circle"></i> Error validating staff information', 'danger');
                return;
            }
        }

        // Disable button and show loading
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Submitting...';

        try {
            const formData = new URLSearchParams();
            formData.append('action', CONFIG.ENDPOINTS.REGISTER_STAFF);
            formData.append('eventId', eventId);
            formData.append('staffId', staffId);

            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString()
            });

            const data = await response.json();

            if (data.success) {
                this.showMessage(messageDiv, `<i class="fas fa-check-circle"></i> ${data.message || 'Registration successful!'}`, 'success');
                e.target.reset();
                document.getElementById('staff-preview').style.display = 'none';
                
                // Refresh events to update counts
                setTimeout(() => {
                    this.loadEvents();
                }, 1000);
            } else {
                this.showMessage(messageDiv, `<i class="fas fa-times-circle"></i> ${data.message || 'Registration failed'}`, 'danger');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showMessage(messageDiv, '<i class="fas fa-times-circle"></i> Registration failed. Please try again.', 'danger');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Registration';
        }
    }

    async previewStaffDetails() {
        const staffId = document.getElementById('staffId').value.trim();
        const previewDiv = document.getElementById('staff-preview');
        const previewContent = document.getElementById('staff-preview-content');

        if (!staffId) {
            previewDiv.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`${CONFIG.API_URL}?action=${CONFIG.ENDPOINTS.GET_STAFF}&staffId=${staffId}`);
            const data = await response.json();

            if (data.success && data.staff) {
                const staff = data.staff;
                
                // Check department restriction for Leaders
                const currentUser = authManager.getUser();
                if (currentUser && currentUser.permissions && currentUser.permissions.departmentRestricted) {
                    if (staff.department !== currentUser.department) {
                        previewContent.innerHTML = `
                            <div class="alert alert-danger mb-0">
                                <i class="fas fa-exclamation-triangle"></i> 
                                <strong>Access Denied:</strong> You can only register staff from your department (${this.escapeHtml(currentUser.department)}).
                                <br>This staff member is from: ${this.escapeHtml(staff.department)}
                            </div>
                        `;
                        previewDiv.className = 'alert alert-danger';
                        previewDiv.style.display = 'block';
                        
                        // Disable submit button
                        const submitBtn = document.querySelector('#cpd-registration-form button[type="submit"]');
                        if (submitBtn) {
                            submitBtn.disabled = true;
                        }
                        return;
                    }
                }
                
                // Staff is valid - show details
                previewContent.innerHTML = `
                    <p class="mb-1"><strong><i class="fas fa-user"></i> Name:</strong> ${this.escapeHtml(staff.name)}</p>
                    <p class="mb-1"><strong><i class="fas fa-building"></i> Department:</strong> ${this.escapeHtml(staff.department)}</p>
                    <p class="mb-1"><strong><i class="fas fa-hospital"></i> Unit:</strong> ${this.escapeHtml(staff.unit)}</p>
                    <p class="mb-0"><strong><i class="fas fa-envelope"></i> Email:</strong> ${this.escapeHtml(staff.email)}</p>
                `;
                previewDiv.className = 'alert alert-info';
                previewDiv.style.display = 'block';
                
                // Enable submit button
                const submitBtn = document.querySelector('#cpd-registration-form button[type="submit"]');
                if (submitBtn) {
                    submitBtn.disabled = false;
                }
            } else {
                previewDiv.style.display = 'none';
                
                // Enable submit button (will fail validation later if needed)
                const submitBtn = document.querySelector('#cpd-registration-form button[type="submit"]');
                if (submitBtn) {
                    submitBtn.disabled = false;
                }
            }
        } catch (error) {
            console.error('Error fetching staff details:', error);
            previewDiv.style.display = 'none';
        }
    }

    // Calendar
    async initCalendar() {
        try {
            const calendarEl = document.getElementById('full-calendar-container');
            if (!calendarEl) return;

            const events = this.events.map(event => ({
                title: event.eventName,
                start: event.eventDate,
                color: event.approvalStatus === 'Approved' ? '#28a745' : '#ffc107',
                extendedProps: {
                    eventId: event.eventId,
                    venue: event.venue,
                    facilitator: event.facilitator,
                    duration: event.duration,
                    description: event.description
                }
            }));

            this.calendar = new FullCalendar.Calendar(calendarEl, {
                initialView: CONFIG.UI.CALENDAR_VIEW,
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,listWeek'
                },
                events: events,
                eventClick: (info) => {
                    this.showEventDetails(info.event.extendedProps.eventId);
                },
                height: 'auto',
                eventTimeFormat: {
                    hour: '2-digit',
                    minute: '2-digit',
                    meridiem: true
                }
            });

            this.calendar.render();
            window.calendarInitialized = true;
        } catch (error) {
            console.error('Error initializing calendar:', error);
        }
    }

    // Dashboard
    async loadDashboard(selectedYear = null) {
        const loadingEl = document.getElementById('dashboard-loading');
        const contentEl = document.getElementById('dashboard-content');

        try {
            if (loadingEl) loadingEl.style.display = 'block';
            if (contentEl) contentEl.style.display = 'none';

            // Check if API URL is configured
            if (!CONFIG.API_URL || CONFIG.API_URL.includes('YOUR_DEPLOYMENT_ID')) {
                throw new Error('API URL not configured. Please update config.js with your Google Apps Script URL.');
            }

            // Build URL with optional year parameter
            let url = `${CONFIG.API_URL}?action=${CONFIG.ENDPOINTS.GET_DASHBOARD}`;
            if (selectedYear) {
                url += `&year=${selectedYear}`;
            }

            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Dashboard data received:', data); // Debug log

            if (data.success) {
                // Populate year filter dropdown if not already done
                if (data.filterInfo && data.filterInfo.availableYears) {
                    this.populateYearFilter(data.filterInfo);
                }
                
                // Update filter info display
                if (data.filterInfo) {
                    const infoEl = document.getElementById('year-filter-info');
                    if (infoEl) {
                        if (data.filterInfo.showAllYears) {
                            infoEl.innerHTML = `<i class="fas fa-globe"></i> Showing data for <strong>all years</strong> (${data.filterInfo.availableYears.join(', ')})`;
                        } else {
                            const year = data.filterInfo.selectedYear;
                            const isCurrent = year === data.filterInfo.currentYear;
                            infoEl.innerHTML = isCurrent ? 
                                `<i class="fas fa-calendar-check"></i> Showing data for current year (<strong>${year}</strong>)` :
                                `<i class="fas fa-filter"></i> Filtered by year: <strong>${year}</strong>`;
                        }
                    }
                }
                
                // Update KPIs
                this.displayKPIs(data.kpis);
                
                // Render all charts
                this.displayEventsPerMonthChart(data.eventsPerMonth);
                this.displayParticipantsPerEventChart(data.participantsPerEvent);
                this.displayParticipantsPerDeptChart(data.participantsPerDept);
                this.displayParticipantsPerUnitChart(data.participantsPerUnit);
                this.displayStaffPerDeptChart(data.staffPerDept);
                this.displayDepartmentSummaryTable(data.departmentSummary);
                
                if (contentEl) contentEl.style.display = 'block';
            } else {
                throw new Error(data.message || 'Failed to load dashboard');
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
            if (loadingEl) {
                let errorMessage = 'Failed to load dashboard data.';
                
                if (error.message.includes('API URL not configured')) {
                    errorMessage = `
                        <div class="alert alert-warning" role="alert">
                            <h5><i class="fas fa-exclamation-triangle"></i> API Not Configured</h5>
                            <p>Please configure your Google Apps Script API URL in <code>config.js</code></p>
                            <hr>
                            <p class="mb-0">
                                <strong>Steps:</strong><br>
                                1. Deploy your Google Apps Script<br>
                                2. Copy the deployment URL<br>
                                3. Update <code>config.js</code> with the URL
                            </p>
                        </div>
                    `;
                } else if (error.message.includes('HTTP error')) {
                    errorMessage = `
                        <div class="alert alert-danger" role="alert">
                            <h5><i class="fas fa-times-circle"></i> Connection Error</h5>
                            <p>${error.message}</p>
                            <p class="mb-0">Please check your API URL and deployment settings.</p>
                        </div>
                    `;
                } else {
                    errorMessage = `
                        <div class="alert alert-danger" role="alert">
                            <h5><i class="fas fa-times-circle"></i> Error Loading Dashboard</h5>
                            <p>${error.message}</p>
                            <p class="mb-0">Please check the browser console for more details.</p>
                        </div>
                    `;
                }
                
                loadingEl.innerHTML = errorMessage;
                loadingEl.style.display = 'block';
            }
        }
    }

    populateYearFilter(filterInfo) {
        const yearSelect = document.getElementById('year-filter');
        if (!yearSelect) return;
        
        // Only populate once
        if (yearSelect.options.length > 0) {
            // Update selected value
            yearSelect.value = filterInfo.selectedYear.toString();
            return;
        }
        
        // Add "All Years" option
        const allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = 'All Years';
        yearSelect.appendChild(allOption);
        
        // Add year options
        filterInfo.availableYears.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            if (year === filterInfo.selectedYear) {
                option.selected = true;
            }
            yearSelect.appendChild(option);
        });
    }

    filterDashboardByYear() {
        const yearSelect = document.getElementById('year-filter');
        if (!yearSelect) return;
        
        const selectedYear = yearSelect.value;
        console.log('Filtering dashboard by year:', selectedYear || 'All Years');
        
        // Update info message immediately
        const infoEl = document.getElementById('year-filter-info');
        if (infoEl) {
            if (selectedYear === '') {
                infoEl.innerHTML = '<i class="fas fa-globe"></i> Showing data for <strong>all years</strong>';
            } else {
                infoEl.innerHTML = `<i class="fas fa-filter"></i> Filtering data for year: <strong>${selectedYear}</strong>`;
            }
        }
        
        // Reload dashboard with selected year
        this.loadDashboard(selectedYear || null);
    }

    displayKPIs(kpis) {
        // Update individual KPI cards
        const totalStaffEl = document.getElementById('kpi-total-staff');
        const uniqueParticipantsEl = document.getElementById('kpi-unique-participants');
        const totalRegistrationsEl = document.getElementById('kpi-total-registrations');
        const totalEventsEl = document.getElementById('kpi-total-events');
        const avgHoursEl = document.getElementById('kpi-avg-hours');

        if (totalStaffEl) totalStaffEl.textContent = kpis.totalStaff || 0;
        if (uniqueParticipantsEl) uniqueParticipantsEl.textContent = kpis.totalParticipants || 0;
        if (totalRegistrationsEl) totalRegistrationsEl.textContent = kpis.totalRegistrations || 0;
        if (totalEventsEl) totalEventsEl.textContent = kpis.totalEvents || 0;
        if (avgHoursEl) avgHoursEl.textContent = kpis.avgCPDHours || 0;
    }

    displayDepartmentChart(deptStats) {
        const ctx = document.getElementById('deptChart');
        if (!ctx) return;

        if (this.charts.department) {
            this.charts.department.destroy();
        }

        this.charts.department = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: deptStats.labels || [],
                datasets: [{
                    label: 'Staff per Department',
                    data: deptStats.values || [],
                    backgroundColor: 'rgba(102, 126, 234, 0.8)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 2,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }

    displayComplianceChart(kpis) {
        const ctx = document.getElementById('complianceChart');
        if (!ctx) return;

        if (this.charts.compliance) {
            this.charts.compliance.destroy();
        }

        const compliantPercent = parseFloat(kpis.complianceRate) || 0;
        const nonCompliantPercent = 100 - compliantPercent;

        this.charts.compliance = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Compliant', 'Non-Compliant'],
                datasets: [{
                    data: [compliantPercent, nonCompliantPercent],
                    backgroundColor: [
                        'rgba(72, 187, 120, 0.8)',
                        'rgba(237, 137, 54, 0.8)'
                    ],
                    borderColor: [
                        'rgba(72, 187, 120, 1)',
                        'rgba(237, 137, 54, 1)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    // New Dashboard Chart Functions
    displayEventsPerMonthChart(data) {
        const ctx = document.getElementById('eventsPerMonthChart');
        if (!ctx) return;

        if (this.charts.eventsPerMonth) {
            this.charts.eventsPerMonth.destroy();
        }

        this.charts.eventsPerMonth = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: data.labels || [],
                datasets: [{
                    label: 'Events',
                    data: data.values || [],
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }

    displayParticipantsPerEventChart(data) {
        const ctx = document.getElementById('participantsPerEventChart');
        if (!ctx) return;

        if (this.charts.participantsPerEvent) {
            this.charts.participantsPerEvent.destroy();
        }

        this.charts.participantsPerEvent = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: data.labels || [],
                datasets: [{
                    label: 'Participants',
                    data: data.values || [],
                    backgroundColor: 'rgba(75, 192, 192, 0.8)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }

    displayParticipantsPerDeptChart(data) {
        const ctx = document.getElementById('participantsPerDeptChart');
        if (!ctx) return;

        if (this.charts.participantsPerDept) {
            this.charts.participantsPerDept.destroy();
        }

        this.charts.participantsPerDept = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: data.labels || [],
                datasets: [{
                    label: 'Participants',
                    data: data.values || [],
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.8)',
                        'rgba(54, 162, 235, 0.8)',
                        'rgba(255, 206, 86, 0.8)',
                        'rgba(75, 192, 192, 0.8)',
                        'rgba(153, 102, 255, 0.8)',
                        'rgba(255, 159, 64, 0.8)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right'
                    }
                }
            }
        });
    }

    displayParticipantsPerUnitChart(data) {
        const ctx = document.getElementById('participantsPerUnitChart');
        if (!ctx) return;

        if (this.charts.participantsPerUnit) {
            this.charts.participantsPerUnit.destroy();
        }

        this.charts.participantsPerUnit = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: data.labels || [],
                datasets: [{
                    label: 'Participants',
                    data: data.values || [],
                    backgroundColor: 'rgba(153, 102, 255, 0.8)',
                    borderColor: 'rgba(153, 102, 255, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }

    displayStaffPerDeptChart(data) {
        const ctx = document.getElementById('staffPerDeptChart');
        if (!ctx) return;

        if (this.charts.staffPerDept) {
            this.charts.staffPerDept.destroy();
        }

        this.charts.staffPerDept = new Chart(ctx.getContext('2d'), {
            type: 'pie',
            data: {
                labels: data.labels || [],
                datasets: [{
                    label: 'Staff Count',
                    data: data.values || [],
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.8)',
                        'rgba(54, 162, 235, 0.8)',
                        'rgba(255, 206, 86, 0.8)',
                        'rgba(75, 192, 192, 0.8)',
                        'rgba(153, 102, 255, 0.8)',
                        'rgba(255, 159, 64, 0.8)',
                        'rgba(199, 199, 199, 0.8)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right'
                    }
                }
            }
        });
    }

    displayDepartmentSummaryTable(departments) {
        const tableBody = document.getElementById('departmentSummaryTable')?.querySelector('tbody');
        if (!tableBody) return;

        tableBody.innerHTML = '';

        if (!departments || departments.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No data available</td></tr>';
            return;
        }

        departments.forEach(dept => {
            const row = document.createElement('tr');
            const rateClass = dept.participationRate >= 75 ? 'success' : 
                             dept.participationRate >= 50 ? 'warning' : 'danger';
            
            row.innerHTML = `
                <td><strong>${this.escapeHtml(dept.department)}</strong></td>
                <td>${dept.totalStaff}</td>
                <td>${dept.participants}</td>
                <td><span class="badge bg-${rateClass}">${dept.participationRate}%</span></td>
                <td>${dept.nonParticipants}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    // Board of Leaders
    async loadLeaders() {
        const loadingEl = document.getElementById('leaders-loading');
        const gridEl = document.getElementById('leaders-grid');
        const noLeadersEl = document.getElementById('no-leaders');

        try {
            loadingEl.style.display = 'block';
            gridEl.innerHTML = '';
            noLeadersEl.style.display = 'none';

            const response = await fetch(`${CONFIG.API_URL}?action=${CONFIG.ENDPOINTS.GET_LEADERS}`);
            const data = await response.json();

            if (data.success && data.leaders) {
                this.displayLeaders(data.leaders);
            } else {
                noLeadersEl.style.display = 'block';
            }
        } catch (error) {
            console.error('Error loading leaders:', error);
            noLeadersEl.style.display = 'block';
        } finally {
            loadingEl.style.display = 'none';
        }
    }

    displayLeaders(leaders) {
        const gridEl = document.getElementById('leader-list');
        const noLeadersEl = document.getElementById('no-leaders');

        if (!leaders || leaders.length === 0) {
            gridEl.innerHTML = '';
            noLeadersEl.style.display = 'block';
            return;
        }

        gridEl.innerHTML = '';
        noLeadersEl.style.display = 'none';

        leaders.forEach(leader => {
            const item = document.createElement('li');
            item.className = 'list-group-item';
            item.innerHTML = `
                <div class="d-flex w-100 justify-content-between align-items-start">
                    <div>
                        <h5 class="mb-1"><i class="fas fa-user-tie text-primary"></i> ${this.escapeHtml(leader.name)}</h5>
                        <p class="mb-1"><strong>Position:</strong> ${this.escapeHtml(leader.designation)}</p>
                        <p class="mb-1"><strong>Department:</strong> ${this.escapeHtml(leader.department)}</p>
                        <p class="mb-1"><i class="fas fa-envelope text-primary"></i> ${this.escapeHtml(leader.email)}</p>
                        ${leader.phone ? `<p class="mb-0"><i class="fas fa-phone text-primary"></i> ${this.escapeHtml(leader.phone)}</p>` : ''}
                    </div>
                </div>
            `;
            gridEl.appendChild(item);
        });
    }

    // Announcements
    async loadAnnouncements() {
        const loadingEl = document.getElementById('announcements-loading');
        const listEl = document.getElementById('announcements-list');
        const noAnnouncementsEl = document.getElementById('no-announcements');

        try {
            if (loadingEl) loadingEl.style.display = 'block';
            if (listEl) listEl.innerHTML = '';
            if (noAnnouncementsEl) noAnnouncementsEl.style.display = 'none';

            const response = await fetch(`${CONFIG.API_URL}?action=${CONFIG.ENDPOINTS.GET_ANNOUNCEMENTS}`);
            const data = await response.json();

            if (data.success && data.announcements && data.announcements.length > 0) {
                this.displayAnnouncements(data.announcements);
            } else {
                if (noAnnouncementsEl) noAnnouncementsEl.style.display = 'block';
            }
        } catch (error) {
            console.error('Error loading announcements:', error);
            if (noAnnouncementsEl) noAnnouncementsEl.style.display = 'block';
        } finally {
            if (loadingEl) loadingEl.style.display = 'none';
        }
    }

    displayAnnouncements(announcements) {
        const listEl = document.getElementById('announcements-list');
        const noAnnouncementsEl = document.getElementById('no-announcements');

        if (!announcements || announcements.length === 0) {
            if (listEl) listEl.innerHTML = '';
            if (noAnnouncementsEl) noAnnouncementsEl.style.display = 'block';
            return;
        }

        if (listEl) listEl.innerHTML = '';
        if (noAnnouncementsEl) noAnnouncementsEl.style.display = 'none';

        announcements.forEach(announcement => {
            const priorityClass = {
                'High': 'danger',
                'Medium': 'warning',
                'Normal': 'info',
                'Low': 'secondary'
            }[announcement.priority] || 'info';

            const priorityIcon = {
                'High': 'exclamation-triangle',
                'Medium': 'exclamation-circle',
                'Normal': 'info-circle',
                'Low': 'info-circle'
            }[announcement.priority] || 'info-circle';

            const card = document.createElement('div');
            card.className = `alert alert-${priorityClass} border-start border-5 border-${priorityClass}`;
            card.innerHTML = `
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <h5 class="alert-heading mb-0">
                        <i class="fas fa-${priorityIcon}"></i> ${this.escapeHtml(announcement.title)}
                    </h5>
                    <span class="badge bg-${priorityClass}">${this.escapeHtml(announcement.priority)}</span>
                </div>
                <p class="mb-2">${this.escapeHtml(announcement.message)}</p>
                <hr>
                <small class="d-flex justify-content-between">
                    <span><i class="fas fa-calendar"></i> ${this.formatDate(announcement.createdDate)}</span>
                    ${announcement.expiryDate ? `<span><i class="fas fa-clock"></i> Expires: ${this.formatDate(announcement.expiryDate)}</span>` : ''}
                </small>
            `;
            listEl.appendChild(card);
        });
    }

    // Utility Functions
    showMessage(element, message, type) {
        // Map old types to Bootstrap alert classes
        const typeMap = {
            'error': 'danger',
            'success': 'success',
            'info': 'info',
            'warning': 'warning'
        };
        
        const alertType = typeMap[type] || type;
        element.innerHTML = `<div class="alert alert-${alertType} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>`;
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            element.innerHTML = '';
        }, 5000);
    }

    formatDate(dateString) {
        if (!dateString) return 'TBA';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app when DOM is ready
let app;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        app = new NursingCPDApp();
    });
} else {
    app = new NursingCPDApp();
}
