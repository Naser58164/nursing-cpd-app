#!/usr/bin/env node
/**
 * ENCOR 2026 — acceptance test runner (§10).
 * Runs the REAL Logic.gs / Code.gs / Seed.gs inside an in-memory Apps Script
 * mock loaded with the REAL seed. Scores used here are synthetic and live only
 * in memory — nothing is ever written to a production sheet (§2.7).
 *
 *   node test/run.js            # run all tests
 *   node test/run.js --md out   # also write a Markdown results file
 */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var createGas = require('./gas-mock').createGas;

var ROOT = path.join(__dirname, '..');
var SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed', 'encor2026_seed.json'), 'utf8'));
var SRC = ['Logic.gs', 'Code.gs', 'Seed.gs'].map(function (f) { return [f, fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8')]; });

/** Fresh in-memory "workbook" with the server code loaded. */
function boot(opts) {
  opts = opts || {};
  var gas = createGas({ ownerEmail: 'owner@test.invalid', now: opts.now });
  var ctx = Object.assign({ console: console, JSON: JSON, Math: Math, ENCOR_SEED: opts.seed || SEED }, gas);
  vm.createContext(ctx);
  SRC.forEach(function (s) { vm.runInContext(s[1], ctx, { filename: s[0] }); });
  ctx.__state.props.AUTH_SECRET = 'test-secret';
  ctx.seedSheets();
  return ctx;
}
function as(ctx, email) { ctx.__state.activeEmail = email; return ctx; }
function call(ctx, email, action, payload) { as(ctx, email); return JSON.parse(JSON.stringify(ctx.api('', action, payload || {}))); }
function rows(ctx, name) { ctx.REQ_CACHE_ = {}; return ctx.readTable_(name); }
function addUser(ctx, u) { var r = call(ctx, 'owner@test.invalid', 'adminSaveUser', { user: u }); if (!r.ok) throw new Error(JSON.stringify(r)); }
function muscat(day, hhmm) { var d = { 1: 15, 2: 16, 3: 17 }[day], t = hhmm.split(':'); return Date.UTC(2026, 10, d, Number(t[0]) - 4, Number(t[1])); }
var reqN = 0; function rid() { return 'req-' + (++reqN); }
function allScores(ctx, checklistId, fn) {
  var s = {}; rows(ctx, 'ChecklistItems').filter(function (i) { return i.checklist_id === checklistId; }).forEach(function (i, k) { s[i.item_no] = fn(k, i); });
  return s;
}

// ------------------------------------------------------------------
var results = [];
function test(id, name, fn) {
  try { fn(); results.push({ id: id, name: name, ok: true }); }
  catch (e) { results.push({ id: id, name: name, ok: false, err: e && e.stack || String(e) }); }
}
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'not equal') + '\n  expected: ' + JSON.stringify(b) + '\n  actual:   ' + JSON.stringify(a)); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }

// ================= §10.1 Seed counts ==================================
test('10.1', 'Seed counts: 8 checklists, item counts and maxima', function () {
  var ctx = boot();
  var cl = rows(ctx, 'Checklists'), items = rows(ctx, 'ChecklistItems');
  eq(cl.length, 8, 'checklists');
  var exp = { A1: [14, 28], B1: [13, 26], C1: [12, 24], C2: [12, 24], TA: [13, 26], TB: [11, 22], TC: [11, 22], TD: [12, 24] };
  Object.keys(exp).forEach(function (id) {
    eq(items.filter(function (i) { return i.checklist_id === id; }).length, exp[id][0], id + ' item count');
    eq(Number(cl.filter(function (c) { return c.checklist_id === id; })[0].max_score), exp[id][1], id + ' max');
  });
  eq(items.length, 98, 'total items');
  var rep = ctx.verifySeed_(); ok(rep.ok, JSON.stringify(rep));
});

