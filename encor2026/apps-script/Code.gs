/**
 * ENCOR 2026 Competency Assessment — Code.gs (server)
 * ------------------------------------------------------------------
 * Google Apps Script web app bound to the workbook.
 *  - doGet()      serves the single-page app (Index.html)
 *  - api()        single RPC entry point used by google.script.run
 *  - seedSheets() lives in Seed.gs
 * Business rules live in Logic.gs (pure, unit-tested).
 *
 * Deploy: Execute as "Me", access "Anyone with a Google account".
 * Every request is authorised here against the Users tab.
 */

// ------------------------------------------------------------------
// 1. Schema (one workbook, append-only data tabs)
// ------------------------------------------------------------------
var SCHEMA = {
  Config: ['key', 'value', 'note'],
  Users: ['email', 'name', 'role', 'day', 'station', 'active'],
  Participants: ['participant_no', 'name', 'staff_id', 'group', 'team', 'extra_flag'],
  Stations: ['day', 'station', 'topic', 'checklist_id', 'facilitator', 'subject_expert', 'organizer'],
  Rotation: ['day', 'round', 'time', 'group', 'station'],
  Timetable: ['day', 'date', 'time', 'duration', 'topic', 'objectives', 'speaker'],
  Scales: ['scale', 'score', 'label', 'meaning'],
  Checklists: ['checklist_id', 'title', 'day', 'item_count', 'max_score'],
  ChecklistItems: ['checklist_id', 'item_no', 'text'],
  OSCEScenarios: ['osce_id', 'day', 'title', 'format', 'max_individual_score', 'details_json'],
  OSCEItems: ['osce_id', 'section', 'role_no', 'role_title', 'code', 'text'],
  OSCEUnits: ['day', 'unit', 'teams', 'osce_id', 'label'],
  Assessments: ['assessment_id', 'version', 'request_id', 'day', 'station', 'round', 'checklist_id', 'participant_no',
    'assessor_email', 'assessor_role', 'entered_by', 'total', 'max', 'pct', 'comment', 'status', 'is_reattempt', 'reason', 'submitted_at'],
  AssessmentScores: ['assessment_id', 'version', 'item_no', 'score'],
  OSCEAssessments: ['osce_assessment_id', 'version', 'request_id', 'day', 'osce_id', 'group', 'team', 'participant_no', 'role_no',
    'role_items_total', 'common_total', 'total', 'max', 'assessor_email', 'assessor_role', 'entered_by', 'comment', 'status', 'reason', 'submitted_at'],
  OSCEScores: ['osce_assessment_id', 'version', 'code', 'score'],
  TeamRubric: ['rubric_id', 'version', 'request_id', 'day', 'osce_id', 'group', 'team', 'item_no', 'score', 'total', 'max',
    'role_assignment', 'assessor_email', 'assessor_role', 'entered_by', 'comment', 'status', 'reason', 'submitted_at'],
  Attendance: ['day', 'session', 'participant_no', 'present', 'recorded_by', 'timestamp'],
  ReadinessItems: ['day', 'station', 'item_no', 'item'],
  ReadinessLog: ['day', 'station', 'item_no', 'checked', 'recorded_by', 'timestamp'],
  AuditLog: ['timestamp', 'user', 'action', 'record_id', 'old', 'new', 'reason']
};

/** Config defaults written by seedSheets(). Only values the brief specifies. */
var CONFIG_DEFAULTS = [
  ['competency_threshold_pct', '', 'Blank until the committee approves a threshold (§8.1). No competency rate is shown while blank.'],
  ['organizer_can_score', 'false', 'Organizers do not assess per the programme (§4).'],
  ['dashboard_refresh_sec', '60', 'Dashboard auto-refresh interval in seconds.'],
  ['primary_assessor_rule', 'facilitator', 'facilitator | station_leader | average (§8.6).'],
  ['session_hours', '12', 'How long a sign-in lasts on a device.'],
  ['osce_start_time_day2', '', 'HH:MM. Filled by seedSheets() from the timetable; used for OSCE completion.'],
  ['osce_start_time_day3', '', 'HH:MM. Filled by seedSheets() from the timetable; used for OSCE completion.']
];

var KIND = {
  checklist: { main: 'Assessments', id: 'assessment_id', scores: 'AssessmentScores', key: 'item_no' },
  osce: { main: 'OSCEAssessments', id: 'osce_assessment_id', scores: 'OSCEScores', key: 'code' },
  rubric: { main: 'TeamRubric', id: 'rubric_id', scores: null, key: 'item_no' }
};

// ------------------------------------------------------------------
// 2. Sheet helpers (request-scoped cache)
// ------------------------------------------------------------------
var REQ_CACHE_ = {};

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

/** Get (or create with header) a tab. All data columns are plain text so seed text is never coerced. */
function sheet_(name) {
  var ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    var h = SCHEMA[name];
    if (h) {
      sh.getRange(1, 1, 1, h.length).setNumberFormat('@').setValues([h]);
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

/** Read a tab into objects (all values as strings). */
function readTable_(name) {
  if (REQ_CACHE_[name]) return REQ_CACHE_[name];
  var sh = ss_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 1) return (REQ_CACHE_[name] = []);
  var values = sh.getRange(1, 1, sh.getLastRow(), Math.max(1, sh.getLastColumn())).getValues();
  var head = values[0].map(String);
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var o = { _row: r + 1 }, empty = true;
    for (var c = 0; c < head.length; c++) {
      var v = values[r][c];
      o[head[c]] = v === null || v === undefined ? '' : String(v);
      if (o[head[c]] !== '') empty = false;
    }
    if (!empty) out.push(o);
  }
  return (REQ_CACHE_[name] = out);
}

/** Append object rows in header order, as plain text. */
function appendRows_(name, objs) {
  if (!objs.length) return;
  var sh = sheet_(name), h = SCHEMA[name];
  var rows = objs.map(function (o) { return h.map(function (k) { return o[k] === undefined || o[k] === null ? '' : String(o[k]); }); });
  var start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, h.length).setNumberFormat('@').setValues(rows);
  delete REQ_CACHE_[name];
}

