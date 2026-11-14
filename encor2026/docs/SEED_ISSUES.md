# Seed review: items that look inconsistent (reported, not fixed)

Source: `seed/encor2026_seed.json`. It passes every structural acceptance check in §10:
- 8 checklists and 98 items, with the correct maxima;
- 4 OSCEs × 4 roles × 5 items, plus X1–X3 and a 6-item rubric;
- 48 participants in the correct groups and teams;
- the rotation matches the Latin square;
- station → checklist matches §3.

Nothing below was changed. The app shows all seed text verbatim.

## A. Needs a decision before the workshop
| # | Observation | Effect in the app | Suggested owner action |
|---|---|---|---|
| A1 | **Day 2 OSCE teams have 6 members, but there are 4 roles.** Team X = teams a+b and Team Y = teams c+d (3 + 3). | The app allows a role to be shared and shows a "Shared role" warning. Members without a role cannot be scored individually. | Committee to decide: two members share a role, **or** two members are unscored observers. |
| A2 | **Day 2 OSCE capacity.** The window is 12:15–12:45 (30 min). There are 8 team runs (4 groups × X, Y), each 8 + 5 = 13 min, which is about 104 room-minutes. | None (the app does not schedule). | Confirm the number of parallel rooms. At least 4 rooms are needed, each running 2 teams back-to-back (26 min). The seed does not state Day 2 rooms. |
| A3 | **Day 3 OSCE is not labelled in the timetable.** The 11:30–13:00 row is "Trauma 360- II Practice". §3 says OSCE-3/4 run 11:30–13:00. | `osce_start_time_day3` is left blank. Until it is set, OSCE completion counts Day 3 teams as expected from the start of Day 3. | Admin → Settings → `osce_start_time_day3` = `11:30` once confirmed. |
| A4 | **The seed has no OSCE team mapping.** Team X/Y (Day 2) and a,c → OSCE-3, b,d → OSCE-4 (Day 3) are taken from master prompt §3. | Written to the `OSCEUnits` tab, which the Admin can edit. | Confirm, or add the mapping to the seed. |
| A5 | **The seed has no `extra_flag`.** Participants 41–48 (two per group, in teams c and d) look like late additions, but nothing flags them. | `extra_flag` column left blank. | Fill in `Participants.extra_flag` if a flag is needed. |

## B. Wording and spelling (informational)
| # | Observation |
|---|---|
| B1 | Same person, different spellings: "Dr. Suliman Al-Kindi" (Day 2 Station C) vs "Dr. Sulaiman Al Kindi" (Day 3 Station C and timetable). Organizer "Suliman". |
| B2 | Facilitator "Mahmood" (Stations A) vs speaker "Mr. Mahmoud Al Hinai"; subject expert "Ms. Abeer" vs speaker "Ms. Abeer Al Mamari". These may or may not be the same people. This matters only when the Admin maps e-mails. |
| B3 | Day 2 timetable topic is spelled **"OCSE Day 2 – ACLS"** (OSCE). |
| B4 | OSCE-1 progressive information uses "**->>**" twice (1:00 and 5:30), probably meant to be "→". |
| B5 | OSCE-3 and OSCE-4 progressive information (2:00) have a trailing space before a line break. Timetable `speaker` fields contain "Practice Session \nstation A-D" (trailing space, embedded line breaks), and "(Online)" is on a new line. |
| B6 | Day 2 Breakfast duration is "30", with no unit. Other rows say "30 min". |
| B7 | Checklist titles differ slightly from station topics: A1 adds "and defibrillator hand-off"; C1 "assistance and waveform" vs topic "assistance, and waveform"; TA drops "(A)". |
| B8 | Date formats differ: `event.dates` uses ISO (`2026-11-15`) and `timetable.date` uses `15/11/2026`. Both are parsed correctly. |

## C. Naming collisions (handled, but worth knowing for reports)
| # | Observation |
|---|---|
| C1 | OSCE item codes reuse checklist IDs: role codes **A1–A5** (OSCE-1/2 R2) and **C1–C5** (OSCE-1 R4, OSCE-3/4 R3) look like checklist IDs **A1, C1, C2**. In the app, OSCE items are always stored with their `osce_id`, so they never clash. In exported CSVs, read OSCE codes together with `osce_id`. |
| C2 | Day 2 Station D uses checklist **C2** (not a "D" name). This matches §3. |
| C3 | Day 2 has a "Practice Session" (08:30–09:00) before the theory session. The rotation and checklists cover only 10:15–12:15, so the app expects scoring only in the rotation rounds. |
