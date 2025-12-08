// Configuration File
// Replace the API_URL with your deployed Google Apps Script Web App URL

const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycby155KxqmvJPYLx2CQ850i9DEey1FrbI9R79grZ_-BnhaGgGOzl_c8DMdT7onFsMGUWcw/exec',

    // Application Settings
    APP_NAME: 'Nursing CPD Portal',
    HOSPITAL_NAME: 'Nizwa Hospital',
    
    // Feature Flags
    FEATURES: {
        EVENT_REGISTRATION: true,
        DASHBOARD_ANALYTICS: true,
        BOARD_OF_LEADERS: true,
        EMAIL_NOTIFICATIONS: false, // Enable when email functionality is added
    },
    
    // UI Settings
    UI: {
        EVENTS_PER_PAGE: 50,
        DEFAULT_DEPARTMENT: '',
        CALENDAR_VIEW: 'dayGridMonth', // dayGridMonth, timeGridWeek, timeGridDay
    },
    
    // Validation Rules
    VALIDATION: {
        STAFF_ID_MIN_LENGTH: 2,
        STAFF_ID_MAX_LENGTH: 10,
    },
    
    // API Endpoints (actions)
    ENDPOINTS: {
        LOGIN: 'login',
        GET_EVENTS: 'getUpcomingEvents',
        REGISTER_STAFF: 'registerStaff',
        GET_DASHBOARD: 'getDashboardData',
        GET_STAFF: 'getStaffDetails',
        GET_STAFF_BY_DEPARTMENT: 'getStaffByDepartment',
        GET_LEADERS: 'getBoardOfLeaders',
        GET_ANNOUNCEMENTS: 'getAnnouncements',
        UPDATE_PROFILE: 'updateProfile'
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