// ================= §10.2 OSCE structure ===============================
test('10.2', 'OSCE: 4 scenarios × 4 roles × 5 items, 3 common (max 16), 6-item rubric (max 12)', function () {
  var ctx = boot();
  var sc = rows(ctx, 'OSCEScenarios'), it = rows(ctx, 'OSCEItems');
  eq(sc.length, 4);
  sc.forEach(function (o) {
    var mine = it.filter(function (i) { return i.osce_id === o.osce_id; });
    ['R1', 'R2', 'R3', 'R4'].forEach(function (r) { eq(mine.filter(function (i) { return i.section === 'role' && i.role_no === r; }).length, 5, o.osce_id + ' ' + r); });
    var common = mine.filter(function (i) { return i.section === 'common'; }).map(function (i) { return i.code; });
    eq(common, ['X1', 'X2', 'X3'], o.osce_id + ' common');
    eq(2 * (5 + common.length), 16); eq(Number(o.max_individual_score), 16);
    eq(mine.filter(function (i) { return i.section === 'rubric'; }).length * 2, 12, o.osce_id + ' rubric');
  });
});

// ================= §10.3 Roster =======================================
test('10.3', 'Roster: 48 participants, 4 groups × 4 teams × 3, correct number ranges', function () {
  var ctx = boot(), p = rows(ctx, 'Participants');
  eq(p.length, 48);
  var R = function (a, b) { var r = []; for (var i = a; i <= b; i++) r.push(String(i)); return r; };
  var exp = { G1: R(1, 10).concat(['41', '42']), G2: R(11, 20).concat(['43', '44']), G3: R(21, 30).concat(['45', '46']), G4: R(31, 40).concat(['47', '48']) };
  Object.keys(exp).forEach(function (g) {
    eq(p.filter(function (x) { return x.group === g; }).map(function (x) { return x.participant_no; }).sort(), exp[g].sort(), g);
    ['a', 'b', 'c', 'd'].forEach(function (t) { eq(p.filter(function (x) { return x.group === g && x.team === t; }).length, 3, g + t); });
  });
  ok(p.every(function (x) { return x.name === '' && x.staff_id === ''; }), 'names/staff IDs must be blank after seeding');
  eq(rows(ctx, 'Users').length, 0, 'seed must not create users');
  ['Assessments', 'AssessmentScores', 'OSCEAssessments', 'TeamRubric', 'Attendance'].forEach(function (t) { eq(rows(ctx, t).length, 0, t + ' must be empty'); });
  ctx.seedSheets(); eq(rows(ctx, 'Participants').length, 48, 'seedSheets is idempotent');
  eq(rows(ctx, 'ChecklistItems').length, 98, 'seedSheets is idempotent (items)');
});

// ================= §10.4 Verbatim text ================================
test('10.4', 'Every item text in the sheet and in the app payload equals the seed, character for character', function () {
  var ctx = boot();
  addUser(ctx, { email: 'admin@test.invalid', name: 'T', role: 'admin', day: '*', station: '*' });
  var boot1 = call(ctx, 'admin@test.invalid', 'bootstrap').data;
  var n = 0;
  Object.keys(SEED.checklists).forEach(function (id) {
    SEED.checklists[id].items.forEach(function (it) {
      var got = boot1.ref.checklistItems.filter(function (x) { return x.checklist_id === id && x.item_no === String(it.no); })[0];
      ok(got && got.text === it.text, 'Mismatch ' + id + '#' + it.no); n++;
    });
    eq(boot1.ref.checklists.filter(function (c) { return c.checklist_id === id; })[0].title, SEED.checklists[id].title);
  });
  Object.keys(SEED.osces).forEach(function (id) {
    var o = SEED.osces[id];
    Object.keys(o.roles).forEach(function (r) { o.roles[r].items.forEach(function (it) {
      var got = boot1.ref.osceItems.filter(function (x) { return x.osce_id === id && x.role_no === r && x.code === it.code; })[0];
      ok(got && got.text === it.text && got.role_title === o.roles[r].role, 'Mismatch ' + id + ' ' + it.code); n++; }); });
    o.common.forEach(function (it) { ok(boot1.ref.osceItems.some(function (x) { return x.osce_id === id && x.section === 'common' && x.code === it.code && x.text === it.text; })); n++; });
    o.team_rubric.forEach(function (it) { ok(boot1.ref.osceItems.some(function (x) { return x.osce_id === id && x.section === 'rubric' && x.code === String(it.no) && x.text === it.text; })); n++; });
    var det = boot1.ref.osceScenarios.filter(function (s) { return s.osce_id === id; })[0].details;
    eq(det.progressive_info, o.progressive_info); eq(det.candidate_instructions, o.candidate_instructions);
  });
  ok(n === 98 + 4 * (20 + 3 + 6), 'compared ' + n + ' texts');
});
test('10.4b', 'Sheet coercion guard: "=", numeric and date-looking strings are stored as plain text', function () {
  var seed = JSON.parse(JSON.stringify(SEED));
  seed.checklists.A1.items[0].text = '=SUM(1,2) stays text';      // throw-away variant of the seed, in memory only
  seed.checklists.A1.items[1].text = '0012';
  seed.checklists.A1.items[2].text = '16/11/2026';
  var ctx = boot({ seed: seed });
  var it = rows(ctx, 'ChecklistItems').filter(function (i) { return i.checklist_id === 'A1'; });
  eq([it[0].text, it[1].text, it[2].text], ['=SUM(1,2) stays text', '0012', '16/11/2026']);
  eq(rows(ctx, 'Timetable')[0].date, '15/11/2026', 'timetable dates are not converted');
});