/** Overwrite one existing row (only used for Users / Participants / Config — not for scores). */
function writeRow_(name, rowNo, obj) {
  var sh = sheet_(name), h = SCHEMA[name];
  sh.getRange(rowNo, 1, 1, h.length).setNumberFormat('@').setValues([h.map(function (k) { return obj[k] === undefined ? '' : String(obj[k]); })]);
  delete REQ_CACHE_[name];
}

function nowIso_() { return Utilities.formatDate(new Date(), 'Asia/Muscat', "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"); }
function uuid_() { return Utilities.getUuid(); }

function config_() {
  var c = {};
  readTable_('Config').forEach(function (r) { c[r.key] = r.value; });
  return c;
}

function audit_(user, action, recordId, oldV, newV, reason) {
  appendRows_('AuditLog', [{ timestamp: nowIso_(), user: user, action: action, record_id: recordId,
    old: oldV === undefined ? '' : JSON.stringify(oldV), new: newV === undefined ? '' : JSON.stringify(newV), reason: reason || '' }]);
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { REQ_CACHE_ = {}; return fn(); } finally { lock.releaseLock(); }
}

// ------------------------------------------------------------------
// 3. Identity
// ------------------------------------------------------------------
function hmac_(text) {
  var secret = PropertiesService.getScriptProperties().getProperty('AUTH_SECRET');
  if (!secret) throw new Error('AUTH_SECRET is not set. Run setupAuth() once.');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text, secret)).replace(/=+$/, '');
}

/**
 * The caller's e-mail. Same-domain users are identified by Session directly;
 * other Google accounts (e.g. @gmail.com) come via the Sign-in helper ticket → signed token.
 */
function callerEmail_(token) {
  var e = '';
  try { e = Session.getActiveUser().getEmail(); } catch (err) { e = ''; }
  if (e) return e.toLowerCase();
  if (token && PropertiesService.getScriptProperties().getProperty('AUTH_SECRET')) return Logic.verifyToken(token, Date.now(), hmac_);
  return '';
}
function ownerEmail_() { try { return (Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) { return ''; } }

function ctx_(token) {
  var email = callerEmail_(token);
  var owner = ownerEmail_();
  return Logic.buildCtx(email, !!email && email === owner, readTable_('Users'), config_());
}

/** One-time: creates the HMAC secret shared with the Sign-in helper project. */
function setupAuth() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('AUTH_SECRET')) p.setProperty('AUTH_SECRET', Utilities.getUuid() + Utilities.getUuid());
  Logger.log('Copy this AUTH_SECRET into the Sign-in project Script Properties:\n' + p.getProperty('AUTH_SECRET'));
}

// ------------------------------------------------------------------
// 4. Web entry points
// ------------------------------------------------------------------
function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  var token = '';
  var ticket = e && e.parameter && e.parameter.ticket;
  if (ticket && PropertiesService.getScriptProperties().getProperty('AUTH_SECRET')) {
    var email = Logic.verifyToken(ticket, Date.now(), hmac_);
    if (email) {
      var hours = Number(config_().session_hours) || 12;
      token = Logic.makeToken(email, Date.now() + hours * 3600 * 1000, hmac_);
    }
  }
  // Injected as JSON literals; '<' escaped so no value can close the <script> tag.
  var js = function (v) { return JSON.stringify(String(v || '')).replace(/</g, '\\u003c'); };
  t.sessionTokenJs = js(token);
  t.signinUrlJs = js(PropertiesService.getScriptProperties().getProperty('SIGNIN_URL'));
  return t.evaluate()
    .setTitle('ENCOR 2026 Assessment')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

/**
 * Single RPC endpoint. Always returns {ok:true, data} or {ok:false, code, error, errors}.
 */
function api(token, action, payload) {
  REQ_CACHE_ = {};
  payload = payload || {};
  try {
    var ctx = ctx_(token);
    if (!ctx.email) return { ok: false, code: 'NOT_SIGNED_IN', error: 'Please sign in with your Google account.' };
    if (!ctx.authorised) return { ok: false, code: 'NOT_AUTHORISED', error: 'Not authorised' };
    var fn = API_[action];
    if (!fn) return { ok: false, code: 'BAD_ACTION', error: 'Unknown action ' + action };
    var data = fn(ctx, payload);
    if (data && data.__error) return { ok: false, code: data.code || 'INVALID', error: data.__error, errors: data.errors || [] };
    return { ok: true, data: data };
  } catch (err) {
    return { ok: false, code: 'SERVER', error: String(err && err.message || err) };
  }
}
function fail_(msg, errors, code) { return { __error: msg, errors: errors || [], code: code || 'INVALID' }; }
function deny_(chk) { return fail_(chk.reason || 'Not authorised', [], 'FORBIDDEN'); }

// ------------------------------------------------------------------
// 5. Reference data
// ------------------------------------------------------------------
function refs_() {
  var dayDates = {};
  readTable_('Timetable').forEach(function (t) { var d = Logic.parseDate(t.date); if (d && !dayDates[t.day]) dayDates[t.day] = d; });
  var items = Logic.groupBy(readTable_('ChecklistItems'), function (i) { return i.checklist_id; });
  return {
    participants: readTable_('Participants'), stations: readTable_('Stations'), rotation: readTable_('Rotation'),
    timetable: readTable_('Timetable'), checklists: readTable_('Checklists'), checklistItems: readTable_('ChecklistItems'),
    items: items, osceScenarios: readTable_('OSCEScenarios'), osceItems: readTable_('OSCEItems'), osceUnits: readTable_('OSCEUnits'),
    scales: readTable_('Scales'), dayDates: dayDates
  };
}
function strip_(rows) { return rows.map(function (r) { var o = {}; Object.keys(r).forEach(function (k) { if (k !== '_row') o[k] = r[k]; }); return o; }); }

