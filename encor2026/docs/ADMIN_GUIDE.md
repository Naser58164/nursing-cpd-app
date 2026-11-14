# ENCOR 2026: Admin guide

Open the app link and sign in. The script owner is always Admin. Tap **Admin** on the home screen.

## 1. Import the roster
1. Prepare a CSV with exactly this header: `participant_no,name,staff_id` (48 rows; numbers 1–48).
2. Go to **Admin → Roster**, then choose the file or paste the CSV, and tap **Preview**.
3. Fix any rejected lines (unknown numbers, duplicates), then tap **Import**.

Only names and staff IDs change. Groups and teams always come from the approved seed.

## 2. Add users
1. Go to **Admin → Users → Add user**. Enter the Google e-mail, name, role, day(s), station(s) and Active.
   - Day: `2`, or `2,3`, or `*`.
   - Station: `A`–`D`, `OSCE` (all rooms), `OSCE-G1`…`OSCE-G4` (one room), or `*`.
   - Day 1 attendance needs an Organizer or Station Leader assigned to day `1`.
2. The **Station staff in the programme** table under the user list shows the names from the seed, so you can match people to stations. E-mails are never in the seed, so you must enter them.
3. To remove someone's access, untick **Active**. Rows are never deleted, so the history stays readable.

## 3. Set the threshold and other settings (Admin → Settings)
| Setting | What to enter |
|---|---|
| `competency_threshold_pct` | Leave it **blank** until the committee approves a value (0–100). While it is blank, the dashboard shows "Threshold not set" and no competency rate. |
| `organizer_can_score` | `false` (programme default) or `true` |
| `primary_assessor_rule` | `facilitator` (default), `station_leader` (overrides), or `average` |
| `dashboard_refresh_sec` | Auto-refresh interval (default 60) |
| `osce_start_time_day2` / `osce_start_time_day3` | `HH:MM`. Day 2 is filled from the timetable. **Enter Day 3** (see SEED_ISSUES). |

Every change is written to `AuditLog`.

## 4. Readiness ticklists (Admin → Readiness)
Choose the day and station, then paste the equipment items from the equipment checklist document, one per line. Organizers tick them in **Day → Readiness**.

## 5. Finalise
- Station Leaders open **Day → Review — Station X** (or **Review — OSCE**), tick the records and tap **Finalise selected**.
- Finalised records are locked for everyone except the Admin.

## 6. Correct or unlock a finalised record (Admin only, reason required)
- **Correct:** go to Review, tap **Correct** on the record, change the scores and enter a reason. A new *finalised* version is saved.
- **Unlock:** go to Review, tap **Unlock** and enter a reason. The assessor can then resubmit, and the Station Leader finalises again.

Both actions are recorded in `AuditLog` with your e-mail, the old and new values, and the reason.

## 7. Export
| What | How |
|---|---|
| Dashboard | **Export CSV** exports the tables on the current tab. **Print / PDF** prints the page. |
| Raw tables | **Admin → Export**: Assessments, scores, OSCE, rubric, attendance, audit log, and the `v_*` Looker views. |
| Seed integrity | **Admin → Seed check** confirms that counts and every item text match the approved seed, character for character. |

## Day-of checklist
- [ ] Users added and active, and each person has opened the link once
- [ ] Roster imported (names visible on station lists)
- [ ] Readiness lists entered
- [ ] `osce_start_time_day3` set
- [ ] Threshold entered only if approved
- [ ] Admin → Seed check shows ✔ Pass