// ================= §10.5 Permissions ==================================
function staffCtx(now) {
  var ctx = boot({ now: now || muscat(2, '11:20') });
  addUser(ctx, { email: 'admin@test.invalid', name: 'Admin', role: 'admin', day: '*', station: '*' });
  addUser(ctx, { email: 'facB@test.invalid', name: 'Fac B', role: 'facilitator', day: '2', station: 'B' });
  addUser(ctx, { email: 'leadB@test.invalid', name: 'Lead B', role: 'station_leader', day: '2', station: 'B' });
  addUser(ctx, { email: 'orgB@test.invalid', name: 'Org B', role: 'organizer', day: '2', station: 'B' });
  addUser(ctx, { email: 'osce@test.invalid', name: 'OSCE G1', role: 'facilitator', day: '2', station: 'OSCE-G1' });
  addUser(ctx, { email: 'oscelead@test.invalid', name: 'OSCE lead', role: 'station_leader', day: '2', station: 'OSCE' });
  return ctx;
}
function b1(ctx, who, pno, fn, extra) {
  return call(ctx, who, 'submitChecklist', Object.assign({ request_id: rid(), day: 2, station: 'B', round: 'R1', checklist_id: 'B1', participant_no: pno,
    scores: allScores(ctx, 'B1', fn || function () { return 2; }) }, extra || {}));
}
test('10.5', 'Facilitator of Station B Day 2 cannot open/submit Station A, Day 3, or an unassigned OSCE (server-side)', function () {
  var ctx = staffCtx();
  ok(b1(ctx, 'facB@test.invalid', '11').ok, 'own station works');
  var r;
  r = call(ctx, 'facB@test.invalid', 'stationStatus', { day: 2, station: 'A' }); eq(r.code, 'FORBIDDEN', 'view A');
  r = call(ctx, 'facB@test.invalid', 'submitChecklist', { request_id: rid(), day: 2, station: 'A', round: 'R1', checklist_id: 'A1', participant_no: '1', scores: allScores(ctx, 'A1', function () { return 2; }) });
  eq(r.code, 'FORBIDDEN', 'submit A');
  r = call(ctx, 'facB@test.invalid', 'stationStatus', { day: 3, station: 'B' }); eq(r.code, 'FORBIDDEN', 'view day 3');
  r = call(ctx, 'facB@test.invalid', 'submitChecklist', { request_id: rid(), day: 3, station: 'B', round: 'R1', checklist_id: 'TB', participant_no: '11', scores: allScores(ctx, 'TB', function () { return 2; }) });
  eq(r.code, 'FORBIDDEN', 'submit day 3');
  r = call(ctx, 'facB@test.invalid', 'osceTeam', { day: 2, group: 'G1', team: 'X' }); eq(r.code, 'FORBIDDEN', 'osce view');
  r = call(ctx, 'osce@test.invalid', 'osceTeam', { day: 2, group: 'G2', team: 'X' }); eq(r.code, 'FORBIDDEN', 'OSCE-G1 user cannot open G2 room');
  ok(call(ctx, 'osce@test.invalid', 'osceTeam', { day: 2, group: 'G1', team: 'X' }).ok, 'OSCE-G1 user opens G1');
  r = call(ctx, 'stranger@test.invalid', 'bootstrap'); eq(r.code, 'NOT_AUTHORISED', 'not on allow-list');
  r = call(ctx, 'facB@test.invalid', 'adminGet'); eq(r.code, 'FORBIDDEN', 'admin screen');
  r = b1(ctx, 'orgB@test.invalid', '12'); eq(r.code, 'FORBIDDEN', 'organizer cannot score by default');
  call(ctx, 'admin@test.invalid', 'adminSetConfig', { key: 'organizer_can_score', value: 'true' });
  ok(b1(ctx, 'orgB@test.invalid', '12').ok, 'organizer can score when organizer_can_score=true');
  r = b1(ctx, 'facB@test.invalid', '1'); eq(r.code, 'INVALID', 'participant from another group rejected');
  ok(b1(ctx, 'facB@test.invalid', '1', null, { is_reattempt: true }).ok, 're-attempt flag allows off-rotation participant');
  r = call(ctx, 'facB@test.invalid', 'finalise', { items: [{ kind: 'checklist', id: rows(ctx, 'Assessments')[0].assessment_id }] });
  ok(r.ok && r.data.finalised.length === 0 && r.data.errors.length === 1, 'facilitator cannot finalise');
});

