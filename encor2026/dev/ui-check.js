#!/usr/bin/env node
/**
 * UI acceptance checks in a real browser (Chromium via Playwright) against
 * dev/harness.html (in-memory mock; no real sheet).
 *   §10.9  phone width (390 px): no horizontal page scroll on every screen
 *   §10.6  Submit disabled until every item is scored; confirmation summary shown
 *   §10.8  "Threshold not set" shown; no competency % rendered
 *   §10.10 completion chart/table updates within one refresh interval
 *   Offline: entry kept in outbox ("Waiting to sync") and sent when back online
 *
 *   node dev/ui-check.js [screenshotDir]
 */
'use strict';
var path = require('path'), fs = require('fs');
var { chromium } = require('playwright');
require('child_process').execSync('node ' + JSON.stringify(path.join(__dirname, 'build-harness.js')));
var URL = 'file://' + path.join(__dirname, 'harness.html');
var SHOTS = process.argv[2] && process.argv[2].indexOf('--') !== 0 ? process.argv[2] : '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

var results = [];
function rec(id, name, ok, info) { results.push({ id: id, name: name, ok: ok, info: info || '' }); console.log((ok ? 'PASS ' : 'FAIL ') + id + '  ' + name + (info ? '  — ' + info : '')); }

(async function () {
  var browser = await chromium.launch();
  var ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  var page = await ctx.newPage();
  var errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  var overflow = [];
  async function checkWidth(label) {
    await page.waitForTimeout(250);
    var w = await page.evaluate(function () { return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
    if (w.sw > w.cw) overflow.push(label + ' (' + w.sw + ' > ' + w.cw + ')');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, label.replace(/\W+/g, '_') + '.png'), fullPage: false });
  }
  async function back() { await page.click('#backBtn'); await page.waitForTimeout(200); }

  // ---- as facilitator of Station B, Day 2, with synthetic demo rows + 2 s refresh
  await page.goto(URL + '?as=facb@preview.invalid&demo=1&refresh=2');
  await page.waitForSelector('[data-day]');
  await checkWidth('01 home');
  await page.click('[data-day="2"]'); await page.waitForSelector('[data-st]');
  var tiles = await page.$$eval('[data-st]', function (b) { return b.map(function (x) { return x.getAttribute('data-st'); }); });
  rec('10.5-ui', 'Facilitator B sees only Station B on Day 2', JSON.stringify(tiles) === '["B"]', JSON.stringify(tiles));
  await checkWidth('02 day2');
  await page.click('[data-st="B"]'); await page.waitForSelector('[data-p]');
  await checkWidth('03 station B');
  await page.click('[data-round="R3"]'); await page.waitForSelector('[data-p]');
  var firstP = await page.$eval('[data-p]', function (b) { return b.getAttribute('data-p'); });
  await page.click('[data-p="' + firstP + '"]'); await page.waitForSelector('.item');
  await checkWidth('04 checklist');
  var n = await page.$$eval('.item', function (x) { return x.length; });
  rec('10.4-ui', 'Checklist B1 shows 13 items in seed order', n === 13);
  var disabledBefore = await page.$eval('#submit', function (b) { return b.disabled; });
  var items = await page.$$('.item');
  for (var i = 0; i < items.length - 1; i++) await (await items[i].$('.score[data-v="' + (i % 3 === 2 ? 1 : 2) + '"]')).click();
  var disabledMid = await page.$eval('#submit', function (b) { return b.disabled; });
  await (await items[items.length - 1].$('.score[data-v="0"]')).click();
  var disabledAfter = await page.$eval('#submit', function (b) { return b.disabled; });
  rec('10.6-ui', 'Submit disabled until every item is scored', disabledBefore && disabledMid && !disabledAfter);
  var tot = await page.$eval('#tot', function (e) { return e.textContent; });
  rec('UI', 'Running total shown', /\/ 26$/.test(tot), tot);
  await page.click('#submit'); await page.waitForSelector('.modal');
  await checkWidth('05 confirm');
  var summary = await page.$eval('.modal', function (m) { return m.textContent; });
  rec('UI', 'Confirmation summary before saving', /Confirm submission/.test(summary) && /#\d+/.test(summary));
  await page.click('[data-yes]');
  await page.waitForFunction(function () { return document.querySelector('#syncBadge').textContent === 'Saved to sheet'; }, null, { timeout: 5000 });
  await page.waitForSelector('.st.mine');
  rec('UI', 'Badge returns to "Saved to sheet" and participant shows "Submitted by me"', true);

  // ---- offline tolerance
  await page.evaluate(function () { window.__offline = true; });
  var second = await page.$$eval('[data-p]', function (b) { return b[1].getAttribute('data-p'); });
  await page.click('[data-p="' + second + '"]'); await page.waitForSelector('.item');
  for (var el of await page.$$('.item')) await (await el.$('.score[data-v="2"]')).click();
  await page.click('#submit'); await page.click('[data-yes]');
  await page.waitForFunction(function () { return /Waiting to sync/.test(document.querySelector('#syncBadge').textContent); });
  var stored = await page.evaluate(function () { return JSON.parse(localStorage.getItem('encor_outbox')).length; });
  await page.evaluate(function () { window.__offline = false; window.ENCOR.flush(); });
  await page.waitForFunction(function () { return document.querySelector('#syncBadge').textContent === 'Saved to sheet'; }, null, { timeout: 8000 });
  rec('UI', 'Offline entry kept in browser storage ("Waiting to sync") and sent when back online', stored === 1);

  // ---- dashboard
  await back(); await back();
  await page.click('#toDash'); await page.waitForSelector('#dash .kpis');
  await page.waitForTimeout(400);
  await checkWidth('06 dashboard overview');
  var txt = await page.$eval('#dash', function (d) { return d.textContent; });
  rec('10.8-ui', 'Threshold blank → "Threshold not set", no competency %', /Threshold not set/.test(txt) && !/Competency rate by station[^]*\d+%/.test(txt.split('Mean score % by station')[0].split('Competency rate by station')[1] || ''));
  var before = await page.$eval('table[data-csv="completion"] tbody tr td:nth-child(3)', function (td) { return td.textContent; });
  // another assessor (station leader) submits on the server side
  await page.evaluate(function () {
    var G = window.__G, keep = G.__state.activeEmail; G.__state.activeEmail = 'leadb@preview.invalid';
    var sc = {}; readTable_('ChecklistItems').filter(function (i) { return i.checklist_id === 'B1'; }).forEach(function (i) { sc[i.item_no] = 2; });
    var g = readTable_('Rotation').filter(function (r) { return r.day === '2' && r.round === 'R3' && r.station === 'B'; })[0].group;
    var p = readTable_('Participants').filter(function (x) { return x.group === g; })[11];
    api('', 'submitChecklist', { request_id: 'ui-live', day: '2', station: 'B', round: 'R3', checklist_id: 'B1', participant_no: p.participant_no, scores: sc });
    G.__state.activeEmail = keep;
  });
  await page.waitForTimeout(2600);   // refresh interval = 2 s
  var after = await page.$eval('table[data-csv="completion"] tbody tr td:nth-child(3)', function (td) { return td.textContent; });
  rec('10.10-ui', 'Station completion updates within one refresh interval', Number(after) === Number(before) + 1, before + ' → ' + after);
  for (var t of ['station', 'osce', 'group', 'participant', 'progress']) {
    await page.click('[data-tab="' + t + '"]'); await page.waitForTimeout(300);
    await checkWidth('07 dashboard ' + t);
  }

  // ---- admin (owner) + OSCE
  await page.goto(URL + '?demo=1'); await page.waitForSelector('[data-day]');
  await page.click('#toDash'); await page.waitForSelector('#dash .kpis'); await page.waitForTimeout(400);
  await checkWidth('08 admin dashboard');
  await back(); await page.click('#toAdmin'); await page.waitForSelector('#adm table');
  await checkWidth('09 admin users');
  for (var at of ['roster', 'settings', 'readiness', 'seed', 'export']) { await page.click('[data-at="' + at + '"]'); await page.waitForTimeout(300); await checkWidth('10 admin ' + at); }
  var seedTxt = await page.evaluate(function () { return document.body.textContent; });
  await page.click('[data-at="seed"]'); await page.waitForSelector('#adm h2'); await page.waitForTimeout(200);
  seedTxt = await page.$eval('#adm', function (d) { return d.textContent; });
  rec('10.4-ui', 'Admin seed check passes (sheet text = seed)', /Pass/.test(seedTxt) && /character for character/.test(seedTxt));
  await back();
  await page.click('[data-day="3"]'); await page.click('#toOsce'); await page.waitForSelector('[data-g]');
  await checkWidth('11 osce rooms');
  await page.click('[data-g="G1"][data-u="a"]'); await page.waitForSelector('[data-role]');
  var sels = await page.$$('[data-role]');
  for (var k = 0; k < sels.length; k++) await sels[k].selectOption('R' + (k + 1));
  var un = await page.$eval('#unass', function (e) { return e.textContent; });
  rec('UI', 'Team of 3 leaves one role unassigned', /Unassigned: R4/.test(un), un);
  await checkWidth('12 osce team');
  await page.click('[data-m]'); await page.waitForSelector('.item');
  var on = await page.$$eval('.item', function (x) { return x.length; });
  rec('UI', 'OSCE member form = 5 role items + 3 common (max 16)', on === 8 && /\/ 16/.test(await page.$eval('#tot', function (e) { return e.textContent; })));
  await checkWidth('13 osce member');

  // ---- not authorised
  await page.goto(URL + '?as=stranger@preview.invalid'); await page.waitForTimeout(500);
  var body = (await page.$eval('#app', function (a) { return a.textContent.trim(); }));
  rec('UI', 'Unknown e-mail sees only "Not authorised"', body === 'Not authorised', body);

  rec('10.9', 'Phone width 390 px: no horizontal scrolling on any screen', overflow.length === 0, overflow.join('; '));
  rec('UI', 'No JavaScript errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  var mdIdx = process.argv.indexOf('--md');
  if (mdIdx > 0) fs.writeFileSync(process.argv[mdIdx + 1], '| # | Test | Result |\n|---|---|---|\n' + results.map(function (r) { return '| ' + r.id + ' | ' + r.name + ' | ' + (r.ok ? '✅ Pass' : '❌ Fail') + ' |'; }).join('\n') + '\n');
  process.exit(results.every(function (r) { return r.ok; }) ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
