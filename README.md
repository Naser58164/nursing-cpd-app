# 🏥 Nursing CPD Portal

A modern web application for managing Continuous Professional Development (CPD) activities at Nizwa Hospital. Built with vanilla JavaScript and connected to Google Sheets for data management.

## 🌟 Features

- **Event Management** - View upcoming CPD events with search and filtering
- **Online Registration** - Staff can register for events with real-time validation
- **Interactive Calendar** - Visual calendar view of all scheduled events
- **Analytics Dashboard** - KPIs and charts showing CPD participation and compliance
- **Board of Leaders** - Showcase nursing leadership team
- **Mobile Responsive** - Works seamlessly on all devices

## 🚀 Live Demo

**Demo URL:** `https://your-username.github.io/nursing-cpd-app/`

## 📋 Prerequisites

1. **Google Account** - For Google Sheets and Apps Script
2. **GitHub Account** - For hosting the web app
3. **Vercel Account** (optional) - Alternative hosting platform

## 🛠️ Setup Instructions

### Step 1: Prepare Your Google Sheet

1. Open your Google Sheet: [Your CPD Sheet](https://docs.google.com/spreadsheets/d/1I1GDU6jOaS5dytrVByYJFzyZ_DylyeuxwzMYyRYsZGI/edit)

2. Create **3 tabs** with these exact names and structures:

#### Tab 1: "CPD" (Events)
| Column | Header | Description |
|--------|--------|-------------|
| A | Event ID | Unique identifier (e.g., CPD001) |
| B | Event Name | Name of CPD activity |
| C | Event Date | Date (YYYY-MM-DD format) |
| D | Event Duration | Duration in hours |
| E | Department | Target department |
| F | Unit | Target unit |
| G | Max Capacity | Maximum attendees |
| H | Current Registrations | Auto-calculated |
| I | Approval Status | Approved/Pending |
| J | Description | Event description |
| K | Venue | Location |
| L | Facilitator | Instructor name |

**Formula for H2 (Current Registrations):**
```
=COUNTIF(registration!C:C, A2)
```

#### Tab 2: "registration" (Registrations)
| Column | Header | Description |
|--------|--------|-------------|
| A | Registration ID | Auto-generated |
| B | Timestamp | Auto-filled |
| C | Event ID | Links to CPD tab |
| D | Staff ID | From List tab |
| E | Staff Name | Auto-filled |
| F | Email | Auto-filled |
| G | Department | Auto-filled |
| H | Unit | Auto-filled |
| I | Registration Status | Confirmed/Waitlist |
| J | CPD Hours | Event duration |

**Formula for E2 (Auto-fill Staff Name):**
```
=IFERROR(VLOOKUP(D2, List!A:B, 2, FALSE), "")
```

**Formula for F2 (Auto-fill Email):**
```
=IFERROR(VLOOKUP(D2, List!A:I, 9, FALSE), "")
```

#### Tab 3: "List" (Staff Directory)
| Column | Header | Description |
|--------|--------|-------------|
| A | Staff ID | Primary key |
| B | Full Name | Staff name |
| C | Gender | Male/Female |
| D | Designation | Job title |
| E | Institution | Hospital name |
| F | Department | Department |
| G | Unit | Unit name |
| H | Years of Experience | Experience |
| I | Email | Contact email |
| J | Phone | Phone number |
| K | Date Joined | Start date |
| L | Total CPD Hours | Auto-calculated |
| M | Required CPD Hours | Annual requirement (e.g., 20) |
| N | Compliance Status | Auto-calculated |
| O | Leadership Role | Yes/No |

**Formula for L2 (Total CPD Hours):**
```
=SUMIF(registration!D:D, A2, registration!J:J)
```

**Formula for N2 (Compliance Status):**
```
=IF(L2>=M2, "Completed", IF(L2>=M2*0.75, "On Track", "Behind"))
```

### Step 2: Deploy Google Apps Script

1. In your Google Sheet, go to **Extensions** → **Apps Script**

2. Delete any existing code in `Code.gs`

3. Copy and paste the entire content from `apps-script/Code.gs`

4. Click **💾 Save** (name it "Nursing CPD API")

5. Click **▶️ Run** → Select `testSetup` function
   - Click **Review permissions** and allow access
   - Check the logs to ensure all sheets are found

6. Click **Deploy** → **New deployment**
   - Click the gear icon ⚙️ and select **Web app**
   - Settings:
     - **Description:** "Nursing CPD API"
     - **Execute as:** Me (your-email@gmail.com)
     - **Who has access:** Anyone (for public access) or Anyone with link
   - Click **Deploy**

7. **Copy the Web App URL** (format: `https://script.google.com/macros/s/XXXXXX/exec`)

### Step 3: Configure the Web Application

1. Open `config.js` in this repository

2. Replace `YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE` with your actual deployment URL:

```javascript
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/XXXXXX/exec',
    // ... rest of config
};
```

3. Save the file

### Step 4: Deploy to GitHub Pages

#### Option A: Using GitHub Web Interface

1. Go to [GitHub](https://github.com) and sign in

2. Click **New repository**
   - Repository name: `nursing-cpd-app`
   - Description: "Nursing CPD Management Portal"
   - Public repository
   - Click **Create repository**

3. Upload files:
   - Click **Add file** → **Upload files**
   - Upload these files:
     - `index.html`
     - `styles.css`
     - `app.js`
     - `config.js`
     - `README.md`
   - Click **Commit changes**

4. Enable GitHub Pages:
   - Go to **Settings** → **Pages**
   - Source: Deploy from a branch
   - Branch: `main` / `root`
   - Click **Save**

5. Wait 2-3 minutes, then visit:
   `https://your-username.github.io/nursing-cpd-app/`

#### Option B: Using Git Command Line

```bash
# Clone this repository or navigate to the project folder
cd nursing-cpd-app

# Initialize git (if not already initialized)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: Nursing CPD Portal"

# Add remote (replace with your GitHub repo URL)
git remote add origin https://github.com/your-username/nursing-cpd-app.git

# Push to GitHub
git branch -M main
git push -u origin main
```

Then enable GitHub Pages in repository settings as described above.

### Step 5: Deploy to Vercel (Alternative)

1. Go to [Vercel](https://vercel.com) and sign in with GitHub

2. Click **Add New** → **Project**

3. Import your `nursing-cpd-app` repository

4. Configure:
   - Framework Preset: **Other**
   - Root Directory: `./`
   - Build Command: (leave empty)
   - Output Directory: (leave empty)

5. Click **Deploy**

6. Your app will be live at: `https://nursing-cpd-app.vercel.app`

## 🧪 Testing Your Deployment

### 1. Test the API Connection

Open browser console (F12) and visit your deployed site. Check for:
- ✅ No CORS errors
- ✅ Events loading successfully
- ✅ API responses in Network tab

### 2. Test Event Registration

1. Navigate to the **Register** section
2. Select an event
3. Enter a valid Staff ID from your List sheet
4. Submit the form
5. Check the `registration` tab in your Google Sheet for the new entry

### 3. Test Dashboard

1. Navigate to the **Dashboard** section
2. Verify KPIs display correctly
3. Check that charts render with data from your sheets

### 4. Test Calendar

1. Navigate to the **Calendar** section
2. Verify events appear on the calendar
3. Click on events to see details

## 📂 Project Structure

```
nursing-cpd-app/
├── index.html          # Main HTML file
├── styles.css          # All CSS styles
├── app.js             # Application JavaScript
├── config.js          # Configuration file
├── README.md          # This file
├── vercel.json        # Vercel deployment config
└── apps-script/
    └── Code.gs        # Google Apps Script backend
```

## 🔧 Configuration Options

Edit `config.js` to customize:

```javascript
const CONFIG = {
    API_URL: 'YOUR_URL_HERE',
    
    // Feature toggles
    FEATURES: {
        EVENT_REGISTRATION: true,
        DASHBOARD_ANALYTICS: true,
        BOARD_OF_LEADERS: true,
    },
    
    // UI settings
    UI: {
        EVENTS_PER_PAGE: 50,
        CALENDAR_VIEW: 'dayGridMonth',
    }
};
```

## 🐛 Troubleshooting

### Events Not Loading

**Problem:** Events section shows "Loading..." indefinitely

**Solutions:**
1. Check that `config.js` has the correct API URL
2. Verify Google Apps Script is deployed as Web App
3. Check browser console for CORS errors
4. Ensure CPD sheet has data in correct format

### Registration Not Working

**Problem:** Form submits but doesn't create entry

**Solutions:**
1. Verify Staff ID exists in List sheet
2. Check that all three sheets (CPD, registration, List) exist
3. Ensure formulas in registration sheet are correct
4. Check Apps Script execution logs for errors

### Dashboard Shows Zero

**Problem:** Dashboard KPIs show 0 for all metrics

**Solutions:**
1. Verify data exists in List and CPD sheets
2. Check that formulas in List sheet are working
3. Ensure column references match your sheet structure

### API URL Not Found (404)

**Problem:** Browser shows 404 error when accessing API

**Solutions:**
1. Redeploy the Apps Script Web App
2. Copy the new deployment URL
3. Update `config.js` with new URL
4. Clear browser cache and reload

## 🔐 Security Considerations

### Data Protection
- API is read-only for events, staff details, and dashboard
- Write operations (registration) validate staff ID before submission
- No sensitive data is exposed in client-side code

### Access Control
- Deploy Apps Script with appropriate access level:
  - **Public:** Anyone can register (use with caution)
  - **Organization:** Only users in your Google Workspace
  - **Private:** Only you can access (for testing)

### Recommended Settings
For production deployment:
1. Set Apps Script access to "Anyone with link"
2. Add authentication layer if needed
3. Monitor usage in Apps Script dashboard
4. Regularly audit registration data

## 📊 Adding Sample Data

To test with sample data, add to your sheets:

### CPD Sheet Example
```
CPD001 | Intravenous Therapy Course | 2024-12-15 | 4 | ED | Ambulatory | 50 | 0 | Approved | Essential IV training | Hall A | Dr. Ahmed
CPD002 | Emergency Response Training | 2024-12-20 | 6 | All | All | 30 | 0 | Approved | Emergency protocols | Training Center | Nurse Sara
```

### List Sheet Example
```
90270 | John Smith | Male | Nurse | Nizwa Hospital | ED | Ambulatory | 3 | john@hospital.om | +968... | 2020-01-15 | 0 | 20 | Behind | No
90271 | Sarah Ahmed | Female | Senior Nurse | Nizwa Hospital | ICU | Critical | 5 | sarah@hospital.om | +968... | 2018-03-10 | 0 | 20 | Behind | Yes
```

## 🚀 Future Enhancements

- [ ] Email notifications after registration
- [ ] QR code generation for event check-in
- [ ] Attendance tracking system
- [ ] Certificate generation
- [ ] Mobile app version
- [ ] Advanced reporting features
- [ ] User authentication system
- [ ] Export functionality (PDF/Excel)

## 📝 License

This project is open source and available under the MIT License.

## 👥 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Google Apps Script logs
3. Verify all sheet structures match documentation
4. Ensure API URL is correctly configured

## 🎉 Credits

Developed for Nizwa Hospital Nursing Department  
Continuous Professional Development Management System

---

**Last Updated:** November 2024  
**Version:** 1.0.0
