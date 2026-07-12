/**
 * Nursing CPD Portal - Google Apps Script Backend
 * Deploy this as a Web App to create your API endpoint
 */

// Handle GET requests
function doGet(e) {
  var action = e.parameter.action;

  try {
    switch(action) {
      case 'login':
        return login(e.parameter.staffId);
      case 'getUpcomingEvents':
        return getUpcomingEvents();
      case 'getDashboardData':
        return getDashboardData(e.parameter.year);
      case 'getDepartmentSummary':
        return getDepartmentSummary(e.parameter.year, e.parameter.positions);
      case 'getStaffDetails':
        return getStaffDetails(e.parameter.staffId);
      case 'getStaffByDepartment':
        return getStaffByDepartment(e.parameter.department);
      case 'getBoardOfLeaders':
        return getBoardOfLeaders();
      case 'getAnnouncements':
        return getAnnouncements();
      case 'updateProfile':
        return updateProfile(e.parameter.staffId, e.parameter.email, e.parameter.phone);
      case 'createEvent':
        return createEvent(e.parameter);
      case 'createAnnouncement':
        return createAnnouncement(e.parameter);
      default:
        return createResponse({
          success: false,
          message: 'Invalid action'
        });
    }
  } catch (error) {
    return createResponse({
      success: false,
      message: 'Server error: ' + error.toString()
    });
  }
}

// Handle POST requests
function doPost(e) {
  var action = e.parameter.action;

  try {
    if (action === 'registerStaff') {
      return registerStaff(e);
    }

    return createResponse({
      success: false,
      message: 'Invalid action'
    });
  } catch (error) {
    return createResponse({
      success: false,
      message: 'Server error: ' + error.toString()
    });
  }
}

// Get upcoming events
function getUpcomingEvents() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('CPD');

  if (!sheet) {
    return createResponse({
      success: false,
      message: 'CPD sheet not found. Please create a sheet named "CPD"'
    });
  }

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return createResponse({
      success: true,
      events: []
    });
  }

  var headers = data[0];
  var events = [];

  // Get today's date at midnight for comparison
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    // Skip empty rows
    if (!row[0] && !row[1]) continue;

    var eventDate = new Date(row[2]); // Column C: Event Date
    eventDate.setHours(0, 0, 0, 0);

    // Only include events from today onwards (today and future dates)
    if (eventDate >= today) {
      events.push({
        eventId: row[0] || 'EVT' + i,
        eventName: row[1] || 'Untitled Event',
        eventDate: formatDate(eventDate),
        duration: row[3] || 0,
        department: row[4] || '',
        unit: row[5] || '',
        maxCapacity: row[6] || 999,
        currentRegistrations: row[7] || 0,
        approvalStatus: row[8] || 'Pending',
        description: row[9] || '',
        venue: row[10] || '',
        facilitator: row[11] || ''
      });
    }
  }

  // Sort by date (earliest first)
  events.sort(function(a, b) {
    return new Date(a.eventDate) - new Date(b.eventDate);
  });

  return createResponse({
    success: true,
    events: events
  });
}