/** Per-day access matrix for the client (server re-checks every action anyway). */
function accessMatrix_(ctx) {
  var m = {};
  ['1', '2', '3'].forEach(function (d) {
    var day = { stations: {}, osce: {}, day: { attendance: Logic.can(ctx, 'attendance', d, '').ok, view: Logic.can(ctx, 'view', d, '').ok } };
    Logic.STATIONS.forEach(function (s) {
      day.stations[s] = { view: Logic.can(ctx, 'view', d, s).ok, score: Logic.can(ctx, 'score', d, s).ok, finalise: Logic.can(ctx, 'finalise', d, s).ok,
        attendance: Logic.can(ctx, 'attendance', d, s).ok, readiness: Logic.can(ctx, 'readiness', d, s).ok };
    });
    Logic.GROUPS.forEach(function (g) {
      day.osce[g] = { view: Logic.can(ctx, 'view', d, 'OSCE', g).ok, score: Logic.can(ctx, 'score', d, 'OSCE', g).ok, finalise: Logic.can(ctx, 'finalise', d, 'OSCE', g).ok };
    });
    m[d] = day;
  });
  return m;
}

// ------------------------------------------------------------------
// 6. Versioned save (shared by checklist / OSCE / rubric)
// ------------------------------------------------------------------
function findByRequest_(kind, requestId) {
  if (!requestId) return null;
  return readTable_(KIND[kind].main).filter(function (r) { return r.request_id === requestId; })[0] || null;
}
function versionsOf_(kind, id) {
  var rows = readTable_(KIND[kind].main).filter(function (r) { return r[KIND[kind].id] === id; });
  if (kind === 'rubric') { // one row per item: collapse to one head per version
    var seen = {}; rows = rows.filter(function (r) { if (seen[r.version]) return false; seen[r.version] = 1; return true; });
  }
  return rows;
}

/**
 * Decide how a submission is stored.
 * Returns {id, version, assessorEmail, assessorRole, action} or an error object.
 *  - new record                      → version 1, action 'create'
 *  - own unlocked record             → next version, 'update'
 *  - finalised record                → Admin only, reason required, stays 'finalised', 'correct'
 *  - Admin editing someone else's    → reason required, 'correct'
 */
function planSave_(ctx, kind, existingId, scoreRole) {
  if (!existingId) return { id: uuid_(), version: 1, assessorEmail: ctx.email, assessorRole: scoreRole, action: 'create', status: 'submitted' };
  var vers = versionsOf_(kind, existingId);
  if (!vers.length) return fail_('Record not found.');
  var st = Logic.recordState(vers), head = st.latest;
  var own = head.assessor_email.toLowerCase() === ctx.email;
  if (st.locked) {
    if (!ctx.isAdmin) return fail_('This record is finalised. Only an Admin can correct it.', [], 'LOCKED');
    return { id: existingId, version: Logic.nextVersion(vers), assessorEmail: head.assessor_email, assessorRole: head.assessor_role, action: 'correct', status: 'finalised', needsReason: true, old: head };
  }
  if (!own && !ctx.isAdmin) return fail_('You can only edit your own submissions.', [], 'FORBIDDEN');
  return { id: existingId, version: Logic.nextVersion(vers), assessorEmail: head.assessor_email, assessorRole: head.assessor_role,
    action: own ? 'update' : 'correct', status: 'submitted', needsReason: !own, old: head };
}

// ------------------------------------------------------------------
// 7. API actions
// ------------------------------------------------------------------
var API_ = {};

API_.bootstrap = function (ctx) {
  var r = refs_(), cfg = config_();
  var detail = {};
  r.osceScenarios.forEach(function (o) { try { detail[o.osce_id] = JSON.parse(o.details_json); } catch (e) { detail[o.osce_id] = {}; } });
  return {
    me: { email: ctx.email, name: ctx.name, isAdmin: ctx.isAdmin, roles: ctx.rows.map(function (x) { return { role: x.role, days: x.days, stations: x.stations }; }) },
    access: accessMatrix_(ctx),
    config: { competency_threshold_pct: cfg.competency_threshold_pct || '', dashboard_refresh_sec: cfg.dashboard_refresh_sec || '60',
      organizer_can_score: cfg.organizer_can_score || 'false', primary_assessor_rule: cfg.primary_assessor_rule || 'facilitator' },
    ref: {
      timetable: strip_(r.timetable), stations: strip_(r.stations), rotation: strip_(r.rotation), checklists: strip_(r.checklists),
      checklistItems: strip_(r.checklistItems), osceScenarios: strip_(r.osceScenarios).map(function (o) { o.details = detail[o.osce_id]; delete o.details_json; return o; }),
      osceItems: strip_(r.osceItems), osceUnits: strip_(r.osceUnits), participants: strip_(r.participants), scales: strip_(r.scales), dayDates: r.dayDates
    },
    now: Date.now()
  };
};

/** Participants + statuses for one station on one day (all rounds; client filters by round). */
API_.stationStatus = function (ctx, p) {
  var day = Logic.toDay(p.day), st = Logic.toStation(p.station);
  var chk = Logic.can(ctx, 'view', day, st); if (!chk.ok) return deny_(chk);
  var station = readTable_('Stations').filter(function (s) { return s.day === day && s.station === st; })[0];
  if (!station) return fail_('Unknown station.');
  var rows = readTable_('Assessments').filter(function (a) { return a.day === day && a.checklist_id === station.checklist_id; });
  var byId = Logic.groupBy(rows, function (a) { return a.assessment_id; });
  var status = {};
  Object.keys(byId).forEach(function (id) {
    var s = Logic.recordState(byId[id]), h = s.latest;
    var e = status[h.participant_no] = status[h.participant_no] || { mine: null, others: 0, finalised: false };
    if (h.assessor_email.toLowerCase() === ctx.email) e.mine = { id: id, status: s.status, locked: s.locked, pct: h.pct, version: h.version };
    else e.others++;
    if (s.locked) e.finalised = true;
  });
  return { checklist_id: station.checklist_id, status: status };
};