// ================= §10.6 Submit rules =================================
test('10.6', 'Unscored item rejected; duplicate submit idempotent; post-finalise correction Admin-only with reason, audited', function () {
  var ctx = staffCtx();
  var s = allScores(ctx, 'B1', function () { return 2; }); delete s['13'];
  var r = call(ctx, 'facB@test.invalid', 'submitChecklist', { request_id: rid(), day: 2, station: 'B', round: 'R1', checklist_id: 'B1', participant_no: '11', scores: s });
  ok(!r.ok && r.errors.some(function (e) { return /Item 13/.test(e); }), 'unscored rejected');
  s['13'] = 3;
  r = call(ctx, 'facB@test.invalid', 'submitChecklist', { request_id: rid(), day: 2, station: 'B', round: 'R1', checklist_id: 'B1', participant_no: '11', scores: s });
  ok(!r.ok, 'score 3 rejected');
  eq(rows(ctx, 'Assessments').length, 0, 'nothing written for rejected submissions');

  var payload = { request_id: 'same-req', day: 2, station: 'B', round: 'R1', checklist_id: 'B1', participant_no: '11', scores: allScores(ctx, 'B1', function () { return 2; }) };
  var a = call(ctx, 'facB@test.invalid', 'submitChecklist', payload), b = call(ctx, 'facB@test.invalid', 'submitChecklist', payload);
  ok(a.ok && b.ok && b.data.duplicate, 'second identical request is a no-op');
  eq(rows(ctx, 'Assessments').length, 1); eq(rows(ctx, 'AssessmentScores').length, 13);

  // edit before finalise → version 2
  var e = b1(ctx, 'facB@test.invalid', '11', function (k) { return k === 0 ? 1 : 2; });
  eq(e.data.version, 2, 'own edit before finalise creates version 2');
  var id = e.data.assessment_id;
  ok(call(ctx, 'leadB@test.invalid', 'finalise', { items: [{ kind: 'checklist', id: id }] }).data.finalised.length === 1, 'leader finalises');
  r = b1(ctx, 'facB@test.invalid', '11'); eq(r.code, 'LOCKED', 'facilitator cannot edit after finalise');
  r = call(ctx, 'admin@test.invalid', 'submitChecklist', Object.assign({}, payload, { request_id: rid(), assessment_id: id }));
  eq(r.code, 'REASON', 'admin needs a reason');
  r = call(ctx, 'admin@test.invalid', 'submitChecklist', Object.assign({}, payload, { request_id: rid(), assessment_id: id, reason: 'Transcription error on item 1' }));
  ok(r.ok && r.data.status === 'finalised' && r.data.version === 4, 'admin correction → v4, stays finalised');
  var log = rows(ctx, 'AuditLog').filter(function (l) { return l.action === 'correct:checklist'; });
  ok(log.length === 1 && log[0].reason === 'Transcription error on item 1' && log[0].user === 'admin@test.invalid', 'audited with reason');
  var v = rows(ctx, 'Assessments').filter(function (x) { return x.assessment_id === id; });
  eq(v.map(function (x) { return x.version + ':' + x.status; }), ['1:submitted', '2:submitted', '3:finalised', '4:finalised'], 'append-only history');
  eq(v[3].assessor_email, 'facb@test.invalid', 'assessor kept'); eq(v[3].entered_by, 'admin@test.invalid', 'entered_by recorded');
  // unlock flow
  eq(call(ctx, 'leadB@test.invalid', 'unlock', { kind: 'checklist', id: id, reason: 'x' }).code, 'FORBIDDEN', 'only admin unlocks');
  ok(call(ctx, 'admin@test.invalid', 'unlock', { kind: 'checklist', id: id, reason: 'Re-assess item 4' }).ok);
  ok(b1(ctx, 'facB@test.invalid', '11').ok, 'facilitator can edit after unlock');
  ok(rows(ctx, 'AuditLog').some(function (l) { return l.action === 'unlock:checklist' && l.reason === 'Re-assess item 4'; }), 'unlock audited');
});