// Register staff for an event
function registerStaff(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var registrationSheet = ss.getSheetByName('registration');
  var listSheet = ss.getSheetByName('List');
  var cpdSheet = ss.getSheetByName('CPD');

  // Validate sheets exist
  if (!registrationSheet) {
    return createResponse({
      success: false,
      message: 'Registration sheet not found. Please create a sheet named "registration"'
    });
  }

  if (!listSheet) {
    return createResponse({
      success: false,
      message: 'List sheet not found. Please create a sheet named "List"'
    });
  }

  var eventId = e.parameter.eventId;
  var staffId = e.parameter.staffId;

  if (!eventId || !staffId) {
    return createResponse({
      success: false,
      message: 'Event ID and Staff ID are required'
    });
  }

  // Get staff information
  var staffData = listSheet.getDataRange().getValues();
  var staffExists = false;
  var staffInfo = {};

  for (var i = 1; i < staffData.length; i++) {
    if (staffData[i][0].toString() === staffId.toString()) {
      staffExists = true;
      staffInfo = {
        name: staffData[i][1] || '',
        gender: staffData[i][2] || '',
        designation: staffData[i][3] || '',
        institution: staffData[i][4] || '',
        department: staffData[i][5] || '',
        unit: staffData[i][6] || '',
        experience: staffData[i][7] || '',
        email: staffData[i][8] || ''
      };
      break;
    }
  }

  if (!staffExists) {
    return createResponse({
      success: false,
      message: 'Invalid Staff ID. Please check your staff ID and try again.'
    });
  }

  // Check for duplicate registration
  var registrationData = registrationSheet.getDataRange().getValues();
  for (var i = 1; i < registrationData.length; i++) {
    if (registrationData[i][2] === eventId &&
        registrationData[i][3].toString() === staffId.toString()) {
      return createResponse({
        success: false,
        message: 'You are already registered for this event'
      });
    }
  }

  // Get event duration for CPD hours calculation
  var eventDuration = 0;
  if (cpdSheet) {
    var cpdData = cpdSheet.getDataRange().getValues();
    for (var i = 1; i < cpdData.length; i++) {
      if (cpdData[i][0] === eventId) {
        eventDuration = cpdData[i][3] || 0;
        break;
      }
    }
  }

  // Generate Registration ID
  var lastRow = registrationSheet.getLastRow();
  var regId = 'REG' + padLeft(lastRow, 4);

  // Append new registration
  registrationSheet.appendRow([
    regId,                      // A: Registration ID
    new Date(),                 // B: Timestamp
    eventId,                    // C: Event ID
    staffId,                    // D: Staff ID
    staffInfo.name,             // E: Staff Name
    staffInfo.email,            // F: Email
    staffInfo.department,       // G: Department
    staffInfo.unit,             // H: Unit
    'Confirmed',                // I: Registration Status
    eventDuration                // J: CPD Hours (optional)
  ]);

  // Update event registration count in CPD sheet
  if (cpdSheet) {
    updateEventRegistrationCount(cpdSheet, eventId);
  }

  return createResponse({
    success: true,
    message: 'Registration successful! You will receive a confirmation email shortly.',
    registrationId: regId,
    staffName: staffInfo.name
  });
}

// Get staff details
function getStaffDetails(staffId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var listSheet = ss.getSheetByName('List');

  if (!listSheet) {
    return createResponse({
      success: false,
      message: 'List sheet not found'
    });
  }

  if (!staffId) {
    return createResponse({
      success: false,
      message: 'Staff ID is required'
    });
  }

  var data = listSheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === staffId.toString()) {
      return createResponse({
        success: true,
        staff: {
          staffId: data[i][0],
          name: data[i][1],
          gender: data[i][2],
          designation: data[i][3],
          institution: data[i][4],
          department: data[i][5],
          unit: data[i][6],
          experience: data[i][7],
          email: data[i][8],
          phone: data[i][9] || '',
          dateJoined: data[i][10] || '',
          totalCPDHours: data[i][11] || 0,
          requiredCPDHours: data[i][12] || 20,
          complianceStatus: data[i][13] || 'Unknown',
          isLeader: data[i][14] || 'No'
        }
      });
    }
  }

  return createResponse({
    success: false,
    message: 'Staff ID not found'
  });
}

// Get staff filtered by department (for Leaders)
function getStaffByDepartment(department) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var listSheet = ss.getSheetByName('List');

  if (!listSheet) {
    return createResponse({
      success: false,
      message: 'List sheet not found'
    });
  }

  if (!department) {
    return createResponse({
      success: false,
      message: 'Department is required'
    });
  }

  var data = listSheet.getDataRange().getValues();
  var staffList = [];

  // Filter staff by department (Column F = index 5)
  for (var i = 1; i < data.length; i++) {
    var staffDept = data[i][5];
    if (staffDept && staffDept.toString().trim() === department.toString().trim()) {
      staffList.push({
        staffId: data[i][0],
        name: data[i][1],
        email: data[i][2],
        designation: data[i][4],
        department: data[i][5],
        unit: data[i][6]
      });
    }
  }

  return createResponse({
    success: true,
    count: staffList.length,
    staff: staffList
  });
}

/**
 * Categorize a raw Designation (List sheet Column D) into a staff-type
 * bucket used by the Department Summary staff-category filter.
 * Anything that doesn't match a known prefix falls into 'Other' so it is
 * still counted when no filter (or all categories) is selected.
 */