/** Load my record (or, for Admin/Leader, a given record id) with its latest scores. */
API_.getRecord = function (ctx, p) {
  var kind = p.kind || 'checklist', K = KIND[kind];
  var id = p.id;
  if (!id && kind === 'checklist') {
    var mine = readTable_('Assessments').filter(function (a) {
      return a.day === Logic.toDay(p.day) && a.checklist_id === p.checklist_id && a.participant_no === String(p.participant_no) && a.assessor_email.toLowerCase() === ctx.email;
    })[0];
    id = mine && mine.assessment_id;
  }
  if (!id && kind === 'osce') {
    var mo = readTable_('OSCEAssessments').filter(function (a) {
      return a.day === Logic.toDay(p.day) && a.osce_id === p.osce_id && a.participant_no === String(p.participant_no) && a.assessor_email.toLowerCase() === ctx.email;
    })[0];
    id = mo && mo.osce_assessment_id;
  }
  if (!id && kind === 'rubric') {
    var mr = readTable_('TeamRubric').filter(function (a) {
      return a.day === Logic.toDay(p.day) && a.osce_id === p.osce_id && a.group === p.group && a.team === p.team && a.assessor_email.toLowerCase() === ctx.email;
    })[0];
    id = mr && mr.rubric_id;
  }
  if (!id) return { record: null };
  var vers = versionsOf_(kind, id); if (!vers.length) return { record: null };
  var s = Logic.recordState(vers), h = s.latest;
  var chk = kind === 'checklist' ? Logic.can(ctx, 'view', h.day, h.station) : Logic.can(ctx, 'view', h.day, 'OSCE', h.group);
  if (!chk.ok) return deny_(chk);
  if (h.assessor_email.toLowerCase() !== ctx.email && !ctx.isAdmin && chk.role !== 'station_leader') return fail_('Not your record.', [], 'FORBIDDEN');
  var scores = {};
  if (K.scores) readTable_(K.scores).filter(function (x) { return x[K.id] === id && x.version === h.version; }).forEach(function (x) { scores[x[K.key]] = x.score; });
  else readTable_('TeamRubric').filter(function (x) { return x.rubric_id === id && x.version === h.version; }).forEach(function (x) { scores[x.item_no] = x.score; });
  var rec = strip_([h])[0]; rec.scores = scores; rec.locked = s.locked; rec.state = s.status;
  return { record: rec };
};

API_.submitChecklist = function (ctx, p) {
  return withLock_(function () {
    var dup = findByRequest_('checklist', p.request_id);
    if (dup) return { duplicate: true, assessment_id: dup.assessment_id, version: dup.version };
    var day = Logic.toDay(p.day), st = Logic.toStation(p.station);
    var chk = Logic.can(ctx, 'score', day, st); if (!chk.ok) return deny_(chk);
    var r = refs_();
    var v = Logic.validateChecklist(p, r);
    if (!v.ok) return fail_('Submission rejected.', v.errors);
    var existingId = p.assessment_id || (readTable_('Assessments').filter(function (a) {
      return a.day === day && a.checklist_id === p.checklist_id && a.participant_no === String(p.participant_no) && a.assessor_email.toLowerCase() === ctx.email;
    })[0] || {}).assessment_id;
    var plan = planSave_(ctx, 'checklist', existingId, chk.role);
    if (plan.__error) return plan;
    if (plan.needsReason && !String(p.reason || '').trim()) return fail_('A reason is required for this correction.', [], 'REASON');
    var now = nowIso_();
    appendRows_('Assessments', [{
      assessment_id: plan.id, version: plan.version, request_id: p.request_id, day: day, station: st, round: Logic.toRound(p.round),
      checklist_id: p.checklist_id, participant_no: String(p.participant_no), assessor_email: plan.assessorEmail, assessor_role: plan.assessorRole,
      entered_by: ctx.email, total: v.total, max: v.max, pct: v.pct, comment: p.comment || '', status: plan.status,
      is_reattempt: p.is_reattempt ? 'true' : 'false', reason: p.reason || '', submitted_at: now
    }]);
    appendRows_('AssessmentScores', r.items[p.checklist_id].map(function (it) {
      return { assessment_id: plan.id, version: plan.version, item_no: it.item_no, score: p.scores[it.item_no] };
    }));
    audit_(ctx.email, plan.action + ':checklist', plan.id + '#' + plan.version,
      plan.old ? { total: plan.old.total, status: plan.old.status, version: plan.old.version } : undefined,
      { participant_no: p.participant_no, checklist_id: p.checklist_id, total: v.total, max: v.max, status: plan.status }, p.reason);
    return { assessment_id: plan.id, version: plan.version, total: v.total, max: v.max, pct: v.pct, status: plan.status };
  });
};

API_.submitOsce = function (ctx, p) {
  return withLock_(function () {
    var dup = findByRequest_('osce', p.request_id);
    if (dup) return { duplicate: true, osce_assessment_id: dup.osce_assessment_id, version: dup.version };
    var day = Logic.toDay(p.day), g = Logic.toGroup(p.group);
    var chk = Logic.can(ctx, 'score', day, 'OSCE', g); if (!chk.ok) return deny_(chk);
    var r = refs_();
    var v = Logic.validateOsce(p, r);
    if (!v.ok) return fail_('Submission rejected.', v.errors);
    var existingId = p.osce_assessment_id || (readTable_('OSCEAssessments').filter(function (a) {
      return a.day === day && a.osce_id === p.osce_id && a.participant_no === String(p.participant_no) && a.assessor_email.toLowerCase() === ctx.email;
    })[0] || {}).osce_assessment_id;
    var plan = planSave_(ctx, 'osce', existingId, chk.role);
    if (plan.__error) return plan;
    if (plan.needsReason && !String(p.reason || '').trim()) return fail_('A reason is required for this correction.', [], 'REASON');
    appendRows_('OSCEAssessments', [{
      osce_assessment_id: plan.id, version: plan.version, request_id: p.request_id, day: day, osce_id: p.osce_id, group: g, team: p.team,
      participant_no: String(p.participant_no), role_no: p.role_no, role_items_total: v.role_items_total, common_total: v.common_total,
      total: v.total, max: v.max, assessor_email: plan.assessorEmail, assessor_role: plan.assessorRole, entered_by: ctx.email,
      comment: p.comment || '', status: plan.status, reason: p.reason || '', submitted_at: nowIso_()
    }]);
    appendRows_('OSCEScores', Object.keys(p.scores).map(function (code) {
      return { osce_assessment_id: plan.id, version: plan.version, code: code, score: p.scores[code] };
    }));
    audit_(ctx.email, plan.action + ':osce', plan.id + '#' + plan.version, plan.old ? { total: plan.old.total, status: plan.old.status } : undefined,
      { osce_id: p.osce_id, participant_no: p.participant_no, role_no: p.role_no, total: v.total }, p.reason);
    return { osce_assessment_id: plan.id, version: plan.version, total: v.total, max: v.max, status: plan.status };
  });
};

