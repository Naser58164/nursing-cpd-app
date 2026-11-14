/**
 * ENCOR 2026 Competency Assessment — Logic.gs
 * ------------------------------------------------------------------
 * PURE business logic. No SpreadsheetApp / Session / Utilities calls,
 * so the same file runs inside Apps Script (V8) AND under Node for the
 * in-memory unit tests (test/run.js). Code.gs does all I/O and calls in here.
 *
 * Everything lives on the `Logic` object so google.script.run cannot
 * call it directly (only top-level functions are exposed).
 */
var Logic = (function () {
  'use strict';

  // ---------------------------------------------------------------
  // 0. Constants that come from the approved specification.
  //    Content (items, staff, rotation, times) is NEVER defined here —
  //    it is always read from the seed / sheet.
  // ---------------------------------------------------------------
  var SCORES = [2, 1, 0];                       // §2.3: only 2 / 1 / 0
  var ROLES = ['admin', 'station_leader', 'facilitator', 'organizer'];
  var STATIONS = ['A', 'B', 'C', 'D'];
  var ROUNDS = ['R1', 'R2', 'R3', 'R4'];
  var GROUPS = ['G1', 'G2', 'G3', 'G4'];
  var TEAMS = ['a', 'b', 'c', 'd'];
  var OSCE_ROLE_NOS = ['R1', 'R2', 'R3', 'R4'];
  var TZ_OFFSET_HOURS = 4;                      // Asia/Muscat, no DST

  /**
   * OSCE team mapping. The seed has no field for it; it is taken verbatim
   * from master prompt §3 and written to the `OSCEUnits` tab by seedSheets()
   * so the Admin can see / edit it. A "unit" is the team that runs one scenario.
   */
  var OSCE_UNITS_SPEC = [
    { day: '2', unit: 'X', teams: ['a', 'b'], osce_id: 'OSCE-1', label: 'Team X (a+b)' },
    { day: '2', unit: 'Y', teams: ['c', 'd'], osce_id: 'OSCE-2', label: 'Team Y (c+d)' },
    { day: '3', unit: 'a', teams: ['a'], osce_id: 'OSCE-3', label: 'Team a' },
    { day: '3', unit: 'b', teams: ['b'], osce_id: 'OSCE-4', label: 'Team b' },
    { day: '3', unit: 'c', teams: ['c'], osce_id: 'OSCE-3', label: 'Team c' },
    { day: '3', unit: 'd', teams: ['d'], osce_id: 'OSCE-4', label: 'Team d' }
  ];

  /** Acceptance-test expectations (§10). Used ONLY to validate the seed. */
  var EXPECT = {
    checklistItems: { A1: 14, B1: 13, C1: 12, C2: 12, TA: 13, TB: 11, TC: 11, TD: 12 },
    checklistMax: { A1: 28, B1: 26, C1: 24, C2: 24, TA: 26, TB: 22, TC: 22, TD: 24 },
    totalItems: 98,
    osceCount: 4, osceMax: 16, rubricMax: 12,
    rosterSize: 48,
    groupMembers: {
      G1: range(1, 10).concat([41, 42]), G2: range(11, 20).concat([43, 44]),
      G3: range(21, 30).concat([45, 46]), G4: range(31, 40).concat([47, 48])
    },
    latin: {
      R1: { G1: 'A', G2: 'B', G3: 'C', G4: 'D' }, R2: { G1: 'B', G2: 'C', G3: 'D', G4: 'A' },
      R3: { G1: 'C', G2: 'D', G3: 'A', G4: 'B' }, R4: { G1: 'D', G2: 'A', G3: 'B', G4: 'C' }
    },
    stationChecklist: { '2': { A: 'A1', B: 'B1', C: 'C1', D: 'C2' }, '3': { A: 'TA', B: 'TB', C: 'TC', D: 'TD' } }
  };

  // ---------------------------------------------------------------
  // 1. Small helpers
  // ---------------------------------------------------------------
  function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  function str(v) { return v === null || v === undefined ? '' : String(v); }
  function num(v) { if (v === '' || v === null || v === undefined) return NaN; return Number(v); }
  function round1(v) { return Math.round(v * 10) / 10; }
  function pct(a, b) { return b > 0 ? round1(100 * a / b) : null; }
  function mean(arr) { if (!arr.length) return null; var s = 0; arr.forEach(function (x) { s += x; }); return s / arr.length; }
  function bool(v) { var s = str(v).trim().toLowerCase(); return s === 'true' || s === 'yes' || s === '1' || s === 'y'; }
  function groupBy(arr, fn) { var m = {}; arr.forEach(function (x) { var k = fn(x); (m[k] = m[k] || []).push(x); }); return m; }
  function uniq(arr) { var s = {}; return arr.filter(function (x) { if (s[x]) return false; s[x] = 1; return true; }); }

  function toDay(v) {
    var m = /^\s*(?:day|d)?\s*[-_ ]?([1-3])\s*$/i.exec(str(v));
    return m ? m[1] : '';
  }
  function toStation(v) { var m = /^\s*(?:station\s*)?([A-D])\s*$/i.exec(str(v)); return m ? m[1].toUpperCase() : ''; }
  function toRound(v) { var m = /^\s*(?:r|round)?\s*[-_ ]?([1-4])\s*$/i.exec(str(v)); return m ? 'R' + m[1] : ''; }
  function toGroup(v) { var m = /^\s*(?:g|group)?\s*[-_ ]?([1-4])\s*$/i.exec(str(v)); return m ? 'G' + m[1] : ''; }
  function toTeam(v) { var m = /^\s*(?:team\s*)?([a-d])\s*$/i.exec(str(v)); return m ? m[1].toLowerCase() : ''; }
  function normRole(v) {
    var s = str(v).trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (s === 'organiser') s = 'organizer';
    if (s === 'leader' || s === 'subject_expert') s = 'station_leader';
    return ROLES.indexOf(s) >= 0 ? s : '';
  }

  /** "10:15-10:45" -> {start:'10:15', end:'10:45'} */
  function parseTimeRange(s) {
    var re = /(\d{1,2})[:.](\d{2})/g, m, out = [];
    while ((m = re.exec(str(s))) && out.length < 2) out.push(('0' + m[1]).slice(-2) + ':' + m[2]);
    return { start: out[0] || '', end: out[1] || '' };
  }
  /** Accepts 2026-11-16, 16/11/2026, 16 Nov 2026 → 'YYYY-MM-DD' (or ''). */
  function parseDate(s) {
    s = str(s);
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    var mon = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/.exec(s);
    if (m && mon[m[2].toLowerCase()]) return m[3] + '-' + ('0' + mon[m[2].toLowerCase()]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    return '';
  }
  /** Epoch ms of a Muscat wall-clock time. */
  function muscatMs(ymd, hhmm) {
    if (!ymd) return NaN;
    var d = ymd.split('-').map(Number), t = (hhmm || '00:00').split(':').map(Number);
    return Date.UTC(d[0], d[1] - 1, d[2], t[0] - TZ_OFFSET_HOURS, t[1] || 0);
  }

  // ---------------------------------------------------------------
  // 2. Seed normalisation + validation
  // ---------------------------------------------------------------
  /**
   * Turns the raw seed JSON into flat, sheet-ready tables. Text is copied
   * as-is (no trimming, no re-ordering) so it stays character-identical.
   */
  function normaliseSeed(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Seed is empty or not an object.');
    var dayDates = {};
    (raw.event && raw.event.dates || []).forEach(function (d, i) { var p = parseDate(d); if (p) dayDates[String(i + 1)] = p; });
    var timetable = (raw.timetable || []).map(function (t) {
      var day = toDay(t.day);
      if (!dayDates[day] && parseDate(t.date)) dayDates[day] = parseDate(t.date);
      return {
        day: day, date: str(t.date), time: str(t.time), duration: str(t.duration), topic: str(t.topic),
        objectives: Array.isArray(t.objectives) ? t.objectives.join('\n') : str(t.objectives), speaker: str(t.speaker)
      };
    });

    var s2c = {};
    Object.keys(raw.station_to_checklist || {}).forEach(function (k) {
      var day = toDay(k); if (!day) return;
      s2c[day] = {};
      Object.keys(raw.station_to_checklist[k]).forEach(function (st) { s2c[day][toStation(st)] = str(raw.station_to_checklist[k][st]); });
    });

    var stations = (raw.stations || []).map(function (s) {
      var day = toDay(s.day), st = toStation(s.station);
      return {
        day: day, station: st, topic: str(s.topic), checklist_id: (s2c[day] || {})[st] || str(s.checklist_id),
        facilitator: Array.isArray(s.facilitator) ? s.facilitator.join('; ') : str(s.facilitator),
        subject_expert: Array.isArray(s.subject_expert) ? s.subject_expert.join('; ') : str(s.subject_expert),
        organizer: Array.isArray(s.organizer || s.organiser) ? (s.organizer || s.organiser).join('; ') : str(s.organizer || s.organiser)
      };
    });

    var rot = raw.rotation || {}, rotation = [];
    var map = rot.group_to_station_by_round || {};
    Object.keys(rot).forEach(function (k) {
      var m = /^day\s*_?(\d)_rounds$/i.exec(k); if (!m) return;
      var day = m[1];
      ROUNDS.forEach(function (r) {
        var times = rot[k] || {};
        GROUPS.forEach(function (g) {
          rotation.push({ day: day, round: r, time: str(times[r]), group: g, station: toStation((map[r] || {})[g]) });
        });
      });
    });

    var roster = (raw.roster || []).map(function (p) {
      return {
        participant_no: str(p.participant_no), name: str(p.name), staff_id: str(p.staff_id),
        group: toGroup(p.group), team: toTeam(p.team), extra_flag: str(p.extra_flag)
      };
    });

    var checklists = [], checklistItems = [];
    var cls = raw.checklists || {};
    Object.keys(cls).forEach(function (key) {
      var c = cls[key], id = str(c.id || key);
      var items = (c.items || []).map(function (it, i) {
        return { checklist_id: id, item_no: str(it.no !== undefined ? it.no : i + 1), text: typeof it === 'string' ? it : str(it.text) };
      });
      checklists.push({ checklist_id: id, title: str(c.title), day: toDay(c.day), item_count: String(items.length), max_score: str(c.max_score) });
      checklistItems = checklistItems.concat(items);
    });

    var osceScenarios = [], osceItems = [];
    var os = raw.osces || {};
    Object.keys(os).forEach(function (key) {
      var o = os[key], id = str(o.id || key);
      var roleTitles = {};
      Object.keys(o.roles || {}).forEach(function (rn) {
        var r = o.roles[rn]; roleTitles[rn] = str(r.role);
        (r.items || []).forEach(function (it) {
          osceItems.push({ osce_id: id, section: 'role', role_no: rn, role_title: str(r.role), code: str(it.code), text: str(it.text) });
        });
      });
      (o.common || []).forEach(function (it) {
        osceItems.push({ osce_id: id, section: 'common', role_no: '', role_title: '', code: str(it.code), text: str(it.text) });
      });
      (o.team_rubric || []).forEach(function (it, i) {
        osceItems.push({ osce_id: id, section: 'rubric', role_no: '', role_title: '', code: str(it.no !== undefined ? it.no : i + 1), text: typeof it === 'string' ? it : str(it.text) });
      });
      osceScenarios.push({
        osce_id: id, day: toDay(o.day), title: str(o.title), format: str(o.format), max_individual_score: str(o.max_individual_score),
        details_json: JSON.stringify({
          candidate_instructions: o.candidate_instructions || '', setting: o.setting || '', presentation: o.presentation || '',
          progressive_info: o.progressive_info || [], roles: roleTitles
        })
      });
    });

    var osceUnits = OSCE_UNITS_SPEC.map(function (u) {
      return { day: u.day, unit: u.unit, teams: u.teams.join('+'), osce_id: u.osce_id, label: u.label };
    });

    return {
      event: raw.event || {}, scoring_scale: raw.scoring_scale || [], team_rubric_scale: raw.team_rubric_scale || [],
      dayDates: dayDates, timetable: timetable, stations: stations, rotation: rotation, roster: roster,
      checklists: checklists, checklistItems: checklistItems, osceScenarios: osceScenarios, osceItems: osceItems, osceUnits: osceUnits
    };
  }

  /**
   * Validates the normalised seed against §10 acceptance tests 1–3 and
   * collects "looks inconsistent" observations (deliverable 5). Nothing is fixed.
   */
  function validateSeed(n) {
    var errors = [], issues = [], counts = {};
    // Checklists
    var byCl = groupBy(n.checklistItems, function (i) { return i.checklist_id; });
    var total = 0;
    Object.keys(EXPECT.checklistItems).forEach(function (id) {
      var items = byCl[id] || [], meta = n.checklists.filter(function (c) { return c.checklist_id === id; })[0];
      counts[id] = items.length; total += items.length;
      if (!meta) errors.push('Checklist ' + id + ' missing.');
      if (items.length !== EXPECT.checklistItems[id]) errors.push('Checklist ' + id + ' has ' + items.length + ' items; expected ' + EXPECT.checklistItems[id] + '.');
      if (meta && num(meta.max_score) !== EXPECT.checklistMax[id]) errors.push('Checklist ' + id + ' max_score ' + meta.max_score + '; expected ' + EXPECT.checklistMax[id] + '.');
      if (meta && num(meta.max_score) !== 2 * items.length) issues.push('Checklist ' + id + ': max_score ' + meta.max_score + ' ≠ 2 × ' + items.length + ' items.');
      var nos = items.map(function (i) { return i.item_no; });
      if (uniq(nos).length !== nos.length) errors.push('Checklist ' + id + ' has duplicate item numbers.');
      items.forEach(function (i) { if (!i.text) errors.push('Checklist ' + id + ' item ' + i.item_no + ' has empty text.'); });
    });
    counts.checklists = n.checklists.length; counts.totalItems = total;
    if (n.checklists.length !== 8) errors.push('Expected 8 checklists, found ' + n.checklists.length + '.');
    if (total !== EXPECT.totalItems) errors.push('Expected 98 checklist items, found ' + total + '.');

    // OSCE
    counts.osces = n.osceScenarios.length;
    if (n.osceScenarios.length !== EXPECT.osceCount) errors.push('Expected 4 OSCE scenarios, found ' + n.osceScenarios.length + '.');
    n.osceScenarios.forEach(function (o) {
      var items = n.osceItems.filter(function (i) { return i.osce_id === o.osce_id; });
      var roles = groupBy(items.filter(function (i) { return i.section === 'role'; }), function (i) { return i.role_no; });
      var common = items.filter(function (i) { return i.section === 'common'; });
      var rubric = items.filter(function (i) { return i.section === 'rubric'; });
      if (Object.keys(roles).length !== 4) errors.push(o.osce_id + ': expected 4 roles.');
      Object.keys(roles).forEach(function (r) { if (roles[r].length !== 5) errors.push(o.osce_id + ' ' + r + ': expected 5 items, found ' + roles[r].length + '.'); });
      if (common.length !== 3) errors.push(o.osce_id + ': expected 3 common items.');
      if (rubric.length !== 6) errors.push(o.osce_id + ': expected 6 rubric items.');
      var maxInd = 2 * (5 + common.length);
      if (maxInd !== EXPECT.osceMax || num(o.max_individual_score) !== EXPECT.osceMax) errors.push(o.osce_id + ': individual max should be 16.');
      if (2 * rubric.length !== EXPECT.rubricMax) errors.push(o.osce_id + ': rubric max should be 12.');
      Object.keys(roles).forEach(function (r) {
        var codes = roles[r].map(function (i) { return i.code; }).concat(common.map(function (i) { return i.code; }));
        if (uniq(codes).length !== codes.length) errors.push(o.osce_id + ' ' + r + ': duplicate item codes.');
      });
      counts[o.osce_id] = { roles: Object.keys(roles).length, roleItems: 5, common: common.length, rubric: rubric.length };
    });

    // Roster
    counts.roster = n.roster.length;
    if (n.roster.length !== EXPECT.rosterSize) errors.push('Expected 48 participants, found ' + n.roster.length + '.');
    Object.keys(EXPECT.groupMembers).forEach(function (g) {
      var actual = n.roster.filter(function (p) { return p.group === g; }).map(function (p) { return Number(p.participant_no); }).sort(function (a, b) { return a - b; });
      var exp = EXPECT.groupMembers[g].slice().sort(function (a, b) { return a - b; });
      if (actual.join(',') !== exp.join(',')) errors.push('Group ' + g + ' members ' + actual.join(',') + ' ≠ expected ' + exp.join(',') + '.');
      TEAMS.forEach(function (t) {
        var c = n.roster.filter(function (p) { return p.group === g && p.team === t; }).length;
        if (c !== 3) errors.push('Group ' + g + ' team ' + t + ' has ' + c + ' members; expected 3.');
      });
    });

    // Rotation vs Latin square (§3)
    ['2', '3'].forEach(function (day) {
      ROUNDS.forEach(function (r) {
        GROUPS.forEach(function (g) {
          var row = n.rotation.filter(function (x) { return x.day === day && x.round === r && x.group === g; })[0];
          if (!row) { errors.push('Rotation missing day ' + day + ' ' + r + ' ' + g + '.'); return; }
          if (row.station !== EXPECT.latin[r][g]) errors.push('Rotation day ' + day + ' ' + r + ' ' + g + ' → ' + row.station + '; §3 says ' + EXPECT.latin[r][g] + '.');
          if (!parseTimeRange(row.time).start) issues.push('Rotation day ' + day + ' ' + r + ' has no parsable time.');
        });
      });
      STATIONS.forEach(function (s) {
        var st = n.stations.filter(function (x) { return x.day === day && x.station === s; })[0];
        if (!st) { errors.push('Station ' + s + ' day ' + day + ' missing.'); return; }
        if (st.checklist_id !== EXPECT.stationChecklist[day][s]) errors.push('Day ' + day + ' station ' + s + ' → ' + st.checklist_id + '; §3 says ' + EXPECT.stationChecklist[day][s] + '.');
      });
    });
    ['1', '2', '3'].forEach(function (d) { if (!n.dayDates[d]) issues.push('No date found for day ' + d + '.'); });

    return { ok: errors.length === 0, errors: errors, issues: issues, counts: counts };
  }

  // ---------------------------------------------------------------
  // 3. Authorisation
  // ---------------------------------------------------------------
  /**
   * ctx = { email, isOwner, rows:[Users rows for this email, active only], config }
   * Users.day: '1'|'2'|'3'|'*' (comma-separated allowed). Users.station:
   * 'A'..'D' | 'OSCE' (all rooms that day) | 'OSCE-G1'..'OSCE-G4' | '*' (comma-separated allowed).
   */
  function buildCtx(email, isOwner, userRows, config) {
    email = str(email).trim().toLowerCase();
    var rows = (userRows || []).filter(function (u) {
      return str(u.email).trim().toLowerCase() === email && email && bool(u.active === '' ? 'true' : u.active) && normRole(u.role);
    }).map(function (u) {
      return {
        role: normRole(u.role), name: str(u.name),
        days: str(u.day).split(/[,;\s]+/).filter(String).map(function (d) { return d === '*' || /^all$/i.test(d) ? '*' : toDay(d); }).filter(String),
        stations: str(u.station).split(/[,;\s]+/).filter(String).map(function (s) {
          if (s === '*' || /^all$/i.test(s)) return '*';
          var m = /^osce(?:[-_ ]?(g[1-4]))?$/i.exec(s); if (m) return m[1] ? 'OSCE-' + m[1].toUpperCase() : 'OSCE';
          return toStation(s);
        }).filter(String)
      };
    });
    var isAdmin = !!isOwner || rows.some(function (r) { return r.role === 'admin'; });
    return {
      email: email, isOwner: !!isOwner, isAdmin: isAdmin, rows: rows, config: config || {},
      name: (rows[0] && rows[0].name) || email, authorised: isAdmin || rows.length > 0
    };
  }

  function dayMatch(r, day) { return r.days.indexOf('*') >= 0 || r.days.indexOf(str(day)) >= 0; }
  function stationMatch(r, station, group) {
    if (r.stations.indexOf('*') >= 0) return true;
    if (station === 'OSCE') return r.stations.indexOf('OSCE') >= 0 || (group ? r.stations.indexOf('OSCE-' + group) >= 0 : r.stations.some(function (s) { return /^OSCE-/.test(s); }));
    return r.stations.indexOf(station) >= 0;
  }
  /** Roles of this user at (day, station[, group]). */
  function rolesAt(ctx, day, station, group) {
    if (ctx.isAdmin) return ['admin'];
    return uniq(ctx.rows.filter(function (r) { return dayMatch(r, day) && (station === '' || stationMatch(r, station, group)); }).map(function (r) { return r.role; }));
  }
  /**
   * action: 'view' | 'score' | 'finalise' | 'attendance' | 'readiness' | 'admin'
   * Returns {ok, role, reason}. Enforced server-side for every request.
   */
  function can(ctx, action, day, station, group) {
    if (!ctx || !ctx.authorised) return { ok: false, reason: 'Not authorised' };
    if (ctx.isAdmin) return { ok: true, role: 'admin' };
    if (action === 'admin') return { ok: false, reason: 'Admin only' };
    var roles = rolesAt(ctx, str(day), str(station), group);
    if (!roles.length) return { ok: false, reason: 'Not assigned to day ' + day + (station ? ' / ' + station : '') };
    var orgScore = bool(ctx.config.organizer_can_score);
    var pick = function (allowed) { for (var i = 0; i < allowed.length; i++) if (roles.indexOf(allowed[i]) >= 0) return allowed[i]; return ''; };
    var role;
    switch (action) {
      case 'view': role = roles[0]; break;
      case 'score': role = pick(orgScore ? ['station_leader', 'facilitator', 'organizer'] : ['station_leader', 'facilitator']); break;
      case 'finalise': role = pick(['station_leader']); break;
      case 'attendance': case 'readiness': role = pick(['organizer', 'station_leader']); break;
      default: role = '';
    }
    return role ? { ok: true, role: role } : { ok: false, reason: 'Role not permitted to ' + action };
  }

  /** Scope used to restrict the dashboard. */
  function dashboardScope(ctx) {
    if (ctx.isAdmin) return { all: true };
    var st = {}, osce = {};
    ctx.rows.forEach(function (r) {
      var days = r.days.indexOf('*') >= 0 ? ['1', '2', '3'] : r.days;
      days.forEach(function (d) {
        r.stations.forEach(function (s) {
          if (s === '*') { STATIONS.forEach(function (x) { st[d + '|' + x] = 1; }); osce[d + '|*'] = 1; }
          else if (s === 'OSCE') osce[d + '|*'] = 1;
          else if (/^OSCE-/.test(s)) osce[d + '|' + s.slice(5)] = 1;
          else st[d + '|' + s] = 1;
        });
      });
    });
    return { all: false, stations: st, osce: osce };
  }
  function inScopeStation(scope, day, station) { return scope.all || !!scope.stations[day + '|' + station]; }
  function inScopeOsce(scope, day, group) { return scope.all || !!scope.osce[day + '|*'] || !!scope.osce[day + '|' + group]; }

  // ---------------------------------------------------------------
  // 4. Reference lookups
  // ---------------------------------------------------------------
  function rotationGroup(rotation, day, round, station) {
    var r = rotation.filter(function (x) { return str(x.day) === str(day) && x.round === round && x.station === station; })[0];
    return r ? r.group : '';
  }
  function roundsForStation(rotation, day, station) {
    return ROUNDS.map(function (r) {
      var row = rotation.filter(function (x) { return str(x.day) === str(day) && x.round === r && x.station === station; })[0];
      return { round: r, time: row ? row.time : '', group: row ? row.group : '' };
    });
  }
  function unitsFor(osceUnits, day) {
    return osceUnits.filter(function (u) { return str(u.day) === str(day); }).map(function (u) {
      return { day: str(u.day), unit: str(u.unit), teams: str(u.teams).split('+'), osce_id: str(u.osce_id), label: str(u.label) };
    });
  }
  function unitMembers(participants, group, unit) {
    return participants.filter(function (p) { return p.group === group && unit.teams.indexOf(p.team) >= 0; });
  }

  // ---------------------------------------------------------------
  // 5. Versioned records
  // ---------------------------------------------------------------
  /**
   * rows: all version rows of ONE logical record.
   * effective = latest finalised version, otherwise latest submitted (§6).
   * locked    = latest version is 'finalised'.
   */
  function recordState(rows) {
    var sorted = rows.slice().sort(function (a, b) { return num(a.version) - num(b.version); });
    var latest = sorted[sorted.length - 1] || null, fin = null, sub = null;
    sorted.forEach(function (r) { if (r.status === 'finalised') fin = r; if (r.status === 'submitted') sub = r; });
    return { latest: latest, effective: fin || sub, locked: !!latest && latest.status === 'finalised', status: latest ? latest.status : '' };
  }
  function nextVersion(rows) { return rows.reduce(function (m, r) { return Math.max(m, num(r.version) || 0); }, 0) + 1; }

  /**
   * Choose the record used by the dashboard when >1 assessor scored the
   * same participant. rule: 'facilitator' (default) | 'station_leader' | 'average'.
   * recs: [{assessor_role, submitted_at, pct, total, max, items:[{key,score}]}]
   */
  function selectPrimary(recs, rule) {
    if (!recs.length) return null;
    var byTime = function (a, b) { return str(b.submitted_at) < str(a.submitted_at) ? -1 : 1; };
    var leaders = recs.filter(function (r) { return r.assessor_role === 'station_leader'; }).sort(byTime);
    var others = recs.filter(function (r) { return r.assessor_role !== 'station_leader'; }).sort(byTime);
    if (rule === 'average' && recs.length > 1) {
      var items = []; recs.forEach(function (r) { items = items.concat(r.items); });
      return {
        averaged: true, n: recs.length, status: recs.every(function (r) { return r.status === 'finalised'; }) ? 'finalised' : 'submitted',
        total: mean(recs.map(function (r) { return num(r.total); })), max: num(recs[0].max),
        pct: mean(recs.map(function (r) { return num(r.pct); })), items: items, source: recs
      };
    }
    if (rule === 'station_leader') return leaders[0] || others[0];
    return others[0] || leaders[0];
  }

  // ---------------------------------------------------------------
  // 6. Submission validation
  // ---------------------------------------------------------------
  function validScore(v) { return SCORES.indexOf(num(v)) >= 0 && str(v).trim() !== ''; }

  /** refs: {stations, rotation, participants, items:{checklist_id:[{item_no}]}} */
  function validateChecklist(p, refs) {
    var e = [];
    var day = toDay(p.day), st = toStation(p.station), rd = toRound(p.round);
    if (day !== '2' && day !== '3') e.push('Checklists exist only on Day 2 and Day 3.');
    if (!st) e.push('Invalid station.');
    if (!rd) e.push('Invalid round.');
    var stRow = refs.stations.filter(function (s) { return s.day === day && s.station === st; })[0];
    if (!stRow) e.push('Unknown station for this day.');
    else if (stRow.checklist_id !== p.checklist_id) e.push('Checklist ' + p.checklist_id + ' does not belong to day ' + day + ' station ' + st + '.');
    var part = refs.participants.filter(function (x) { return x.participant_no === str(p.participant_no); })[0];
    if (!part) e.push('Unknown participant.');
    else if (!p.is_reattempt && rd && st && part.group !== rotationGroup(refs.rotation, day, rd, st)) {
      e.push('Participant ' + part.participant_no + ' (' + part.group + ') is not in the group rotated to station ' + st + ' in ' + rd + '. Flag as re-attempt if intended.');
    }
    var items = refs.items[p.checklist_id] || [];
    var scores = p.scores || {};
    items.forEach(function (it) { if (!validScore(scores[it.item_no])) e.push('Item ' + it.item_no + ' is not scored (2/1/0).'); });
    Object.keys(scores).forEach(function (k) { if (!items.some(function (it) { return it.item_no === k; })) e.push('Unknown item ' + k + '.'); });
    var total = 0; items.forEach(function (it) { total += num(scores[it.item_no]) || 0; });
    return { ok: !e.length, errors: e, total: total, max: 2 * items.length, pct: pct(total, 2 * items.length) };
  }

  /** refs: {participants, osceUnits, osceItems} */
  function validateOsce(p, refs) {
    var e = [], day = toDay(p.day), g = toGroup(p.group);
    var unit = unitsFor(refs.osceUnits, day).filter(function (u) { return u.unit === str(p.team); })[0];
    if (!unit) e.push('Unknown OSCE team for this day.');
    else if (unit.osce_id !== p.osce_id) e.push('Team ' + p.team + ' runs ' + unit.osce_id + ' on day ' + day + ', not ' + p.osce_id + '.');
    var part = refs.participants.filter(function (x) { return x.participant_no === str(p.participant_no); })[0];
    if (!part) e.push('Unknown participant.');
    else if (unit && (part.group !== g || unit.teams.indexOf(part.team) < 0)) e.push('Participant ' + part.participant_no + ' is not in ' + g + ' ' + unit.label + '.');
    if (OSCE_ROLE_NOS.indexOf(p.role_no) < 0) e.push('Assign a role (R1–R4) before scoring.');
    var roleItems = refs.osceItems.filter(function (i) { return i.osce_id === p.osce_id && i.section === 'role' && i.role_no === p.role_no; });
    var common = refs.osceItems.filter(function (i) { return i.osce_id === p.osce_id && i.section === 'common'; });
    var s = p.scores || {}, rt = 0, ct = 0;
    roleItems.forEach(function (i) { if (!validScore(s[i.code])) e.push(i.code + ' is not scored.'); else rt += num(s[i.code]); });
    common.forEach(function (i) { if (!validScore(s[i.code])) e.push(i.code + ' is not scored.'); else ct += num(s[i.code]); });
    var allowed = roleItems.concat(common).map(function (i) { return i.code; });
    Object.keys(s).forEach(function (k) { if (allowed.indexOf(k) < 0) e.push('Item ' + k + ' does not belong to ' + p.role_no + '.'); });
    var max = 2 * (roleItems.length + common.length);
    return { ok: !e.length, errors: e, role_items_total: rt, common_total: ct, total: rt + ct, max: max };
  }

  function validateRubric(p, refs) {
    var e = [], day = toDay(p.day);
    var unit = unitsFor(refs.osceUnits, day).filter(function (u) { return u.unit === str(p.team); })[0];
    if (!unit) e.push('Unknown OSCE team.'); else if (unit.osce_id !== p.osce_id) e.push('Wrong scenario for this team.');
    if (!toGroup(p.group)) e.push('Invalid group.');
    var items = refs.osceItems.filter(function (i) { return i.osce_id === p.osce_id && i.section === 'rubric'; });
    var s = p.scores || {}, t = 0;
    items.forEach(function (i) { if (!validScore(s[i.code])) e.push('Rubric item ' + i.code + ' is not scored.'); else t += num(s[i.code]); });
    return { ok: !e.length, errors: e, total: t, max: 2 * items.length };
  }

  // ---------------------------------------------------------------
  // 7. Dashboard
  // ---------------------------------------------------------------
  /**
   * db: {participants, stations, rotation, checklists, checklistItems, osceItems, osceUnits, osceScenarios,
   *      timetable, dayDates, assessments, assessmentScores, osceAssessments, osceScores, teamRubric, attendance, config}
   * f : {day, station, round, group, team, participant}
   */
  function buildDashboard(db, f, scope, nowMs) {
    f = f || {}; scope = scope || { all: true };
    var cfg = db.config || {};
    var thrRaw = str(cfg.competency_threshold_pct).trim();
    var threshold = thrRaw === '' || isNaN(Number(thrRaw)) ? null : Number(thrRaw);
    var rule = str(cfg.primary_assessor_rule) || 'facilitator';

    var parts = db.participants.filter(function (p) {
      return (!f.group || p.group === f.group) && (!f.team || p.team === f.team) && (!f.participant || p.participant_no === str(f.participant));
    });
    var partSet = {}; parts.forEach(function (p) { partSet[p.participant_no] = p; });
    var days = f.day ? [str(f.day)] : ['2', '3'];

    // --- effective checklist records -------------------------------------
    var scoreRows = groupBy(db.assessmentScores, function (s) { return s.assessment_id + '|' + s.version; });
    var recs = [];
    var byId = groupBy(db.assessments, function (a) { return a.assessment_id; });
    Object.keys(byId).forEach(function (id) {
      var st = recordState(byId[id]); if (!st.effective) return;
      var a = st.effective;
      recs.push({
        id: id, day: a.day, station: a.station, round: a.round, checklist_id: a.checklist_id, participant_no: a.participant_no,
        assessor_role: a.assessor_role, assessor_email: a.assessor_email, total: num(a.total), max: num(a.max), pct: num(a.pct),
        status: st.effective.status, submitted_at: a.submitted_at, is_reattempt: bool(a.is_reattempt),
        items: (scoreRows[id + '|' + a.version] || []).map(function (s) { return { key: s.item_no, score: num(s.score) }; })
      });
    });
    var recsF = recs.filter(function (r) { return partSet[r.participant_no] && (!f.round || r.round === f.round); });
    var primaryMap = {};   // day|checklist|participant -> primary
    var grouped = groupBy(recsF, function (r) { return r.day + '|' + r.checklist_id + '|' + r.participant_no; });
    Object.keys(grouped).forEach(function (k) { primaryMap[k] = selectPrimary(grouped[k], rule); });

    // --- stations ----------------------------------------------------------
    var stationsOut = [], itemAnalysis = {};
    db.stations.filter(function (s) {
      return days.indexOf(s.day) >= 0 && (!f.station || s.station === f.station) && inScopeStation(scope, s.day, s.station);
    }).forEach(function (s) {
      var rounds = roundsForStation(db.rotation, s.day, s.station).filter(function (r) { return !f.round || r.round === f.round; });
      var startedGroups = rounds.filter(function (r) { return started(db, s.day, r.time, nowMs); }).map(function (r) { return r.group; });
      var expected = parts.filter(function (p) { return startedGroups.indexOf(p.group) >= 0; });
      var prim = parts.map(function (p) { return primaryMap[s.day + '|' + s.checklist_id + '|' + p.participant_no]; }).filter(Boolean);
      var submitted = expected.filter(function (p) { return primaryMap[s.day + '|' + s.checklist_id + '|' + p.participant_no]; });
      var dist = { 2: 0, 1: 0, 0: 0 };
      var items = db.checklistItems.filter(function (i) { return i.checklist_id === s.checklist_id; });
      var perItem = {}; items.forEach(function (i) { perItem[i.item_no] = { 2: 0, 1: 0, 0: 0 }; });
      prim.forEach(function (r) {
        r.items.forEach(function (it) { if (dist[it.score] !== undefined) dist[it.score]++; if (perItem[it.key]) perItem[it.key][it.score]++; });
      });
      var scored = dist[2] + dist[1] + dist[0];
      var comp = threshold === null ? null : prim.filter(function (r) { return r.pct >= threshold; }).length;
      stationsOut.push({
        day: s.day, station: s.station, checklist_id: s.checklist_id, topic: s.topic,
        expected: expected.length, submitted: submitted.length, completion_pct: pct(submitted.length, expected.length),
        assessed: prim.length, mean_pct: prim.length ? round1(mean(prim.map(function (r) { return r.pct; }))) : null,
        competent_item_rate: pct(dist[2], scored), dist: dist, items_scored: scored,
        competent_n: comp, competency_rate: comp === null ? null : pct(comp, prim.length)
      });
      itemAnalysis[s.checklist_id] = items.map(function (i) {
        var c = perItem[i.item_no], n = c[2] + c[1] + c[0];
        return { item_no: i.item_no, text: i.text, n: n, c2: c[2], c1: c[1], c0: c[0], p2: pct(c[2], n), p1: pct(c[1], n), p0: pct(c[0], n) };
      });
    });

    // --- groups / teams -----------------------------------------------------
    var visibleCl = stationsOut.map(function (s) { return s.day + '|' + s.checklist_id; });
    function meanFor(pp) {
      var vals = [];
      pp.forEach(function (p) { visibleCl.forEach(function (k) { var r = primaryMap[k + '|' + p.participant_no]; if (r) vals.push(r.pct); }); });
      return { n: vals.length, mean_pct: vals.length ? round1(mean(vals)) : null };
    }
    var groupsOut = GROUPS.filter(function (g) { return !f.group || g === f.group; }).map(function (g) {
      var pp = parts.filter(function (p) { return p.group === g; });
      var byStation = {};
      stationsOut.forEach(function (s) {
        var v = pp.map(function (p) { return primaryMap[s.day + '|' + s.checklist_id + '|' + p.participant_no]; }).filter(Boolean).map(function (r) { return r.pct; });
        byStation[s.day + '|' + s.station] = v.length ? round1(mean(v)) : null;
      });
      var m = meanFor(pp);
      return { group: g, n: m.n, mean_pct: m.mean_pct, byStation: byStation };
    });
    var teamsOut = [];
    GROUPS.forEach(function (g) {
      if (f.group && g !== f.group) return;
      TEAMS.forEach(function (t) {
        if (f.team && t !== f.team) return;
        var m = meanFor(parts.filter(function (p) { return p.group === g && p.team === t; }));
        teamsOut.push({ group: g, team: t, n: m.n, mean_pct: m.mean_pct });
      });
    });

    // --- OSCE ---------------------------------------------------------------
    var osce = buildOsce(db, f, scope, nowMs, days, parts, partSet, rule);

    // --- progress grid -----------------------------------------------------
    var columns = [];
    db.stations.slice().sort(function (a, b) { return (a.day + a.station) < (b.day + b.station) ? -1 : 1; }).forEach(function (s) {
      if (days.indexOf(s.day) >= 0 && inScopeStation(scope, s.day, s.station)) columns.push({ key: s.day + '|' + s.checklist_id, label: s.checklist_id, day: s.day, type: 'checklist' });
    });
    days.forEach(function (d) { if (osce.visibleDays.indexOf(d) >= 0) columns.push({ key: 'OSCE|' + d, label: 'OSCE D' + d, day: d, type: 'osce' }); });
    var progress = parts.map(function (p) {
      var cells = {};
      columns.forEach(function (c) {
        if (c.type === 'checklist') {
          var r = primaryMap[c.key + '|' + p.participant_no];
          cells[c.key] = r ? { status: r.status, pct: r.pct === null || isNaN(r.pct) ? null : round1(r.pct) } : { status: 'not_started' };
        } else {
          var o = osce.primaryByDayPart[c.day + '|' + p.participant_no];
          cells[c.key] = o ? { status: o.status, total: o.total, max: o.max } : { status: 'not_started' };
        }
      });
      return { participant_no: p.participant_no, name: p.name, group: p.group, team: p.team, cells: cells };
    }).sort(function (a, b) { return Number(a.participant_no) - Number(b.participant_no); });

    // --- attendance ---------------------------------------------------------
    var attLatest = {};
    db.attendance.forEach(function (a) {
      if (a.session !== 'DAY') return;
      var k = a.day + '|' + a.participant_no;
      if (!attLatest[k] || str(a.timestamp) >= str(attLatest[k].timestamp)) attLatest[k] = a;
    });
    var attendance = ['1', '2', '3'].filter(function (d) { return !f.day || d === str(f.day); }).map(function (d) {
      var present = parts.filter(function (p) { var a = attLatest[d + '|' + p.participant_no]; return a && bool(a.present); }).length;
      return { day: d, present: present, total: parts.length, pct: pct(present, parts.length) };
    });

    // --- participant drill-down -------------------------------------------
    var participantDetail = null;
    if (f.participant && partSet[str(f.participant)]) {
      var pno = str(f.participant);
      participantDetail = {
        participant: partSet[pno],
        checklists: stationsOut.map(function (s) {
          var r = primaryMap[s.day + '|' + s.checklist_id + '|' + pno];
          var items = db.checklistItems.filter(function (i) { return i.checklist_id === s.checklist_id; });
          return {
            day: s.day, station: s.station, checklist_id: s.checklist_id, status: r ? r.status : 'not_started',
            total: r ? r.total : null, max: r ? r.max : null, pct: r ? round1(r.pct) : null,
            items: r ? items.map(function (i) {
              var sc = r.items.filter(function (x) { return x.key === i.item_no; }).map(function (x) { return x.score; });
              return { item_no: i.item_no, text: i.text, scores: sc };
            }) : []
          };
        }),
        osce: osce.individual.filter(function (o) { return o.participant_no === pno; })
      };
    }

    return {
      generated_ms: nowMs, threshold: threshold, threshold_set: threshold !== null, rule: rule, filters: f,
      stations: stationsOut, items: itemAnalysis, groups: groupsOut, teams: teamsOut,
      osce: { byScenario: osce.byScenario, byRole: osce.byRole, byUnit: osce.byUnit, rubric: osce.rubric, completion: osce.completion },
      progress: { columns: columns, rows: progress }, attendance: attendance, participant: participantDetail
    };
  }

  /** Has the round (or day) started? Unknown times fall back to the day's start. */
  function started(db, day, timeRange, nowMs) {
    var ymd = db.dayDates[str(day)];
    if (!ymd) return true;
    var t = parseTimeRange(timeRange).start || '00:00';
    return nowMs >= muscatMs(ymd, t);
  }
  /** OSCE start: timetable row for that day whose time matches the OSCE window. */
  function osceStarted(db, day, nowMs) {
    var cfgT = str((db.config || {})['osce_start_time_day' + day]).trim();
    if (cfgT) return started(db, day, cfgT, nowMs);
    var row = (db.timetable || []).filter(function (t) { return str(t.day) === str(day) && /O[SC]{2}E/i.test(t.topic); })[0];
    return started(db, day, row ? row.time : '', nowMs);
  }

  function buildOsce(db, f, scope, nowMs, days, parts, partSet, rule) {
    var visibleDays = days.filter(function (d) {
      return GROUPS.some(function (g) { return inScopeOsce(scope, d, g); }) && unitsFor(db.osceUnits, d).length;
    });
    var scoreRows = groupBy(db.osceScores, function (s) { return s.osce_assessment_id + '|' + s.version; });
    var recs = [];
    var byId = groupBy(db.osceAssessments, function (a) { return a.osce_assessment_id; });
    Object.keys(byId).forEach(function (id) {
      var st = recordState(byId[id]); if (!st.effective) return;
      var a = st.effective;
      if (visibleDays.indexOf(a.day) < 0 || !partSet[a.participant_no] || !inScopeOsce(scope, a.day, a.group)) return;
      recs.push({
        id: id, day: a.day, osce_id: a.osce_id, group: a.group, team: a.team, participant_no: a.participant_no, role_no: a.role_no,
        assessor_role: a.assessor_role, total: num(a.total), max: num(a.max), pct: pct(num(a.total), num(a.max)),
        role_items_total: num(a.role_items_total), common_total: num(a.common_total), status: st.effective.status, submitted_at: a.submitted_at,
        items: (scoreRows[id + '|' + a.version] || []).map(function (s) { return { key: s.code, score: num(s.score) }; })
      });
    });
    var individual = [], primaryByDayPart = {};
    var g = groupBy(recs, function (r) { return r.osce_id + '|' + r.participant_no; });
    Object.keys(g).forEach(function (k) {
      var p = selectPrimary(g[k], rule); var base = g[k][0];
      var row = { osce_id: base.osce_id, day: base.day, group: base.group, team: base.team, participant_no: base.participant_no,
        role_no: base.role_no, total: p.total, max: p.max, status: p.status };
      individual.push(row); primaryByDayPart[base.day + '|' + base.participant_no] = row;
    });
    var scen = db.osceScenarios.filter(function (o) { return visibleDays.indexOf(o.day) >= 0; });
    var byScenario = scen.map(function (o) {
      var v = individual.filter(function (r) { return r.osce_id === o.osce_id; });
      var m = mean(v.map(function (r) { return r.total; }));
      return { osce_id: o.osce_id, title: o.title, day: o.day, n: v.length, mean: m === null ? null : round1(m), max: 16, mean_pct: m === null ? null : pct(m, 16) };
    });
    var byRole = [];
    scen.forEach(function (o) {
      OSCE_ROLE_NOS.forEach(function (rn) {
        var v = individual.filter(function (r) { return r.osce_id === o.osce_id && r.role_no === rn; });
        var t = (db.osceItems.filter(function (i) { return i.osce_id === o.osce_id && i.role_no === rn; })[0] || {}).role_title || '';
        var m = mean(v.map(function (r) { return r.total; }));
        byRole.push({ osce_id: o.osce_id, role_no: rn, role: t, n: v.length, mean: m === null ? null : round1(m) });
      });
    });
    // Rubric
    var rubricRecs = [];
    var rById = groupBy(db.teamRubric, function (r) { return r.rubric_id; });
    Object.keys(rById).forEach(function (id) {
      var vers = groupBy(rById[id], function (r) { return r.version; });
      var heads = Object.keys(vers).map(function (v) { return vers[v][0]; });
      var st = recordState(heads); if (!st.effective) return;
      var rows = vers[st.effective.version]; var a = rows[0];
      if (visibleDays.indexOf(a.day) < 0 || (f.group && a.group !== f.group) || !inScopeOsce(scope, a.day, a.group)) return;
      rubricRecs.push({ id: id, day: a.day, osce_id: a.osce_id, group: a.group, team: a.team, assessor_role: a.assessor_role,
        submitted_at: a.submitted_at, status: st.effective.status, total: num(a.total), max: num(a.max),
        items: rows.map(function (r) { return { key: r.item_no, score: num(r.score) }; }) });
    });
    var rubricPrimary = {};
    var rg = groupBy(rubricRecs, function (r) { return r.day + '|' + r.osce_id + '|' + r.group + '|' + r.team; });
    Object.keys(rg).forEach(function (k) { rubricPrimary[k] = selectPrimary(rg[k], rule); });
    var rubric = scen.map(function (o) {
      var keys = Object.keys(rubricPrimary).filter(function (k) { return k.split('|')[1] === o.osce_id; });
      var crit = db.osceItems.filter(function (i) { return i.osce_id === o.osce_id && i.section === 'rubric'; }).map(function (i) {
        var v = []; keys.forEach(function (k) { rubricPrimary[k].items.forEach(function (it) { if (it.key === i.code) v.push(it.score); }); });
        var m = mean(v); return { no: i.code, text: i.text, n: v.length, mean: m === null ? null : Math.round(m * 100) / 100 };
      });
      var tm = mean(keys.map(function (k) { return rubricPrimary[k].total; }));
      return { osce_id: o.osce_id, title: o.title, teams: keys.length, mean_total: tm === null ? null : round1(tm), max: 12, criteria: crit };
    });
    var byUnit = [], completion = [];
    visibleDays.forEach(function (d) {
      var units = unitsFor(db.osceUnits, d), exp = 0, done = 0, isStarted = osceStarted(db, d, nowMs);
      GROUPS.forEach(function (gr) {
        if ((f.group && gr !== f.group) || !inScopeOsce(scope, d, gr)) return;
        units.forEach(function (u) {
          if (f.team && u.teams.indexOf(f.team) < 0) return;
          var members = unitMembers(parts, gr, u).map(function (p) { return p.participant_no; });
          var v = individual.filter(function (r) { return r.day === d && r.group === gr && r.team === u.unit; });
          var rp = rubricPrimary[d + '|' + u.osce_id + '|' + gr + '|' + u.unit];
          var m = mean(v.map(function (r) { return r.total; }));
          byUnit.push({ day: d, group: gr, unit: u.unit, label: u.label, osce_id: u.osce_id, members: members.length, scored: v.length,
            mean: m === null ? null : round1(m), rubric_total: rp ? rp.total : null });
          if (isStarted) exp++;
          if (rp) done++;
        });
      });
      completion.push({ day: d, expected: exp, scored: done, pct: pct(Math.min(done, exp), exp) });
    });
    return { visibleDays: visibleDays, individual: individual, primaryByDayPart: primaryByDayPart, byScenario: byScenario,
      byRole: byRole, byUnit: byUnit, rubric: rubric, completion: completion };
  }

  // ---------------------------------------------------------------
  // 8. CSV + tokens
  // ---------------------------------------------------------------
  function parseCsv(text) {
    var rows = [], row = [], cell = '', q = false, s = str(text).replace(/^﻿/, '');
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) { if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return x.trim() !== ''; }); });
  }
  /** Roster import: only updates name/staff_id of EXISTING participant numbers. */
  function planRosterImport(csvText, participants) {
    var rows = parseCsv(csvText), errors = [], updates = [];
    if (!rows.length) return { errors: ['CSV is empty.'], updates: [] };
    var h = rows[0].map(function (x) { return x.trim().toLowerCase(); });
    var iNo = h.indexOf('participant_no'), iName = h.indexOf('name'), iStaff = h.indexOf('staff_id');
    if (iNo < 0 || iName < 0 || iStaff < 0) return { errors: ['Header must be: participant_no,name,staff_id'], updates: [] };
    var seen = {};
    rows.slice(1).forEach(function (r, i) {
      var no = str(r[iNo]).trim();
      if (!participants.some(function (p) { return p.participant_no === no; })) { errors.push('Line ' + (i + 2) + ': participant_no "' + no + '" is not in the roster.'); return; }
      if (seen[no]) { errors.push('Line ' + (i + 2) + ': duplicate participant_no ' + no + '.'); return; }
      seen[no] = 1;
      updates.push({ participant_no: no, name: str(r[iName]).trim(), staff_id: str(r[iStaff]).trim() });
    });
    return { errors: errors, updates: updates };
  }
  function csvEscape(v) { var s = str(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCsv(rows) { return rows.map(function (r) { return r.map(csvEscape).join(','); }).join('\r\n'); }

  /** Signed session tokens. sign(text) must return a URL-safe string (HMAC). */
  function makeToken(email, expMs, sign) {
    var body = str(email).toLowerCase() + '|' + expMs;
    return encodeB64(body) + '.' + sign(body);
  }
  function verifyToken(token, nowMs, sign) {
    var parts = str(token).split('.'); if (parts.length !== 2) return '';
    var body; try { body = decodeB64(parts[0]); } catch (e) { return ''; }
    if (sign(body) !== parts[1]) return '';
    var bits = body.split('|'); if (Number(bits[1]) < nowMs) return '';
    return bits[0];
  }
  // Minimal URL-safe base64 for ASCII e-mail strings (no Utilities dependency).
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function encodeB64(s) {
    var out = '', i = 0;
    for (; i < s.length; i += 3) {
      var a = s.charCodeAt(i), b = s.charCodeAt(i + 1), c = s.charCodeAt(i + 2);
      var n = (a << 16) | ((b || 0) << 8) | (c || 0);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (isNaN(b) ? '' : B64[(n >> 6) & 63]) + (isNaN(c) ? '' : B64[n & 63]);
    }
    return out;
  }
  function decodeB64(s) {
    var out = '', bits = 0, val = 0;
    for (var i = 0; i < s.length; i++) {
      var k = B64.indexOf(s[i]); if (k < 0) throw new Error('bad token');
      val = (val << 6) | k; bits += 6;
      if (bits >= 8) { bits -= 8; out += String.fromCharCode((val >> bits) & 255); }
    }
    return out;
  }

  return {
    SCORES: SCORES, STATIONS: STATIONS, ROUNDS: ROUNDS, GROUPS: GROUPS, TEAMS: TEAMS, OSCE_ROLE_NOS: OSCE_ROLE_NOS,
    OSCE_UNITS_SPEC: OSCE_UNITS_SPEC, EXPECT: EXPECT,
    str: str, num: num, bool: bool, pct: pct, groupBy: groupBy, toDay: toDay, toStation: toStation, toRound: toRound,
    toGroup: toGroup, toTeam: toTeam, normRole: normRole, parseTimeRange: parseTimeRange, parseDate: parseDate, muscatMs: muscatMs,
    normaliseSeed: normaliseSeed, validateSeed: validateSeed,
    buildCtx: buildCtx, can: can, rolesAt: rolesAt, dashboardScope: dashboardScope, inScopeStation: inScopeStation, inScopeOsce: inScopeOsce,
    rotationGroup: rotationGroup, roundsForStation: roundsForStation, unitsFor: unitsFor, unitMembers: unitMembers,
    recordState: recordState, nextVersion: nextVersion, selectPrimary: selectPrimary,
    validateChecklist: validateChecklist, validateOsce: validateOsce, validateRubric: validateRubric,
    buildDashboard: buildDashboard, started: started,
    parseCsv: parseCsv, planRosterImport: planRosterImport, toCsv: toCsv, makeToken: makeToken, verifyToken: verifyToken
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