function getStaffCategory(designation) {
  var d = (designation || '').toString().trim().toUpperCase();
  if (d.indexOf('HCA') === 0) return 'HCA';
  if (d.indexOf('M.O') === 0 || d.indexOf('MO') === 0) return 'Medical Orderly';
  if (d.indexOf('GN') === 0 || d.indexOf('SN') === 0) return 'Nurse';
  return 'Other';
}

// Get dashboard data
function getDashboardData(filterYear) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var listSheet = ss.getSheetByName('List');
  var registrationSheet = ss.getSheetByName('registration');
  var cpdSheet = ss.getSheetByName('CPD');

  if (!listSheet || !registrationSheet || !cpdSheet) {
    return createResponse({
      success: false,
      message: 'Required sheets not found. Please ensure CPD, registration, and List sheets exist.'
    });
  }

  var listData = listSheet.getDataRange().getValues();
  var registrationData = registrationSheet.getDataRange().getValues();
  var cpdData = cpdSheet.getDataRange().getValues();

  // Determine filter year (default to current year if not provided)
  var currentYear = new Date().getFullYear();
  var selectedYear = filterYear ? parseInt(filterYear) : currentYear;
  var showAllYears = !filterYear; // If filterYear is null/empty, show all years

  // Get available years from CPD events
  var availableYears = {};
  for (var i = 1; i < cpdData.length; i++) {
    if (cpdData[i][2]) { // Column C: Event Date
      var eventDate = new Date(cpdData[i][2]);
      var year = eventDate.getFullYear();
      availableYears[year] = true;
    }
  }

  // Convert to sorted array
  var yearsArray = Object.keys(availableYears).map(function(y) { return parseInt(y); }).sort(function(a, b) { return b - a; });

  // Filter events by year (or include all if showAllYears)
  var filteredCpdData = [cpdData[0]]; // Keep headers
  var filteredEventIds = {};
  for (var i = 1; i < cpdData.length; i++) {
    if (cpdData[i][2]) {
      var eventDate = new Date(cpdData[i][2]);
      var eventYear = eventDate.getFullYear();
      if (showAllYears || eventYear === selectedYear) {
        filteredCpdData.push(cpdData[i]);
        filteredEventIds[cpdData[i][0]] = true; // Store Event ID
      }
    }
  }

  // Filter registrations by filtered event IDs
  var filteredRegistrationData = [registrationData[0]]; // Keep headers
  for (var i = 1; i < registrationData.length; i++) {
    var eventId = registrationData[i][2]; // Column C: Event ID
    if (filteredEventIds[eventId]) {
      filteredRegistrationData.push(registrationData[i]);
    }
  }

  // Use filtered data for calculations
  cpdData = filteredCpdData;
  registrationData = filteredRegistrationData;

  // Calculate Basic KPIs
  var totalStaff = listData.length - 1;
  var totalEvents = cpdData.length - 1;
  var totalRegistrations = registrationData.length - 1;

  // Calculate average CPD hours per staff
  var totalCPDHours = 0;
  for (var i = 1; i < listData.length; i++) {
    var hours = parseFloat(listData[i][11]) || 0;
    totalCPDHours += hours;
  }
  var avgCPDHours = totalStaff > 0 ? (totalCPDHours / totalStaff).toFixed(2) : 0;

  // Get unique participants (staff who registered at least once)
  var uniqueParticipants = {};
  for (var i = 1; i < registrationData.length; i++) {
    var staffId = registrationData[i][3]; // Column D: Staff ID
    if (staffId) {
      uniqueParticipants[staffId] = true;
    }
  }
  var totalParticipants = Object.keys(uniqueParticipants).length;

  // ===== EVENTS PER MONTH =====
  var eventsPerMonth = {};
  for (var i = 1; i < cpdData.length; i++) {
    if (!cpdData[i][2]) continue; // Skip if no date
    var eventDate = new Date(cpdData[i][2]);
    var monthKey = Utilities.formatDate(eventDate, Session.getScriptTimeZone(), 'MMM yyyy');
    eventsPerMonth[monthKey] = (eventsPerMonth[monthKey] || 0) + 1;
  }

  var monthLabels = [];
  var monthValues = [];
  for (var month in eventsPerMonth) {
    monthLabels.push(month);
    monthValues.push(eventsPerMonth[month]);
  }

  // ===== PARTICIPANTS PER EVENT =====
  var participantsPerEvent = {};
  var eventNames = {};
  for (var i = 1; i < registrationData.length; i++) {
    var eventId = registrationData[i][2]; // Column C: Event ID
    if (eventId) {
      participantsPerEvent[eventId] = (participantsPerEvent[eventId] || 0) + 1;
    }
  }

  // Get event names
  for (var i = 1; i < cpdData.length; i++) {
    var eventId = cpdData[i][0];
    var eventName = cpdData[i][1];
    if (eventId) {
      eventNames[eventId] = eventName;
    }
  }

  var eventLabels = [];
  var eventParticipants = [];
  for (var eventId in participantsPerEvent) {
    eventLabels.push(eventNames[eventId] || eventId);
    eventParticipants.push(participantsPerEvent[eventId]);
  }

  // ===== PARTICIPANTS PER DEPARTMENT =====
  var participantsByDept = {};
  for (var i = 1; i < registrationData.length; i++) {
    var dept = registrationData[i][6]; // Column G: Department
    if (dept) {
      participantsByDept[dept] = (participantsByDept[dept] || 0) + 1;
    }
  }

  var deptLabels = [];
  var deptParticipants = [];
  for (var dept in participantsByDept) {
    deptLabels.push(dept);
    deptParticipants.push(participantsByDept[dept]);
  }

  // ===== PARTICIPANTS PER UNIT =====
  var participantsByUnit = {};
  for (var i = 1; i < registrationData.length; i++) {
    var unit = registrationData[i][7]; // Column H: Unit
    if (unit) {
      participantsByUnit[unit] = (participantsByUnit[unit] || 0) + 1;
    }
  }

  var unitLabels = [];
  var unitParticipants = [];
  for (var unit in participantsByUnit) {
    unitLabels.push(unit);
    unitParticipants.push(participantsByUnit[unit]);
  }

  // ===== STAFF PER DEPARTMENT (from List sheet) =====
  var staffPerDept = {};
  for (var i = 1; i < listData.length; i++) {
    var dept = listData[i][5]; // Column F: Department
    if (dept) {
      staffPerDept[dept] = (staffPerDept[dept] || 0) + 1;
    }
  }

  var staffDeptLabels = [];
  var staffDeptCounts = [];
  for (var dept in staffPerDept) {
    staffDeptLabels.push(dept);
    staffDeptCounts.push(staffPerDept[dept]);
  }

  // ===== DEPARTMENT SUMMARY TABLE =====
  // Calculate unique participating staff per department
  var participatingStaffByDept = {};
  for (var i = 1; i < registrationData.length; i++) {
    var staffId = registrationData[i][3]; // Column D: Staff ID
    var dept = registrationData[i][6]; // Column G: Department
    if (staffId && dept) {
      if (!participatingStaffByDept[dept]) {
        participatingStaffByDept[dept] = {};
      }
      participatingStaffByDept[dept][staffId] = true;
    }
  }

  var departmentSummary = [];
  for (var dept in staffPerDept) {
    var totalInDept = staffPerDept[dept];
    var participatingCount = participatingStaffByDept[dept] ? Object.keys(participatingStaffByDept[dept]).length : 0;
    var nonParticipating = totalInDept - participatingCount;
    var participationRate = totalInDept > 0 ? ((participatingCount / totalInDept) * 100).toFixed(1) : 0;

    departmentSummary.push({
      department: dept,
      totalStaff: totalInDept,
      participants: participatingCount,
      participationRate: parseFloat(participationRate),
      nonParticipants: nonParticipating
    });
  }

  // Sort by participation rate (lowest first to highlight problem areas)
  departmentSummary.sort(function(a, b) {
    return a.participationRate - b.participationRate;
  });

  return createResponse({
    success: true,
    kpis: {
      totalStaff: totalStaff,
      totalEvents: totalEvents,
      totalRegistrations: totalRegistrations,
      totalParticipants: totalParticipants,
      avgCPDHours: avgCPDHours
    },
    eventsPerMonth: {
      labels: monthLabels,
      values: monthValues
    },
    participantsPerEvent: {
      labels: eventLabels,
      values: eventParticipants
    },
    participantsPerDept: {
      labels: deptLabels,
      values: deptParticipants
    },
    participantsPerUnit: {
      labels: unitLabels,
      values: unitParticipants
    },
    staffPerDept: {
      labels: staffDeptLabels,
      values: staffDeptCounts
    },
    departmentSummary: departmentSummary,
    filterInfo: {
      selectedYear: showAllYears ? 'All' : selectedYear,
      availableYears: yearsArray,
      currentYear: currentYear,
      showAllYears: showAllYears
    }
  });
}