// ================= §10.7 / 10.8 Dashboard =============================
test('10.7', 'Dashboard numbers equal a hand calculation from the rows (synthetic, in-memory)', function () {
  var ctx = staffCtx(muscat(2, '11:20'));   // R1,R2,R3 started on Day 2
  // Station B (B1, 13 items): R1 = G2, R2 = G1, R3 = G4 → 36 expected.
  b1(ctx, 'facB@test.invalid', '11', function () { return 2; });                         // 26/26 = 100
  b1(ctx, 'facB@test.invalid', '12', function (k) { return k < 10 ? 2 : 0; });           // 20/26 = 76.9
  b1(ctx, 'facB@test.invalid', '13', function (k) { return k % 2 ? 1 : 2; });            // 7×2 + 6×1 = 20/26 = 76.9
  b1(ctx, 'leadB@test.invalid', '13', function () { return 0; });                        // second assessor: ignored by default rule
  var d = call(ctx, 'admin@test.invalid', 'dashboard', { filters: { day: 2, station: 'B' } }).data;
  var s = d.stations[0];
  eq([s.expected, s.submitted, s.completion_pct], [36, 3, 8.3], 'completion = 3 / 36');
  eq(s.assessed, 3);
  eq(s.mean_pct, Math.round((100 + 76.9 + 76.9) / 3 * 10) / 10, 'mean of primary %');
  eq(s.dist, { 2: 13 + 10 + 7, 1: 6, 0: 3 }, 'item score distribution');
  eq(s.items_scored, 39);
  eq(s.competent_item_rate, Math.round(1000 * 30 / 39) / 10, 'competent-item rate = 2s / items scored');
  var ia = d.items.B1;
  eq([ia[0].c2, ia[0].c1, ia[0].c0], [3, 0, 0], 'item 1'); eq([ia[1].c2, ia[1].c1, ia[1].c0], [2, 1, 0], 'item 2');
  eq([ia[12].c2, ia[12].c1, ia[12].c0], [2, 0, 1], 'item 13');
  // Station-leader rule switches the primary for participant 13
  call(ctx, 'admin@test.invalid', 'adminSetConfig', { key: 'primary_assessor_rule', value: 'station_leader' });
  d = call(ctx, 'admin@test.invalid', 'dashboard', { filters: { day: 2, station: 'B' } }).data;
  eq(d.stations[0].dist[0], 3 + 13, 'leader record used under station_leader rule');
  call(ctx, 'admin@test.invalid', 'adminSetConfig', { key: 'primary_assessor_rule', value: 'facilitator' });
  // Groups: G2 mean over its B1 scores
  d = call(ctx, 'admin@test.invalid', 'dashboard', { filters: { day: 2 } }).data;
  var g2 = d.groups.filter(function (g) { return g.group === 'G2'; })[0];
  eq(g2.n, 3); eq(g2.byStation['2|B'], s.mean_pct);
  // Progress grid
  var p11 = d.progress.rows.filter(function (r) { return r.participant_no === '11'; })[0];
  eq(p11.cells['2|B1'].status, 'submitted'); eq(p11.cells['2|A1'].status, 'not_started');
  // Role-aware scope: facilitator B sees only station B
  var df = call(ctx, 'facB@test.invalid', 'dashboard', { filters: {} }).data;
  eq(df.stations.map(function (x) { return x.day + x.station; }), ['2B'], 'scope');
  // Before any round started → expected 0, completion null (no division)
  ctx.__state.clock = muscat(2, '09:00');
  d = call(ctx, 'admin@test.invalid', 'dashboard', { filters: { day: 2, station: 'B' } }).data;
  eq([d.stations[0].expected, d.stations[0].completion_pct], [0, null]);
});

