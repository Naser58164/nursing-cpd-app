# ENCOR 2026 Competency Assessment App

A mobile-first Google Apps Script web app for scoring the ENCOR 2026 competency checklists (Stations A–D) and OSCEs. Every entry is saved live to one Google Sheet, and an automated dashboard reads from that sheet.

**Workshop path:** Day → Station / OSCE → Round / Room → Participant → Checklist / OSCE form → Submit.

| Item | Where |
|---|---|
| Server (Apps Script) | `apps-script/Code.gs` (API, sheet I/O, auth), `Logic.gs` (pure rules, unit-tested), `Seed.gs` (`seedSheets()`), `SeedData.gs` (generated from the seed) |
| Front end | `apps-script/Index.html`, `Styles.html`, `App.html` |
| Sign-in helper (separate project) | `signin/SignIn.gs`, `signin/appsscript.json` |
| Approved seed (source of truth) | `seed/encor2026_seed.json` |
| Tests | `test/run.js` (server, §10), `dev/ui-check.js` (browser, phone width) |
| Admin guide | `docs/ADMIN_GUIDE.md` |
| Test results | `docs/TEST_RESULTS.md` |
| Seed inconsistencies | `docs/SEED_ISSUES.md` |

---

## 1. Setup (about 20 minutes)

### Step 1: Create the Sheet and the script
1. Create a new Google Sheet named, for example, **ENCOR 2026 Assessments**. Use the workshop owner account, because this account becomes the permanent Admin.
2. Open **Extensions → Apps Script**.
3. Click **Project Settings** (gear icon) and tick **Show "appsscript.json" manifest file in editor**.
4. Create these files and paste in each file's content from `apps-script/`:

| Editor file | Type | Source |
|---|---|---|
| `Code.gs` (replace the default) | Script | `apps-script/Code.gs` |
| `Logic.gs` | Script | `apps-script/Logic.gs` |
| `Seed.gs` | Script | `apps-script/Seed.gs` |
| `SeedData.gs` | Script | `apps-script/SeedData.gs` |
| `Index` | HTML | `apps-script/Index.html` |
| `Styles` | HTML | `apps-script/Styles.html` |
| `App` | HTML | `apps-script/App.html` |
| `appsscript.json` | Manifest | `apps-script/appsscript.json` |

> **Using clasp instead?** Run `clasp create --type sheets --rootDir apps-script` (or clone your bound script), then run `clasp push`.

### Step 2: Seed the workbook
1. In the editor, select **`seedSheets`** and click **Run**. Approve the permissions prompt (spreadsheets, your e-mail, triggers).
2. Open **View → Logs**. The run log should show `"ok": true`, 8 checklists, 98 items and 48 participants.
3. `seedSheets()` creates every tab, loads the seed and stops with a list of errors if the seed fails validation. It writes **no** scores, users, e-mails or names, so it is safe to run again.

### Step 3: Security and time-based jobs
1. Run **`setupAuth`** once. It creates the signing secret, which you can see in **View → Logs**. You need it in Step 5.
2. Run **`installTriggers`** once. This rebuilds the Looker Studio views (`v_*` tabs) every 5 minutes.

### Step 4: Deploy the main app
1. Click **Deploy → New deployment → Web app**.
2. Set **Execute as: Me** and **Who has access: Anyone with a Google account**.
3. Copy the `/exec` URL. This is the **MAIN_URL**.

The app checks every request against the `Users` tab. A Google account that is not listed (and active) sees only **"Not authorised"**.

### Step 5: Sign-in helper (needed for @gmail.com and other non-Workspace accounts)
Google does not reveal a visitor's e-mail to an "Execute as: Me" app unless the visitor is in the same Google Workspace domain as the owner. The helper solves this. It is a separate tiny project that runs as the visitor and asks only for permission to "see your e-mail address".

1. Go to <https://script.google.com> → **New project**, and name it **ENCOR Sign-in**.
2. Paste `signin/SignIn.gs` and `signin/appsscript.json` (show the manifest as in Step 1).
3. Go to **Project Settings → Script properties** and add:
   - `AUTH_SECRET` = the value logged by `setupAuth` in Step 3
   - `MAIN_URL` = the main `/exec` URL from Step 4
4. Deploy it as a web app with **Execute as: User accessing the web app** and **Who has access: Anyone with a Google account**. Copy its `/exec` URL.
5. Back in the **main** project, open **Project Settings → Script properties** and add `SIGNIN_URL` = the helper's `/exec` URL.

How sign-in works:
1. The user opens the main link and taps **Sign in with Google**.
2. The helper issues a ticket that is signed (HMAC-SHA256) and valid for 5 minutes.
3. The main app turns the ticket into a device session, valid for `session_hours` (default 12 h).

If all staff are in the owner's Workspace domain, you can skip this step.

### Step 6: Add users, then share the link
1. Open the main link as the owner, then go to **Admin → Users → Add user** for each staff member. Alternatively, type rows directly into the `Users` tab.
2. Fill in the details as in the table below.
3. Share the **main** `/exec` link with the staff.