/**
 * Get the Department Summary table only, optionally restricted to a set of
 * staff categories (Nurse / Medical Orderly / HCA - see getStaffCategory).
 * Used by the Department Summary staff-category filter so toggling it
 * doesn't have to re-fetch and redraw the whole dashboard (KPIs/charts).
 *
 * filterPositions: comma-separated category names (e.g. "Nurse,HCA").
 * Omitted/empty means no filter - every staff member counts, including any
 * designation that doesn't map to a known category - matching the default
 * "show all" behavior of getDashboardData's departmentSummary.
 */
function getDepartmentSummary(filterYear, filterPositions) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var listSheet = ss.getSheetByName('List');
  var registrationSheet = ss.getSheetByName('registration');
  var cpdSheet = ss.getSheetByName('CPD');

  if (!listSheet || !registrationSheet || !cpdSheet) {
    return createResponse({
      success: false,
      message: 'Required sheets not found. Please ensure CPD, registration, and List sheets exist.'
    });
  }

  var listData = listSheet.getDataRange().getValues();
  var registrationData = registrationSheet.getDataRange().getValues();
  var cpdData = cpdSheet.getDataRange().getValues();

  // Determine filter year (mirrors getDashboardData's year filter)
  var currentYear = new Date().getFullYear();
  var selectedYear = filterYear ? parseInt(filterYear) : currentYear;
  var showAllYears = !filterYear;

  var filteredEventIds = {};
  for (var i = 1; i < cpdData.length; i++) {
    if (cpdData[i][2]) {
      var eventYear = new Date(cpdData[i][2]).getFullYear();
      if (showAllYears || eventYear === selectedYear) {
        filteredEventIds[cpdData[i][0]] = true;
      }
    }
  }

  var filteredRegistrationData = [registrationData[0]];
  for (var i = 1; i < registrationData.length; i++) {
    if (filteredEventIds[registrationData[i][2]]) {
      filteredRegistrationData.push(registrationData[i]);
    }
  }
  registrationData = filteredRegistrationData;

  // Parse the selected staff-category filter
  var selectedCategories = null;
  if (filterPositions) {
    selectedCategories = {};
    filterPositions.toString().split(',').forEach(function(cat) {
      cat = cat.trim();
      if (cat) selectedCategories[cat] = true;
    });
    if (Object.keys(selectedCategories).length === 0) selectedCategories = null;
  }

  function passesFilter(category) {
    return !selectedCategories || selectedCategories[category] === true;
  }

  // Staff ID -> category lookup (built once) and filtered staff-per-department counts
  var staffCategoryById = {};
  var staffPerDept = {};
  for (var i = 1; i < listData.length; i++) {
    var staffId = listData[i][0];
    var dept = listData[i][5]; // Column F: Department
    var category = getStaffCategory(listData[i][3]); // Column D: Designation
    if (staffId) staffCategoryById[staffId.toString()] = category;
    if (dept && passesFilter(category)) {
      staffPerDept[dept] = (staffPerDept[dept] || 0) + 1;
    }
  }

  var participatingStaffByDept = {};
  for (var i = 1; i < registrationData.length; i++) {
    var staffId = registrationData[i][3]; // Column D: Staff ID
    var dept = registrationData[i][6]; // Column G: Department
    if (!staffId || !dept) continue;
    var category = staffCategoryById[staffId.toString()] || 'Other';
    if (!passesFilter(category)) continue;
    if (!participatingStaffByDept[dept]) participatingStaffByDept[dept] = {};
    participatingStaffByDept[dept][staffId] = true;
  }

  var departmentSummary = [];
  for (var dept in staffPerDept) {
    var totalInDept = staffPerDept[dept];
    var participatingCount = participatingStaffByDept[dept] ? Object.keys(participatingStaffByDept[dept]).length : 0;
    var nonParticipating = totalInDept - participatingCount;
    var participationRate = totalInDept > 0 ? ((participatingCount / totalInDept) * 100).toFixed(1) : 0;

    departmentSummary.push({
      department: dept,
      totalStaff: totalInDept,
      participants: participatingCount,
      participationRate: parseFloat(participationRate),
      nonParticipants: nonParticipating
    });
  }

  departmentSummary.sort(function(a, b) {
    return a.participationRate - b.participationRate;
  });

  return createResponse({
    success: true,
    departmentSummary: departmentSummary
  });
}