API_.submitRubric = function (ctx, p) {
  return withLock_(function () {
    var dup = findByRequest_('rubric', p.request_id);
    if (dup) return { duplicate: true, rubric_id: dup.rubric_id, version: dup.version };
    var day = Logic.toDay(p.day), g = Logic.toGroup(p.group);
    var chk = Logic.can(ctx, 'score', day, 'OSCE', g); if (!chk.ok) return deny_(chk);
    var r = refs_();
    var v = Logic.validateRubric(p, r);
    if (!v.ok) return fail_('Submission rejected.', v.errors);
    var existingId = p.rubric_id || (readTable_('TeamRubric').filter(function (a) {
      return a.day === day && a.osce_id === p.osce_id && a.group === g && a.team === p.team && a.assessor_email.toLowerCase() === ctx.email;
    })[0] || {}).rubric_id;
    var plan = planSave_(ctx, 'rubric', existingId, chk.role);
    if (plan.__error) return plan;
    if (plan.needsReason && !String(p.reason || '').trim()) return fail_('A reason is required for this correction.', [], 'REASON');
    var now = nowIso_();
    var items = r.osceItems.filter(function (i) { return i.osce_id === p.osce_id && i.section === 'rubric'; });
    appendRows_('TeamRubric', items.map(function (i) {
      return { rubric_id: plan.id, version: plan.version, request_id: p.request_id, day: day, osce_id: p.osce_id, group: g, team: p.team,
        item_no: i.code, score: p.scores[i.code], total: v.total, max: v.max, role_assignment: JSON.stringify(p.role_assignment || {}),
        assessor_email: plan.assessorEmail, assessor_role: plan.assessorRole, entered_by: ctx.email, comment: p.comment || '',
        status: plan.status, reason: p.reason || '', submitted_at: now };
    }));
    audit_(ctx.email, plan.action + ':rubric', plan.id + '#' + plan.version, plan.old ? { total: plan.old.total, status: plan.old.status } : undefined,
      { osce_id: p.osce_id, group: g, team: p.team, total: v.total }, p.reason);
    return { rubric_id: plan.id, version: plan.version, total: v.total, max: v.max, status: plan.status };
  });
};

/** Review list for a station (or an OSCE day) — latest state of every record. */
API_.reviewList = function (ctx, p) {
  var day = Logic.toDay(p.day), out = [];
  if (p.station === 'OSCE') {
    var chkAny = Logic.GROUPS.some(function (g) { return Logic.can(ctx, 'view', day, 'OSCE', g).ok; });
    if (!chkAny) return fail_('Not assigned to this OSCE.', [], 'FORBIDDEN');
    ['osce', 'rubric'].forEach(function (kind) {
      var rows = readTable_(KIND[kind].main).filter(function (a) { return a.day === day && Logic.can(ctx, 'view', day, 'OSCE', a.group).ok; });
      var byId = Logic.groupBy(rows, function (a) { return a[KIND[kind].id]; });
      Object.keys(byId).forEach(function (id) {
        var s = Logic.recordState(byId[id]), h = s.latest;
        out.push({ kind: kind, id: id, version: h.version, osce_id: h.osce_id, group: h.group, team: h.team, participant_no: h.participant_no || '',
          role_no: h.role_no || '', total: h.total, max: h.max, assessor_email: h.assessor_email, assessor_role: h.assessor_role,
          status: s.status, locked: s.locked, submitted_at: h.submitted_at, canFinalise: Logic.can(ctx, 'finalise', day, 'OSCE', h.group).ok });
      });
    });
  } else {
    var st = Logic.toStation(p.station);
    var chk = Logic.can(ctx, 'view', day, st); if (!chk.ok) return deny_(chk);
    var fin = Logic.can(ctx, 'finalise', day, st).ok;
    var rows = readTable_('Assessments').filter(function (a) { return a.day === day && a.station === st; });
    var byId = Logic.groupBy(rows, function (a) { return a.assessment_id; });
    Object.keys(byId).forEach(function (id) {
      var s = Logic.recordState(byId[id]), h = s.latest;
      out.push({ kind: 'checklist', id: id, version: h.version, checklist_id: h.checklist_id, round: h.round, participant_no: h.participant_no,
        total: h.total, max: h.max, pct: h.pct, assessor_email: h.assessor_email, assessor_role: h.assessor_role, is_reattempt: h.is_reattempt,
        status: s.status, locked: s.locked, submitted_at: h.submitted_at, canFinalise: fin });
    });
  }
  out.sort(function (a, b) { return Number(a.participant_no || 0) - Number(b.participant_no || 0); });
  return { records: out, isAdmin: ctx.isAdmin };
};

/** Copy the latest version of each record as a new version with a new status. */
function restamp_(ctx, kind, id, newStatus, reason) {
  var K = KIND[kind], all = readTable_(K.main).filter(function (r) { return r[K.id] === id; });
  if (!all.length) return fail_('Record ' + id + ' not found.');
  var heads = versionsOf_(kind, id), s = Logic.recordState(heads), h = s.latest, v = Logic.nextVersion(heads), now = nowIso_();
  var rows = all.filter(function (r) { return r.version === h.version; }).map(function (r) {
    var o = {}; Object.keys(r).forEach(function (k) { if (k !== '_row') o[k] = r[k]; });
    o.version = v; o.request_id = ''; o.status = newStatus; o.entered_by = ctx.email; o.reason = reason || ''; o.submitted_at = now;
    return o;
  });
  appendRows_(K.main, rows);
  if (K.scores) appendRows_(K.scores, readTable_(K.scores).filter(function (x) { return x[K.id] === id && x.version === h.version; }).map(function (x) {
    var o = {}; o[K.id] = id; o.version = v; o[K.key] = x[K.key]; o.score = x.score; return o;
  }));
  audit_(ctx.email, (newStatus === 'finalised' ? 'finalise' : 'unlock') + ':' + kind, id + '#' + v, { status: h.status, version: h.version }, { status: newStatus, version: v }, reason);
  return { id: id, version: v, status: newStatus };
}