| Column | Values |
|---|---|
| `email` | Their Google account e-mail |
| `role` | `admin`, `station_leader`, `facilitator` or `organizer` |
| `day` | `1`, `2`, `3`, `2,3` or `*` |
| `station` | `A`–`D`, `OSCE` (all rooms that day), `OSCE-G1`…`OSCE-G4` (one room), or `*` |
| `active` | `true` / `false` |

### Step 7: Before Day 2, complete these open items
These are listed in brief §8. The app never guesses them.

| Item | Where |
|---|---|
| Participant names / staff IDs | Admin → Roster (CSV: `participant_no,name,staff_id`) |
| User e-mails and assignments | Admin → Users |
| `competency_threshold_pct` | Admin → Settings. Leave it blank until the committee approves a value. |
| Station readiness ticklists | Admin → Readiness (from the equipment checklist document) |
| `osce_start_time_day3` | Admin → Settings. The seed timetable does not label the Day 3 OSCE row (see `docs/SEED_ISSUES.md`). |
| `organizer_can_score` | Default `false` |
| `primary_assessor_rule` | `facilitator` (default), `station_leader` or `average` |

**Updating the code later:** paste the new files, then go to **Deploy → Manage deployments → Edit → Version: New version**. The URL stays the same.

---

## 2. How it works

### Roles (enforced on the server for every request)
| Role | Can | Cannot |
|---|---|---|
| Admin (plus the script owner) | Everything: users, roster, settings, unlock/correct with a reason, all dashboards, export | — |
| Station Leader | Score as second assessor, finalise their station or OSCE room, see the station dashboard | Other stations or days |
| Facilitator | Score at their assigned station/room and day; edit their own entry until it is finalised | Other stations; edit after finalise |
| Organizer | Attendance, readiness ticklist, station progress; scoring only if `organizer_can_score = true` | Scoring by default |

### Data rules
- **Append-only with versions.**
  - Each submission adds a new `version` row and never overwrites one.
  - Finalising adds a version with status `finalised`. Unlocking adds one with status `unlocked`.
  - The dashboard uses the latest finalised version, otherwise the latest submitted version.
- **Who entered it:** every row has `assessor_email`, `assessor_role`, `entered_by` and an ISO timestamp (Asia/Muscat).
- **Audit log:** every create, update, correct, finalise, unlock, user change and config change is written to `AuditLog`.
- **Idempotent saves:**
  - The client generates a `request_id` for each submission, and a retried request returns the original result.
  - Writes run under `LockService`.
- **Offline tolerance:**
  - Unsent entries are kept in browser storage and retried every 15 s and when the device comes back online.
  - The badge shows **Saved to sheet**, **Waiting to sync (n)** or **Rejected (n)**.
  - Drafts are autosaved on the device until they are submitted.
- **Validation (server):**
  - The user is authorised for that day and station/room.
  - The participant is in the rotated group, or the entry is flagged as a re-attempt.
  - Every item is scored, and each score is 0, 1 or 2.
  - The checklist matches the station and day, and OSCE items match the member's role.
- **Two assessors:** both entries are stored. The dashboard uses `primary_assessor_rule`.

### Dashboard
| Page | Content |
|---|---|
| Overview | Completion, competency (or "Threshold not set"), mean %, 2/1/0 distribution, attendance |
| Station | KPIs and item analysis (weakest steps first) per checklist |
| OSCE | Mean /16 by scenario and role; rubric mean /12 and criterion profile; completion; group/team table |
| Group / Team | Mean % by group, group × station, team |
| Participant | One participant's checklists, item scores and OSCE |
| Progress | 48 participants × 8 checklists + OSCE per day |

- Filters: Day, Station, Round, Group, Team.
- It refreshes automatically every `dashboard_refresh_sec`, offers CSV export and Print/PDF, and every chart has a table view.
- Staff see only their own stations; Admin sees everything.
- The **How this is calculated** note on screen gives the definitions.

**Looker Studio:** connect the `v_assessments`, `v_item_scores`, `v_osce` and `v_rubric` tabs. These flat views of the effective records are rebuilt every 5 minutes.

---

## 3. Development and tests

```bash
node test/run.js
```

```bash
node dev/ui-check.js
```

```bash
node dev/build-seed-gs.js
```

- `node test/run.js` runs the server acceptance tests: the real `.gs` code, the real seed and synthetic scores **held in memory only**.
- `node dev/ui-check.js` runs the browser checks at a 390 px phone width against the in-memory preview harness.
- `node dev/build-seed-gs.js` regenerates `SeedData.gs` after the seed changes.

`dev/harness.html` (generated) is a **preview only**. It runs the real UI and server code in the browser against a mock spreadsheet, with a visible banner. Open it with `?as=<email>` to view the app as a given user, or `?demo=1` to load synthetic scores. It never touches a real sheet.

Testing rule (§2.7): never put test data in the production workbook. To test against real Google services, make a copy of the workbook, deploy that copy separately, and delete it afterwards.

The app makes no claim of AHA, ATLS or OMSB certification. It contains no external AI calls and no analytics or tracking.