// Get board of leaders
function getBoardOfLeaders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var listSheet = ss.getSheetByName('List');

  if (!listSheet) {
    return createResponse({
      success: false,
      message: 'List sheet not found'
    });
  }

  var data = listSheet.getDataRange().getValues();
  var leaders = [];

  for (var i = 1; i < data.length; i++) {
    // Column O (index 14) contains Leadership Role
    if (data[i][14] === 'Yes' || data[i][14] === 'YES' || data[i][14] === true) {
      leaders.push({
        name: data[i][1] || '',
        designation: data[i][3] || '',
        department: data[i][5] || '',
        email: data[i][8] || '',
        phone: data[i][9] || ''
      });
    }
  }

  return createResponse({
    success: true,
    leaders: leaders
  });
}

// Get active announcements
function getAnnouncements() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var announcementSheet = ss.getSheetByName('Announcements');

  if (!announcementSheet) {
    return createResponse({
      success: false,
      message: 'Announcements sheet not found'
    });
  }

  var data = announcementSheet.getDataRange().getValues();
  var announcements = [];
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // Skip header row
  for (var i = 1; i < data.length; i++) {
    var status = data[i][5]; // Column F: Status
    var expiryDate = data[i][4]; // Column E: Expiry Date

    // Only show active announcements that haven't expired
    if (status === 'Active' || status === 'active') {
      var isExpired = false;
      if (expiryDate) {
        var expiry = new Date(expiryDate);
        expiry.setHours(0, 0, 0, 0);
        isExpired = expiry < today;
      }

      if (!isExpired) {
        announcements.push({
          id: data[i][0] || '',
          title: data[i][1] || '',
          message: data[i][2] || '',
          priority: data[i][3] || 'Normal',
          expiryDate: data[i][4] ? formatDate(data[i][4]) : '',
          createdDate: data[i][6] ? formatDate(data[i][6]) : '',
          createdBy: data[i][7] || ''
        });
      }
    }
  }

  // Sort by priority (High first) and then by date (newest first)
  announcements.sort(function(a, b) {
    var priorityOrder = {'High': 1, 'Medium': 2, 'Normal': 3, 'Low': 4};
    var aPriority = priorityOrder[a.priority] || 3;
    var bPriority = priorityOrder[b.priority] || 3;

    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    return new Date(b.createdDate) - new Date(a.createdDate);
  });

  return createResponse({
    success: true,
    count: announcements.length,
    announcements: announcements
  });
}