API_.finalise = function (ctx, p) {
  return withLock_(function () {
    var done = [], errors = [];
    (p.items || []).forEach(function (it) {
      var K = KIND[it.kind]; if (!K) { errors.push('Bad kind'); return; }
      var heads = versionsOf_(it.kind, it.id); if (!heads.length) { errors.push(it.id + ': not found'); return; }
      var s = Logic.recordState(heads), h = s.latest;
      var chk = it.kind === 'checklist' ? Logic.can(ctx, 'finalise', h.day, h.station) : Logic.can(ctx, 'finalise', h.day, 'OSCE', h.group);
      if (!chk.ok) { errors.push(it.id + ': ' + chk.reason); return; }
      if (s.locked) { errors.push(it.id + ': already finalised'); return; }
      if (h.status === 'unlocked') { errors.push(it.id + ': unlocked for correction — the assessor must resubmit first'); return; }
      done.push(restamp_(ctx, it.kind, it.id, 'finalised', ''));
    });
    return { finalised: done, errors: errors };
  });
};

API_.unlock = function (ctx, p) {
  if (!ctx.isAdmin) return fail_('Admin only.', [], 'FORBIDDEN');
  if (!String(p.reason || '').trim()) return fail_('A reason is required to unlock.', [], 'REASON');
  return withLock_(function () {
    var heads = versionsOf_(p.kind, p.id); if (!heads.length) return fail_('Not found.');
    if (!Logic.recordState(heads).locked) return fail_('Record is not finalised.');
    return restamp_(ctx, p.kind, p.id, 'unlocked', p.reason);
  });
};

/** OSCE team: members, my individual records, my rubric. */
API_.osceTeam = function (ctx, p) {
  var day = Logic.toDay(p.day), g = Logic.toGroup(p.group);
  var chk = Logic.can(ctx, 'view', day, 'OSCE', g); if (!chk.ok) return deny_(chk);
  var r = refs_();
  var unit = Logic.unitsFor(r.osceUnits, day).filter(function (u) { return u.unit === p.team; })[0];
  if (!unit) return fail_('Unknown team.');
  var members = Logic.unitMembers(r.participants, g, unit).map(function (x) { return x.participant_no; });
  var my = {}, others = {};
  var byId = Logic.groupBy(readTable_('OSCEAssessments').filter(function (a) { return a.day === day && a.osce_id === unit.osce_id && a.group === g && a.team === unit.unit; }),
    function (a) { return a.osce_assessment_id; });
  Object.keys(byId).forEach(function (id) {
    var s = Logic.recordState(byId[id]), h = s.latest;
    if (h.assessor_email.toLowerCase() === ctx.email) my[h.participant_no] = { id: id, role_no: h.role_no, total: h.total, max: h.max, status: s.status, locked: s.locked };
    else others[h.participant_no] = (others[h.participant_no] || 0) + 1;
  });
  var rub = API_.getRecord(ctx, { kind: 'rubric', day: day, osce_id: unit.osce_id, group: g, team: unit.unit });
  var roleAssign = {};
  if (rub.record) { try { roleAssign = JSON.parse(rub.record.role_assignment || '{}'); } catch (e) { roleAssign = {}; } }
  else Object.keys(my).forEach(function (pno) { if (my[pno].role_no) roleAssign[my[pno].role_no] = (roleAssign[my[pno].role_no] ? roleAssign[my[pno].role_no] + ',' : '') + pno; });
  return { unit: unit, members: members, mine: my, others: others, rubric: rub.record || null, role_assignment: roleAssign };
};

// Attendance ---------------------------------------------------------
API_.attendanceGet = function (ctx, p) {
  var day = Logic.toDay(p.day), session = String(p.session || 'DAY');
  var st = session === 'DAY' ? '' : Logic.toStation(session.split('-')[0]);
  var chk = Logic.can(ctx, 'view', day, st); if (!chk.ok) return deny_(chk);
  var latest = {};
  readTable_('Attendance').filter(function (a) { return a.day === day && a.session === session; }).forEach(function (a) { latest[a.participant_no] = a.present === 'true'; });
  return { session: session, present: latest, canEdit: Logic.can(ctx, 'attendance', day, st).ok };
};
API_.attendanceSet = function (ctx, p) {
  var day = Logic.toDay(p.day), session = String(p.session || 'DAY');
  var st = session === 'DAY' ? '' : Logic.toStation(session.split('-')[0]);
  if (session !== 'DAY' && !/^[A-D]-R[1-4]$/.test(session)) return fail_('Bad session.');
  var chk = Logic.can(ctx, 'attendance', day, st); if (!chk.ok) return deny_(chk);
  if (!readTable_('Participants').some(function (x) { return x.participant_no === String(p.participant_no); })) return fail_('Unknown participant.');
  return withLock_(function () {
    appendRows_('Attendance', [{ day: day, session: session, participant_no: String(p.participant_no), present: p.present ? 'true' : 'false', recorded_by: ctx.email, timestamp: nowIso_() }]);
    return { saved: true };
  });
};

// Readiness ----------------------------------------------------------
API_.readinessGet = function (ctx, p) {
  var day = Logic.toDay(p.day), st = Logic.toStation(p.station) || 'OSCE';
  var chk = Logic.can(ctx, 'view', day, st === 'OSCE' ? '' : st); if (!chk.ok) return deny_(chk);
  var items = readTable_('ReadinessItems').filter(function (i) { return i.day === day && i.station === st; });
  var latest = {};
  readTable_('ReadinessLog').filter(function (l) { return l.day === day && l.station === st; }).forEach(function (l) { latest[l.item_no] = { checked: l.checked === 'true', by: l.recorded_by, at: l.timestamp }; });
  return { items: strip_(items), state: latest, canEdit: Logic.can(ctx, 'readiness', day, st === 'OSCE' ? '' : st).ok };
};
API_.readinessSet = function (ctx, p) {
  var day = Logic.toDay(p.day), st = Logic.toStation(p.station) || 'OSCE';
  var chk = Logic.can(ctx, 'readiness', day, st === 'OSCE' ? '' : st); if (!chk.ok) return deny_(chk);
  return withLock_(function () {
    appendRows_('ReadinessLog', [{ day: day, station: st, item_no: String(p.item_no), checked: p.checked ? 'true' : 'false', recorded_by: ctx.email, timestamp: nowIso_() }]);
    return { saved: true };
  });
};

