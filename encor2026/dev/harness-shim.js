/* Preview harness glue. Part 1 runs before the server files, part 2 after. */
(function () {
  var q = new URLSearchParams(location.search);
  var start = Date.UTC(2026, 10, 16, 7, 20);                // Day 2, 11:20 Muscat (R3 running)
  var G = createGas({ ownerEmail: 'owner@preview.invalid', now: start });
  ['SpreadsheetApp', 'PropertiesService', 'Session', 'LockService', 'Utilities', 'HtmlService', 'ScriptApp', 'Logger'].forEach(function (k) { window[k] = G[k]; });
  var realNow = Date.now.bind(Date), realStart = realNow();
  setInterval(function () { G.__state.clock = Math.max(G.__state.clock, start + (realNow() - realStart)); }, 250);
  window.Date = G.Date;                                     // server code + UI share the simulated clock
  window.__G = G; window.__q = q;
})();
/*__SERVER__*/
(function () {
  var G = window.__G, q = window.__q;
  seedSheets();
  G.__state.activeEmail = 'owner@preview.invalid';
  var users = [
    ['facb@preview.invalid', 'Preview facilitator B', 'facilitator', '2', 'B'],
    ['leadb@preview.invalid', 'Preview leader B', 'station_leader', '2', 'B'],
    ['orgb@preview.invalid', 'Preview organizer B', 'organizer', '2', 'B'],
    ['osce@preview.invalid', 'Preview OSCE G1', 'facilitator', '2,3', 'OSCE-G1']
  ];
  users.forEach(function (u) { api('', 'adminSaveUser', { user: { email: u[0], name: u[1], role: u[2], day: u[3], station: u[4] } }); });
  if (q.get('refresh')) api('', 'adminSetConfig', { key: 'dashboard_refresh_sec', value: q.get('refresh') });
  if (q.get('demo')) {                                      // SYNTHETIC scores, preview only
    var items = readTable_('ChecklistItems'), rot = readTable_('Rotation'), n = 0;
    ['A', 'B', 'C', 'D'].forEach(function (st) {
      var cid = readTable_('Stations').filter(function (s) { return s.day === '2' && s.station === st; })[0].checklist_id;
      ['R1', 'R2'].forEach(function (r) {
        var g = rot.filter(function (x) { return x.day === '2' && x.round === r && x.station === st; })[0].group;
        readTable_('Participants').filter(function (p) { return p.group === g; }).slice(0, 8).forEach(function (p) {
          var sc = {}; items.filter(function (i) { return i.checklist_id === cid; }).forEach(function (i, k) { n++; sc[i.item_no] = (n * 7 + k * 3) % 10 < 6 ? 2 : (n + k) % 3 ? 1 : 0; });
          api('', 'submitChecklist', { request_id: 'demo' + n + p.participant_no + st, day: '2', station: st, round: r, checklist_id: cid, participant_no: p.participant_no, scores: sc });
        });
      });
    });
  }
  G.__state.activeEmail = q.get('as') || 'owner@preview.invalid';
  function runner(ok, fail) {
    return {
      withSuccessHandler: function (fn) { return runner(fn, fail); },
      withFailureHandler: function (fn) { return runner(ok, fn); },
      api: function () {
        var args = arguments;
        setTimeout(function () {
          if (window.__offline) { if (fail) fail(new Error('offline')); return; }
          try { var r = JSON.parse(JSON.stringify(api.apply(null, args))); if (ok) ok(r); } catch (e) { if (fail) fail(e); }
        }, 40);
      }
    };
  }
  window.google = { script: { run: runner() } };
})();