/**
 * Update staff profile (email and phone only)
 */
function updateProfile(staffId, email, phone) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var listSheet = ss.getSheetByName('List');

    if (!listSheet) {
      return createResponse({
        success: false,
        message: 'List sheet not found'
      });
    }

    // Validation
    if (!staffId || !email || !phone) {
      return createResponse({
        success: false,
        message: 'Staff ID, email, and phone are required'
      });
    }

    // Get all data
    var data = listSheet.getDataRange().getValues();
    var headers = data[0];

    // Find column indices
    var staffIdCol = headers.indexOf('Staff ID');
    var emailCol = headers.indexOf('Email');
    var phoneCol = headers.indexOf('Phone');

    if (staffIdCol === -1 || emailCol === -1 || phoneCol === -1) {
      return createResponse({
        success: false,
        message: 'Required columns not found in List sheet'
      });
    }

    // Find the staff member
    var staffRow = -1;
    for (var i = 1; i < data.length; i++) {
      if (data[i][staffIdCol].toString() === staffId.toString()) {
        staffRow = i;
        break;
      }
    }

    if (staffRow === -1) {
      return createResponse({
        success: false,
        message: 'Staff member not found'
      });
    }

    // Update email and phone (columns are 0-indexed in array, but 1-indexed in sheet)
    listSheet.getRange(staffRow + 1, emailCol + 1).setValue(email);
    listSheet.getRange(staffRow + 1, phoneCol + 1).setValue(phone);

    return createResponse({
      success: true,
      message: 'Profile updated successfully',
      data: {
        staffId: staffId,
        email: email,
        phone: phone
      }
    });

  } catch (error) {
    console.error('Error updating profile:', error);
    return createResponse({
      success: false,
      message: 'Error updating profile: ' + error.toString()
    });
  }
}

