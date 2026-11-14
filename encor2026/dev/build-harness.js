#!/usr/bin/env node
/**
 * Builds dev/harness.html: the real Index/Styles/App UI + the real server code
 * (Logic/Code/Seed) running in the browser against the in-memory mock.
 * PREVIEW ONLY. No Google services, no real spreadsheet. Optional ?demo=1 adds
 * SYNTHETIC scores (clearly labelled) so the dashboard has something to draw.
 */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..'), AS = path.join(ROOT, 'apps-script');
var rd = function (p) { return fs.readFileSync(p, 'utf8'); };
var chartLocal = path.relative(__dirname, path.join(ROOT, '..', 'vendor', 'chartjs', 'chart.umd.js'));

var server = [
  rd(path.join(ROOT, 'test', 'gas-mock.js')),
  'var ENCOR_SEED = ' + rd(path.join(ROOT, 'seed', 'encor2026_seed.json')) + ';',
  rd(path.join(__dirname, 'harness-shim.js')).split('/*__SERVER__*/')[0],
  rd(path.join(AS, 'Logic.gs')), rd(path.join(AS, 'Code.gs')), rd(path.join(AS, 'Seed.gs')),
  rd(path.join(__dirname, 'harness-shim.js')).split('/*__SERVER__*/')[1]
].join('\n;\n').replace(/<\/script/gi, '<\\/script');

var html = rd(path.join(AS, 'Index.html'))
  .replace("<?!= include('Styles'); ?>", function () { return rd(path.join(AS, 'Styles.html')); })
  .replace("<?!= include('App'); ?>", function () { return rd(path.join(AS, 'App.html')); })
  .replace('<?!= sessionTokenJs ?>', '""').replace('<?!= signinUrlJs ?>', '""')
  .replace(/<script src="https:\/\/cdnjs[^"]+chart\.umd\.min\.js"><\/script>/, function () { return '<script src="' + chartLocal + '"></script>'; })
  .replace('<body>', function () { return '<body>\n<div style="background:#7a5200;color:#fff;padding:4px 16px;font:12px system-ui">PREVIEW HARNESS — in-memory mock, not connected to any sheet</div>\n<script>\n' + server + '\n</script>'; });
fs.writeFileSync(path.join(__dirname, 'harness.html'), html);
console.log('wrote dev/harness.html');