// Dashboard ----------------------------------------------------------
function dashboardDb_() {
  var r = refs_(), cfg = config_();
  return {
    participants: r.participants, stations: r.stations, rotation: r.rotation, checklists: r.checklists, checklistItems: r.checklistItems,
    osceItems: r.osceItems, osceUnits: r.osceUnits, osceScenarios: r.osceScenarios, dayDates: r.dayDates, config: cfg,
    timetable: r.timetable,
    assessments: readTable_('Assessments'), assessmentScores: readTable_('AssessmentScores'),
    osceAssessments: readTable_('OSCEAssessments'), osceScores: readTable_('OSCEScores'), teamRubric: readTable_('TeamRubric'),
    attendance: readTable_('Attendance')
  };
}
API_.dashboard = function (ctx, p) {
  var scope = Logic.dashboardScope(ctx);
  var f = p.filters || {};
  var d = Logic.buildDashboard(dashboardDb_(), {
    day: Logic.toDay(f.day), station: Logic.toStation(f.station), round: Logic.toRound(f.round),
    group: Logic.toGroup(f.group), team: Logic.toTeam(f.team), participant: f.participant ? String(f.participant) : ''
  }, scope, Date.now());
  d.refresh_sec = Number(config_().dashboard_refresh_sec) || 60;
  return d;
};

// Admin --------------------------------------------------------------
function adminOnly_(ctx) { return ctx.isAdmin ? null : fail_('Admin only.', [], 'FORBIDDEN'); }