/**
 * Create new CPD event
 */
function createEvent(params) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var cpdSheet = ss.getSheetByName('CPD');

    if (!cpdSheet) {
      return createResponse({
        success: false,
        message: 'CPD sheet not found'
      });
    }

    // Validation
    if (!params.eventId || !params.eventName || !params.eventDate ||
        !params.duration || !params.department || !params.maxCapacity ||
        !params.approvalStatus) {
      return createResponse({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Check if event ID already exists
    var data = cpdSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === params.eventId) {
        return createResponse({
          success: false,
          message: 'Event ID already exists. Please use a unique ID.'
        });
      }
    }

    // Prepare new row data (matching CPD sheet structure)
    var newRow = [
      params.eventId,              // Column A: Event ID
      params.eventName,            // Column B: Event Name
      params.eventDate,            // Column C: Event Date
      parseFloat(params.duration), // Column D: Duration
      params.department,           // Column E: Department
      params.unit || '',           // Column F: Unit
      parseInt(params.maxCapacity),// Column G: Max Capacity
      0,                           // Column H: Current Registrations (starts at 0)
      params.approvalStatus,       // Column I: Approval Status
      params.description || '',    // Column J: Description
      params.venue || '',          // Column K: Venue
      params.facilitator || ''     // Column L: Facilitator
    ];

    // Append new row
    cpdSheet.appendRow(newRow);

    return createResponse({
      success: true,
      message: 'CPD event created successfully',
      data: {
        eventId: params.eventId,
        eventName: params.eventName
      }
    });

  } catch (error) {
    console.error('Error creating event:', error);
    return createResponse({
      success: false,
      message: 'Error creating event: ' + error.toString()
    });
  }
}

/**
 * Create new announcement
 */
function createAnnouncement(params) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var announcementSheet = ss.getSheetByName('Announcements');

    if (!announcementSheet) {
      return createResponse({
        success: false,
        message: 'Announcements sheet not found. Please create it first.'
      });
    }

    // Validation
    if (!params.id || !params.title || !params.message ||
        !params.priority || !params.expiryDate || !params.status) {
      return createResponse({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Check if announcement ID already exists
    var data = announcementSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === params.id) {
        return createResponse({
          success: false,
          message: 'Announcement ID already exists. Please use a unique ID.'
        });
      }
    }

    // Prepare new row data (matching Announcements sheet structure)
    var today = new Date();
    var newRow = [
      params.id,                   // Column A: ID
      params.title,                // Column B: Title
      params.message,              // Column C: Message
      params.priority,             // Column D: Priority
      params.expiryDate,           // Column E: Expiry Date
      params.status,               // Column F: Status
      today.toISOString().split('T')[0], // Column G: Created Date
      params.createdBy || 'Admin'  // Column H: Created By
    ];

    // Append new row
    announcementSheet.appendRow(newRow);

    return createResponse({
      success: true,
      message: 'Announcement created successfully',
      data: {
        id: params.id,
        title: params.title
      }
    });

  } catch (error) {
    console.error('Error creating announcement:', error);
    return createResponse({
      success: false,
      message: 'Error creating announcement: ' + error.toString()
    });
  }
}

// Helper function to update event registration count
function updateEventRegistrationCount(cpdSheet, eventId) {
  var data = cpdSheet.getDataRange().getValues();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var registrationSheet = ss.getSheetByName('registration');

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === eventId) {
      // Count registrations for this event
      var regData = registrationSheet.getDataRange().getValues();
      var count = 0;
      for (var j = 1; j < regData.length; j++) {
        if (regData[j][2] === eventId) {
          count++;
        }
      }

      // Update the count in column H (index 7)
      cpdSheet.getRange(i + 1, 8).setValue(count);
      break;
    }
  }
}