test('10.7b', 'OSCE: individual /16, rubric /12, completion = teams scored ÷ teams expected', function () {
  var ctx = staffCtx(muscat(2, '12:30'));
  var items = rows(ctx, 'OSCEItems').filter(function (i) { return i.osce_id === 'OSCE-1'; });
  function sc(role, fn) { var s = {}; items.filter(function (i) { return (i.section === 'role' && i.role_no === role) || i.section === 'common'; }).forEach(function (i, k) { s[i.code] = fn(k); }); return s; }
  // G1 Team X = teams a+b = participants 1–6
  var r = call(ctx, 'osce@test.invalid', 'submitOsce', { request_id: rid(), day: 2, osce_id: 'OSCE-1', group: 'G1', team: 'X', participant_no: '1', role_no: 'R1', scores: sc('R1', function () { return 2; }) });
  ok(r.ok, JSON.stringify(r)); eq([r.data.total, r.data.max], [16, 16]);
  r = call(ctx, 'osce@test.invalid', 'submitOsce', { request_id: rid(), day: 2, osce_id: 'OSCE-1', group: 'G1', team: 'X', participant_no: '2', role_no: 'R2', scores: sc('R2', function (k) { return k < 5 ? 1 : 2; }) });
  eq(r.data.total, 11);
  r = call(ctx, 'osce@test.invalid', 'submitOsce', { request_id: rid(), day: 2, osce_id: 'OSCE-1', group: 'G1', team: 'X', participant_no: '3', role_no: 'R2', scores: sc('R1', function () { return 2; }) });
  ok(!r.ok, 'items of another role rejected');
  r = call(ctx, 'osce@test.invalid', 'submitOsce', { request_id: rid(), day: 2, osce_id: 'OSCE-2', group: 'G1', team: 'X', participant_no: '3', role_no: 'R1', scores: {} });
  ok(!r.ok, 'Team X cannot run OSCE-2');
  r = call(ctx, 'osce@test.invalid', 'submitOsce', { request_id: rid(), day: 2, osce_id: 'OSCE-1', group: 'G1', team: 'X', participant_no: '7', role_no: 'R1', scores: sc('R1', function () { return 2; }) });
  ok(!r.ok, 'participant 7 (team c) is not in Team X');
  var rub = {}; items.filter(function (i) { return i.section === 'rubric'; }).forEach(function (i, k) { rub[i.code] = k < 3 ? 2 : 1; });
  r = call(ctx, 'osce@test.invalid', 'submitRubric', { request_id: rid(), day: 2, osce_id: 'OSCE-1', group: 'G1', team: 'X', scores: rub,
    role_assignment: { R1: '1', R2: '2', R3: 'unassigned', R4: 'unassigned' } });
  ok(r.ok); eq(r.data.total, 9);
  ok(rows(ctx, 'TeamRubric')[0].role_assignment.indexOf('unassigned') > 0, 'unassigned role stored');
  var d = call(ctx, 'admin@test.invalid', 'dashboard', { filters: { day: 2 } }).data;
  var s1 = d.osce.byScenario.filter(function (x) { return x.osce_id === 'OSCE-1'; })[0];
  eq([s1.n, s1.mean], [2, 13.5], 'OSCE-1 mean /16');
  eq(d.osce.rubric.filter(function (x) { return x.osce_id === 'OSCE-1'; })[0].mean_total, 9);
  eq(d.osce.rubric[0].criteria.map(function (c) { return c.mean; }), [2, 2, 2, 1, 1, 1]);
  eq(d.osce.completion[0], { day: '2', expected: 8, scored: 1, pct: 12.5 }, '4 groups × (X,Y) = 8 teams');
  eq(d.osce.byRole.filter(function (x) { return x.osce_id === 'OSCE-1' && x.role_no === 'R2'; })[0].mean, 11);
  ctx.__state.clock = muscat(2, '12:00');
  d = call(ctx, 'admin@test.invalid', 'dashboard', { filters: { day: 2 } }).data;
  eq(d.osce.completion[0].expected, 0, 'OSCE not started yet → nothing expected');
});