API_.adminGet = function (ctx) {
  var d = adminOnly_(ctx); if (d) return d;
  return { users: readTable_('Users'), config: readTable_('Config'), readinessItems: strip_(readTable_('ReadinessItems')), owner: ownerEmail_(),
    signinConfigured: !!PropertiesService.getScriptProperties().getProperty('SIGNIN_URL') };
};
API_.adminSaveUser = function (ctx, p) {
  var d = adminOnly_(ctx); if (d) return d;
  var u = p.user || {};
  var email = String(u.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail_('Enter a valid e-mail.');
  if (!Logic.normRole(u.role)) return fail_('Role must be admin, station_leader, facilitator or organizer.');
  var row = { email: email, name: String(u.name || '').trim(), role: Logic.normRole(u.role), day: String(u.day || '').trim(), station: String(u.station || '').trim().toUpperCase(),
    active: u.active === false || String(u.active) === 'false' ? 'false' : 'true' };
  return withLock_(function () {
    if (p.row) {
      var old = readTable_('Users').filter(function (x) { return x._row === Number(p.row); })[0];
      if (!old) return fail_('Row not found.');
      writeRow_('Users', Number(p.row), row);
      audit_(ctx.email, 'user:update', email, strip_([old])[0], row, '');
    } else {
      appendRows_('Users', [row]);
      audit_(ctx.email, 'user:create', email, undefined, row, '');
    }
    return { saved: true };
  });
};
API_.adminSetConfig = function (ctx, p) {
  var d = adminOnly_(ctx); if (d) return d;
  var key = String(p.key || ''), value = String(p.value === undefined ? '' : p.value).trim();
  var allowed = CONFIG_DEFAULTS.map(function (c) { return c[0]; });
  if (allowed.indexOf(key) < 0) return fail_('Unknown setting.');
  if (key === 'competency_threshold_pct' && value !== '' && !(Number(value) >= 0 && Number(value) <= 100)) return fail_('Threshold must be 0–100 or blank.');
  if (key === 'organizer_can_score' && ['true', 'false'].indexOf(value) < 0) return fail_('Use true or false.');
  if (key === 'primary_assessor_rule' && ['facilitator', 'station_leader', 'average'].indexOf(value) < 0) return fail_('Use facilitator, station_leader or average.');
  if ((key === 'dashboard_refresh_sec' || key === 'session_hours') && !(Number(value) > 0)) return fail_('Enter a positive number.');
  return withLock_(function () {
    var row = readTable_('Config').filter(function (c) { return c.key === key; })[0];
    var note = (CONFIG_DEFAULTS.filter(function (c) { return c[0] === key; })[0] || [])[2] || '';
    if (row) writeRow_('Config', row._row, { key: key, value: value, note: row.note || note });
    else appendRows_('Config', [{ key: key, value: value, note: note }]);
    audit_(ctx.email, 'config:set', key, row ? row.value : '', value, p.reason || '');
    return { saved: true };
  });
};
API_.adminImportRoster = function (ctx, p) {
  var d = adminOnly_(ctx); if (d) return d;
  var parts = readTable_('Participants');
  var plan = Logic.planRosterImport(p.csv, parts);
  if (p.dryRun || plan.errors.length) return { dryRun: true, errors: plan.errors, updates: plan.updates };
  return withLock_(function () {
    var cur = readTable_('Participants');
    plan.updates.forEach(function (u) {
      var row = cur.filter(function (x) { return x.participant_no === u.participant_no; })[0];
      var next = { participant_no: row.participant_no, name: u.name, staff_id: u.staff_id, group: row.group, team: row.team, extra_flag: row.extra_flag };
      writeRow_('Participants', row._row, next);
    });
    audit_(ctx.email, 'roster:import', 'Participants', undefined, { rows: plan.updates.length }, '');
    return { imported: plan.updates.length, errors: [] };
  });
};
API_.adminSetReadinessItems = function (ctx, p) {
  var d = adminOnly_(ctx); if (d) return d;
  var day = Logic.toDay(p.day), st = Logic.toStation(p.station) || (p.station === 'OSCE' ? 'OSCE' : '');
  if (!day || !st) return fail_('Choose a day and station.');
  var lines = String(p.text || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(String);
  return withLock_(function () {
    // Readiness items are configuration (not scores) — rewrite this station's list.
    var sh = sheet_('ReadinessItems'), all = readTable_('ReadinessItems');
    var keep = all.filter(function (i) { return !(i.day === day && i.station === st); });
    var next = keep.map(function (i) { return { day: i.day, station: i.station, item_no: i.item_no, item: i.item }; })
      .concat(lines.map(function (l, i) { return { day: day, station: st, item_no: String(i + 1), item: l }; }));
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, SCHEMA.ReadinessItems.length).clearContent();
    delete REQ_CACHE_.ReadinessItems;
    if (next.length) sh.getRange(2, 1, next.length, SCHEMA.ReadinessItems.length).setNumberFormat('@')
      .setValues(next.map(function (o) { return SCHEMA.ReadinessItems.map(function (k) { return o[k]; }); }));
    delete REQ_CACHE_.ReadinessItems;
    audit_(ctx.email, 'readiness:set', day + '|' + st, undefined, { items: lines.length }, '');
    return { saved: lines.length };
  });
};
API_.adminSeedCheck = function (ctx) {
  var d = adminOnly_(ctx); if (d) return d;
  return verifySeed_();
};
/** Raw table export (CSV text) for Admin. */
API_.exportTable = function (ctx, p) {
  var d = adminOnly_(ctx); if (d) return d;
  if (!SCHEMA[p.table] && !/^v_/.test(p.table)) return fail_('Unknown table.');
  var sh = ss_().getSheetByName(p.table); if (!sh || sh.getLastRow() < 1) return { csv: '' };
  return { csv: Logic.toCsv(sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues()) };
};

// ------------------------------------------------------------------
// 8. Looker Studio flat views (v_assessments, v_item_scores, v_osce, v_rubric)
//    Rebuilt by a time trigger (installTriggers) or manually.
// ------------------------------------------------------------------
function refreshViews() {
  REQ_CACHE_ = {};
  var parts = {}; readTable_('Participants').forEach(function (p) { parts[p.participant_no] = p; });
  var items = {}; readTable_('ChecklistItems').forEach(function (i) { items[i.checklist_id + '|' + i.item_no] = i.text; });
  function effective(table, idCol) {
    var by = Logic.groupBy(readTable_(table), function (r) { return r[idCol]; }), out = [];
    Object.keys(by).forEach(function (id) { var s = Logic.recordState(by[id]); if (s.effective) out.push(s.effective); });
    return out;
  }
  var a = effective('Assessments', 'assessment_id');
  var scores = Logic.groupBy(readTable_('AssessmentScores'), function (s) { return s.assessment_id + '|' + s.version; });
  writeView_('v_assessments', ['assessment_id', 'version', 'day', 'station', 'round', 'checklist_id', 'participant_no', 'name', 'group', 'team',
    'assessor_email', 'assessor_role', 'total', 'max', 'pct', 'status', 'is_reattempt', 'submitted_at'],
  a.map(function (r) { var p = parts[r.participant_no] || {};
    return [r.assessment_id, Number(r.version), r.day, r.station, r.round, r.checklist_id, r.participant_no, p.name || '', p.group || '', p.team || '',
      r.assessor_email, r.assessor_role, Number(r.total), Number(r.max), Number(r.pct), r.status, r.is_reattempt, r.submitted_at]; }));
  var itemRows = [];
  a.forEach(function (r) {
    (scores[r.assessment_id + '|' + r.version] || []).forEach(function (s) {
      var p = parts[r.participant_no] || {};
      itemRows.push([r.assessment_id, r.day, r.station, r.checklist_id, s.item_no, items[r.checklist_id + '|' + s.item_no] || '', r.participant_no, p.group || '', p.team || '',
        r.assessor_role, Number(s.score), r.status]);
    });
  });
  writeView_('v_item_scores', ['assessment_id', 'day', 'station', 'checklist_id', 'item_no', 'item_text', 'participant_no', 'group', 'team', 'assessor_role', 'score', 'status'], itemRows);
  var o = effective('OSCEAssessments', 'osce_assessment_id');
  writeView_('v_osce', ['osce_assessment_id', 'version', 'day', 'osce_id', 'group', 'team', 'participant_no', 'name', 'role_no', 'role_items_total', 'common_total',
    'total', 'max', 'assessor_email', 'assessor_role', 'status', 'submitted_at'],
  o.map(function (r) { var p = parts[r.participant_no] || {};
    return [r.osce_assessment_id, Number(r.version), r.day, r.osce_id, r.group, r.team, r.participant_no, p.name || '', r.role_no, Number(r.role_items_total),
      Number(r.common_total), Number(r.total), Number(r.max), r.assessor_email, r.assessor_role, r.status, r.submitted_at]; }));
  var rb = Logic.groupBy(readTable_('TeamRubric'), function (r) { return r.rubric_id; }), rr = [];
  Object.keys(rb).forEach(function (id) {
    var heads = {}; rb[id].forEach(function (r) { heads[r.version] = heads[r.version] || r; });
    var s = Logic.recordState(Object.keys(heads).map(function (k) { return heads[k]; })); if (!s.effective) return;
    rb[id].filter(function (r) { return r.version === s.effective.version; }).forEach(function (r) {
      rr.push([id, r.day, r.osce_id, r.group, r.team, r.item_no, Number(r.score), Number(r.total), r.assessor_role, r.status]);
    });
  });
  writeView_('v_rubric', ['rubric_id', 'day', 'osce_id', 'group', 'team', 'item_no', 'score', 'total', 'assessor_role', 'status'], rr);
}
function writeView_(name, header, rows) {
  var sh = ss_().getSheetByName(name) || ss_().insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, 1, header.length).setValues([header]);
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
  sh.setFrozenRows(1);
}
/** Installs a 5-minute trigger that rebuilds the Looker views. Run once. */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'refreshViews') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('refreshViews').timeBased().everyMinutes(5).create();
}