// Helper function to create JSON response
// ===== AUTHENTICATION & AUTHORIZATION =====

/**
 * Login function - Authenticates user by Staff ID
 * Returns user data and role from List sheet
 */
function login(staffId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var listSheet = ss.getSheetByName('List');

  if (!listSheet) {
    return createResponse({
      success: false,
      message: 'List sheet not found'
    });
  }

  if (!staffId) {
    return createResponse({
      success: false,
      message: 'Staff ID is required'
    });
  }

  var data = listSheet.getDataRange().getValues();

  // Find staff by ID (Column A)
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === staffId.toString()) {
      var leadershipRole = data[i][14] || ''; // Column O: Leadership Role
      var role = determineRole(leadershipRole);

      return createResponse({
        success: true,
        user: {
          staffId: data[i][0],        // Column A: Staff ID
          name: data[i][1],            // Column B: Name
          email: data[i][8],           // Column I: Email (index 8)
          phone: data[i][9],           // Column J: Phone (index 9)
          designation: data[i][4],     // Column E: Designation
          department: data[i][5],      // Column F: Department
          unit: data[i][6],            // Column G: Unit
          leadershipRole: leadershipRole,
          role: role,
          permissions: getPermissions(role)
        }
      });
    }
  }

  return createResponse({
    success: false,
    message: 'Staff ID not found. Please check your ID and try again.'
  });
}

/**
 * Determine role based on Leadership Role column
 * Admin, Moderator, Leader, or User (default)
 */
function determineRole(leadershipRole) {
  if (!leadershipRole) return 'User';

  var role = leadershipRole.toString().trim().toLowerCase();

  if (role === 'admin') return 'Admin';
  if (role === 'moderator') return 'Moderator';
  if (role === 'leader') return 'Leader';

  return 'User';
}

/**
 * Get permissions for each role
 */
function getPermissions(role) {
  var permissions = {
    'Admin': {
      canViewMainPage: true,
      canViewDashboard: true,
      canViewCalendar: true,
      canRegister: true,
      canEdit: true,
      canModify: true,
      canViewReports: true,
      canViewLeaders: true,
      departmentRestricted: false,
      description: 'Full access to all features'
    },
    'Moderator': {
      canViewMainPage: true,
      canViewDashboard: true,
      canViewCalendar: true,
      canRegister: false,
      canEdit: false,
      canModify: false,
      canViewReports: true,
      canViewLeaders: true,
      departmentRestricted: false,
      description: 'Can review Main Page, Dashboard, and Calendar only'
    },
    'Leader': {
      canViewMainPage: true,
      canViewDashboard: false,
      canViewCalendar: true,
      canRegister: true,
      canEdit: false,
      canModify: false,
      canViewReports: false,
      canViewLeaders: true,
      departmentRestricted: true,
      description: 'Can view Main Page, Calendar, and register staff from own department only'
    },
    'User': {
      canViewMainPage: true,
      canViewDashboard: false,
      canViewCalendar: false,
      canRegister: false,
      canEdit: false,
      canModify: false,
      canViewReports: false,
      canViewLeaders: false,
      description: 'Can only view Main Page'
    }
  };

  return permissions[role] || permissions['User'];
}

// ===== END AUTHENTICATION =====

function createResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// Helper function to format date
function formatDate(date) {
  if (!date) return '';
  var year = date.getFullYear();
  var month = padLeft(date.getMonth() + 1, 2);
  var day = padLeft(date.getDate(), 2);
  return year + '-' + month + '-' + day;
}

// Helper function to pad numbers with leading zeros
function padLeft(num, size) {
  var s = num + '';
  while (s.length < size) s = '0' + s;
  return s;
}

// Test function - Run this to verify setup
function testSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var requiredSheets = ['CPD', 'registration', 'List'];
  var missing = [];

  requiredSheets.forEach(function(sheetName) {
    if (!ss.getSheetByName(sheetName)) {
      missing.push(sheetName);
    }
  });

  if (missing.length > 0) {
    Logger.log('⚠️ Missing sheets: ' + missing.join(', '));
    Logger.log('Please create these sheets before deploying the web app.');
  } else {
    Logger.log('✅ All required sheets found!');
    Logger.log('You can now deploy this as a Web App.');
  }
}