test('10.8', 'Threshold blank → no competency-rate percentage anywhere; set → computed', function () {
  var ctx = staffCtx();
  b1(ctx, 'facB@test.invalid', '11', function () { return 2; });
  b1(ctx, 'facB@test.invalid', '12', function (k) { return k < 6 ? 2 : 0; });   // 12/26 = 46.2
  var d = call(ctx, 'admin@test.invalid', 'dashboard', { filters: {} }).data;
  eq(d.threshold_set, false);
  ok(d.stations.every(function (s) { return s.competency_rate === null && s.competent_n === null; }), 'no competency rate');
  ok(!/competency_rate":\d/.test(JSON.stringify(d)), 'no numeric competency rate in payload');
  var ui = fs.readFileSync(path.join(ROOT, 'apps-script', 'App.html'), 'utf8');
  ok(/Threshold not set/.test(ui), 'UI shows "Threshold not set"');
  eq(call(ctx, 'admin@test.invalid', 'adminSetConfig', { key: 'competency_threshold_pct', value: '150' }).code, 'INVALID');
  call(ctx, 'admin@test.invalid', 'adminSetConfig', { key: 'competency_threshold_pct', value: '80' });
  d = call(ctx, 'admin@test.invalid', 'dashboard', { filters: { day: 2, station: 'B' } }).data;
  eq([d.stations[0].competent_n, d.stations[0].competency_rate], [1, 50]);
});

test('10.10', 'Station completion updates on the next dashboard read after a submission', function () {
  var ctx = staffCtx();
  var before = call(ctx, 'leadB@test.invalid', 'dashboard', { filters: { day: 2 } }).data;
  b1(ctx, 'facB@test.invalid', '14');
  var after = call(ctx, 'leadB@test.invalid', 'dashboard', { filters: { day: 2 } }).data;
  eq([before.stations[0].submitted, after.stations[0].submitted], [0, 1]);
  eq(after.refresh_sec, 60, 'client polls at dashboard_refresh_sec');
});

// ================= Extra checks =======================================
test('X.1', 'Owner is Admin; signed tokens verify; tampered/expired tokens rejected', function () {
  var ctx = staffCtx();
  ok(call(ctx, 'owner@test.invalid', 'adminGet').ok, 'owner = admin');
  var t = ctx.Logic.makeToken('facB@test.invalid', ctx.__state.clock + 60000, ctx.hmac_);
  as(ctx, ''); ok(ctx.api(t, 'bootstrap', {}).ok, 'token sign-in works');
  eq(ctx.api(t.slice(0, -2) + 'xx', 'bootstrap', {}).code, 'NOT_SIGNED_IN', 'tampered');
  var old = ctx.Logic.makeToken('facB@test.invalid', 1, ctx.hmac_);
  eq(ctx.api(old, 'bootstrap', {}).code, 'NOT_SIGNED_IN', 'expired');
});
test('X.4', 'A ticket minted by the separate Sign-in project verifies in the main app', function () {
  var ctx = staffCtx();
  var sgas = createGas({ activeEmail: 'FacB@test.invalid' }); sgas.__state.props.AUTH_SECRET = 'test-secret'; sgas.__state.props.MAIN_URL = 'https://main.invalid/exec';
  var out = '';
  sgas.HtmlService.createHtmlOutput = function (h) { out = h; return { setTitle: function () { return this; }, addMetaTag: function () { return this; } }; };
  var sctx = Object.assign({ JSON: JSON, encodeURIComponent: encodeURIComponent }, sgas); vm.createContext(sctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'signin', 'SignIn.gs'), 'utf8'), sctx);
  sctx.doGet();
  var m = /ticket=([^"&]+)/.exec(out); ok(m, 'ticket link rendered');
  var ticket = decodeURIComponent(m[1]);
  eq(ctx.Logic.verifyToken(ticket, Date.now(), ctx.hmac_), 'facb@test.invalid');
});
test('X.5', 'doGet exchanges a valid ticket for a session token; bad ticket gives none', function () {
  var ctx = staffCtx(), tpl = null;
  ctx.HtmlService.createTemplateFromFile = function () { tpl = { evaluate: function () { var o = { setTitle: function () { return o; }, addMetaTag: function () { return o; }, setXFrameOptionsMode: function () { return o; } }; return o; } }; return tpl; };
  ctx.__state.props.SIGNIN_URL = 'https://signin.invalid/exec?x=</script>';
  var ticket = ctx.Logic.makeToken('facb@test.invalid', ctx.__state.clock + 60000, ctx.hmac_);
  ctx.doGet({ parameter: { ticket: ticket } });
  var tok = JSON.parse(tpl.sessionTokenJs);
  eq(ctx.Logic.verifyToken(tok, ctx.__state.clock, ctx.hmac_), 'facb@test.invalid');
  ok(tpl.signinUrlJs.indexOf('</script>') < 0, 'script-safe injection');
  ctx.doGet({ parameter: { ticket: ticket.slice(0, -3) + 'abc' } });
  eq(JSON.parse(tpl.sessionTokenJs), '', 'tampered ticket rejected');
});
test('X.2', 'Roster CSV import updates names only for known numbers; attendance + readiness', function () {
  var ctx = staffCtx();
  var r = call(ctx, 'admin@test.invalid', 'adminImportRoster', { csv: 'participant_no,name,staff_id\n1,"Doe, J",S1\n99,X,Y', dryRun: true });
  ok(r.data.errors.length === 1 && /99/.test(r.data.errors[0]));
  r = call(ctx, 'admin@test.invalid', 'adminImportRoster', { csv: 'participant_no,name,staff_id\n1,"Doe, J",S1' });
  eq(r.data.imported, 1);
  var p1 = rows(ctx, 'Participants').filter(function (p) { return p.participant_no === '1'; })[0];
  eq([p1.name, p1.staff_id, p1.group, p1.team], ['Doe, J', 'S1', 'G1', 'a']);
  ok(call(ctx, 'orgB@test.invalid', 'attendanceSet', { day: 2, session: 'B-R1', participant_no: '11', present: true }).ok);
  eq(call(ctx, 'facB@test.invalid', 'attendanceSet', { day: 2, session: 'B-R1', participant_no: '11', present: true }).code, 'FORBIDDEN', 'facilitator cannot mark attendance');
  ok(call(ctx, 'orgB@test.invalid', 'attendanceSet', { day: 2, session: 'DAY', participant_no: '11', present: true }).ok);
  var d = call(ctx, 'admin@test.invalid', 'dashboard', { filters: { day: 2 } }).data;
  eq(d.attendance[0], { day: '2', present: 1, total: 48, pct: 2.1 });
  ok(call(ctx, 'admin@test.invalid', 'adminSetReadinessItems', { day: 2, station: 'B', text: 'Item one\nItem two' }).ok);
  ok(call(ctx, 'orgB@test.invalid', 'readinessSet', { day: 2, station: 'B', item_no: '2', checked: true }).ok);
  var rg = call(ctx, 'orgB@test.invalid', 'readinessGet', { day: 2, station: 'B' }).data;
  eq(rg.items.length, 2); eq(rg.state['2'].checked, true);
});
test('X.3', 'Looker views build from effective records', function () {
  var ctx = staffCtx();
  b1(ctx, 'facB@test.invalid', '11'); b1(ctx, 'facB@test.invalid', '11', function () { return 1; });
  ctx.refreshViews();
  var v = ctx.__ss.getSheetByName('v_assessments').getDataRange().getValues();
  eq(v.length, 2, 'one effective row'); eq(v[1][12], 13, 'latest version total (13×1)');
  eq(ctx.__ss.getSheetByName('v_item_scores').getLastRow(), 14);
});

// ------------------------------------------------------------------
var pass = results.filter(function (r) { return r.ok; }).length;
results.forEach(function (r) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.id + '  ' + r.name + (r.ok ? '' : '\n' + r.err)); });
console.log('\n' + pass + '/' + results.length + ' passed');
var mdIdx = process.argv.indexOf('--md');
if (mdIdx > 0) {
  var md = '| # | Test | Result |\n|---|---|---|\n' + results.map(function (r) { return '| ' + r.id + ' | ' + r.name.replace(/\|/g, '\\|') + ' | ' + (r.ok ? '✅ Pass' : '❌ Fail') + ' |'; }).join('\n') + '\n';
  fs.writeFileSync(process.argv[mdIdx + 1], md);
}
process.exit(pass === results.length ? 0 : 1);
