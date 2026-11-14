# Test plan results (§10)

Run on 14 Nov 2026 against the **real** seed (`seed/encor2026_seed.json`) and the **real** server code (`Logic.gs`, `Code.gs`, `Seed.gs`), inside an in-memory Apps Script mock. Every score used in the tests is synthetic and exists only in memory; no Google Sheet was written to (§2.7). The mock imitates Sheets' value coercion (`=`, numbers, dates), which proves that item text is stored verbatim.

Reproduce:

```bash
node test/run.js
```

```bash
node dev/ui-check.js
```

## §10 acceptance tests: summary
| §10 | Requirement | Evidence | Result |
|---|---|---|---|
| 1 | Seed counts: 8 checklists, A1 14 … TD 12 (98), maxima 28 … 24 | 10.1 | ✅ |
| 2 | 4 OSCE × 4 roles × 5 items, X1–X3, max 16; rubric 6 items, max 12 | 10.2 | ✅ |
| 3 | Roster 48 = 4 × 4 × 3; number ranges per group | 10.3 | ✅ |
| 4 | Item text identical to the seed, character for character | 10.4, 10.4b, 10.4-ui (Admin seed check) | ✅ |
| 5 | Facilitator B / Day 2 blocked from Station A, Day 3 and unassigned OSCE (server-side) | 10.5, 10.5-ui | ✅ |
| 6 | No submit with unscored item; no duplicate; post-finalise correction Admin-only with reason, in AuditLog | 10.6, 10.6-ui | ✅ |
| 7 | Dashboard numbers equal a hand calculation | 10.7, 10.7b | ✅ |
| 8 | Threshold blank → no competency % anywhere | 10.8, 10.8-ui | ✅ |
| 9 | Phone width, no horizontal scrolling | 10.9 (390 px, 20 screens) | ✅ |
| 10 | Completion updates within one refresh interval | 10.10, 10.10-ui (2 s interval: 18 → 19) | ✅ |

## Server tests (`node test/run.js`): 16/16
| # | Test | Result |
|---|---|---|
| 10.1 | Seed counts: 8 checklists, item counts and maxima | ✅ Pass |
| 10.2 | OSCE: 4 scenarios × 4 roles × 5 items, 3 common (max 16), 6-item rubric (max 12) | ✅ Pass |
| 10.3 | Roster: 48 participants, 4 groups × 4 teams × 3, correct number ranges | ✅ Pass |
| 10.4 | Every item text in the sheet and in the app payload equals the seed, character for character | ✅ Pass |
| 10.4b | Sheet coercion guard: "=", numeric and date-looking strings are stored as plain text | ✅ Pass |
| 10.5 | Facilitator of Station B Day 2 cannot open/submit Station A, Day 3, or an unassigned OSCE (server-side) | ✅ Pass |
| 10.6 | Unscored item rejected; duplicate submit idempotent; post-finalise correction Admin-only with reason, audited | ✅ Pass |
| 10.7 | Dashboard numbers equal a hand calculation from the rows (synthetic, in-memory) | ✅ Pass |
| 10.7b | OSCE: individual /16, rubric /12, completion = teams scored ÷ teams expected | ✅ Pass |
| 10.8 | Threshold blank → no competency-rate percentage anywhere; set → computed | ✅ Pass |
| 10.10 | Station completion updates on the next dashboard read after a submission | ✅ Pass |
| X.1 | Owner is Admin; signed tokens verify; tampered/expired tokens rejected | ✅ Pass |
| X.4 | A ticket minted by the separate Sign-in project verifies in the main app | ✅ Pass |
| X.5 | doGet exchanges a valid ticket for a session token; bad ticket gives none | ✅ Pass |
| X.2 | Roster CSV import updates names only for known numbers; attendance + readiness | ✅ Pass |
| X.3 | Looker views build from effective records | ✅ Pass |

## Browser tests (`node dev/ui-check.js`, Chromium at 390 × 844): 15/15
| # | Test | Result |
|---|---|---|
| 10.5-ui | Facilitator B sees only Station B on Day 2 | ✅ Pass |
| 10.4-ui | Checklist B1 shows 13 items in seed order | ✅ Pass |
| 10.6-ui | Submit disabled until every item is scored | ✅ Pass |
| UI | Running total shown | ✅ Pass |
| UI | Confirmation summary before saving | ✅ Pass |
| UI | Badge returns to "Saved to sheet" and participant shows "Submitted by me" | ✅ Pass |
| UI | Offline entry kept in browser storage ("Waiting to sync") and sent when back online | ✅ Pass |
| 10.8-ui | Threshold blank → "Threshold not set", no competency % | ✅ Pass |
| 10.10-ui | Station completion updates within one refresh interval | ✅ Pass |
| 10.4-ui | Admin seed check passes (sheet text = seed) | ✅ Pass |
| UI | Team of 3 leaves one role unassigned | ✅ Pass |
| UI | OSCE member form = 5 role items + 3 common (max 16) | ✅ Pass |
| UI | Unknown e-mail sees only "Not authorised" | ✅ Pass |
| 10.9 | Phone width 390 px: no horizontal scrolling on any screen | ✅ Pass |
| UI | No JavaScript errors | ✅ Pass |

## Hand calculation used in 10.7 (Station B, Day 2, clock 11:20 Muscat)
| Quantity | Hand calculation | Dashboard |
|---|---|---|
| Expected | R1 G2 + R2 G1 + R3 G4 have started = 36 | 36 |
| Submitted | #11, #12, #13 (facilitator) = 3 | 3 |
| Completion | 3 ÷ 36 = 8.3 % | 8.3 % |
| Mean % | (26/26 + 20/26 + 20/26) ÷ 3 = 84.6 % | 84.6 % |
| 2 / 1 / 0 counts | 13+10+7 / 0+0+6 / 0+3+0 = 30 / 6 / 3 | 30 / 6 / 3 |
| Competent-item rate | 30 ÷ 39 = 76.9 % | 76.9 % |
| Second assessor (#13, all 0) | Ignored under `facilitator`, used under `station_leader` | ✔ both |
| Competency rate at 80 % | 1 of 2 assessed ≥ 80 % = 50 % | 50 % |

## Not covered by automated tests
- **Live Google services** (real `Session` identity, the Sign-in redirect, `LockService` under real concurrency, trigger scheduling). Check these once in a **copy** of the workbook deployed separately before the workshop:
  1. Sign in from a @gmail.com account.
  2. Submit the same participant from two phones.
  3. Toggle airplane mode mid-submit.
- **Chart.js from the CDN.** This sandbox cannot reach cdnjs, so the preview used the repository's local Chart.js 4.4.3, which is the exact version pinned in `Index.html`.
