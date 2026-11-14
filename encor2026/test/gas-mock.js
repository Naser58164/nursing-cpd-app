/**
 * In-memory mock of the Apps Script services used by Code.gs / Seed.gs.
 * Used by the Node tests AND the browser preview harness.
 * TEST-ONLY: nothing here ever touches a real spreadsheet.
 *
 * It imitates Google Sheets' value coercion for cells that are NOT
 * formatted as plain text ('@'): leading "=" becomes a formula, numeric
 * strings become numbers, dd/mm/yyyy strings become dates. That lets the
 * tests prove the app stores seed text verbatim.
 */
(function (root) {
  'use strict';

  function createGas(opts) {
    opts = opts || {};
    var state = { activeEmail: opts.activeEmail || '', ownerEmail: opts.ownerEmail || 'owner@test.invalid', props: {}, clock: opts.now || Date.UTC(2026, 10, 16, 6, 0), log: [] };

    // ---- Sheets -------------------------------------------------------
    function coerce(v, fmt) {
      if (fmt === '@' || typeof v !== 'string') return v;
      if (/^=/.test(v)) return '#FORMULA!' + v;                         // would be evaluated
      if (/^\s*[-+]?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) return '#DATE!' + v;
      return v;
    }
    function Sheet(name) { this.name = name; this.cells = []; this.frozen = 0; }
    Sheet.prototype.getName = function () { return this.name; };
    Sheet.prototype.cell = function (r, c) {
      this.cells[r - 1] = this.cells[r - 1] || [];
      this.cells[r - 1][c - 1] = this.cells[r - 1][c - 1] || { v: '', f: '' };
      return this.cells[r - 1][c - 1];
    };
    Sheet.prototype.getLastRow = function () {
      for (var r = this.cells.length; r > 0; r--) {
        var row = this.cells[r - 1] || [];
        if (row.some(function (c) { return c && c.v !== ''; })) return r;
      }
      return 0;
    };
    Sheet.prototype.getLastColumn = function () {
      var m = 0;
      this.cells.forEach(function (row) { (row || []).forEach(function (c, i) { if (c && c.v !== '') m = Math.max(m, i + 1); }); });
      return m;
    };
    Sheet.prototype.getMaxRows = function () { return Math.max(1000, this.cells.length); };
    Sheet.prototype.setFrozenRows = function (n) { this.frozen = n; return this; };
    Sheet.prototype.clear = function () { this.cells = []; return this; };
    Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this, r, c, nr || 1, nc || 1); };
    Sheet.prototype.getDataRange = function () { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); };

    function Range(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
    Range.prototype.each = function (fn) { for (var i = 0; i < this.nr; i++) for (var j = 0; j < this.nc; j++) fn(this.sh.cell(this.r + i, this.c + j), i, j); };
    Range.prototype.getValues = function () {
      var out = []; for (var i = 0; i < this.nr; i++) { out.push([]); for (var j = 0; j < this.nc; j++) { var row = this.sh.cells[this.r + i - 1] || []; var c = row[this.c + j - 1]; out[i].push(c ? c.v : ''); } }
      return out;
    };
    Range.prototype.setValues = function (vals) {
      if (vals.length !== this.nr || vals[0].length !== this.nc) throw new Error('setValues: dimensions ' + vals.length + 'x' + vals[0].length + ' ≠ range ' + this.nr + 'x' + this.nc);
      this.each(function (cell, i, j) { cell.v = coerce(vals[i][j], cell.f); }); return this;
    };
    Range.prototype.setNumberFormat = function (f) { this.each(function (cell) { cell.f = f; }); return this; };
    Range.prototype.clearContent = function () { this.each(function (cell) { cell.v = ''; }); return this; };
    Range.prototype.getNumberFormats = function () { var o = []; for (var i = 0; i < this.nr; i++) { o.push([]); for (var j = 0; j < this.nc; j++) o[i].push(this.sh.cell(this.r + i, this.c + j).f); } return o; };

    var ss = { sheets: [new Sheet('Sheet1')] };
    ss.getSheetByName = function (n) { return ss.sheets.filter(function (s) { return s.name === n; })[0] || null; };
    ss.insertSheet = function (n) { if (ss.getSheetByName(n)) throw new Error('Sheet exists: ' + n); var s = new Sheet(n); ss.sheets.push(s); return s; };
    ss.getSheets = function () { return ss.sheets.slice(); };
    ss.deleteSheet = function (s) { ss.sheets = ss.sheets.filter(function (x) { return x !== s; }); };

    // ---- Clock (monotonic so timestamps never tie) -------------------
    var RealDate = Date;
    function FakeDate(a, b, c, d, e, f, g) {
      if (!(this instanceof FakeDate)) return new RealDate(state.clock).toString();
      var dt = arguments.length === 0 ? new RealDate(++state.clock) : (arguments.length === 1 ? new RealDate(a) : new RealDate(a, b, c || 1, d || 0, e || 0, f || 0, g || 0));
      Object.setPrototypeOf(dt, FakeDate.prototype); return dt;
    }
    FakeDate.prototype = Object.create(RealDate.prototype);
    FakeDate.now = function () { return state.clock; };
    FakeDate.UTC = RealDate.UTC; FakeDate.parse = RealDate.parse;

    var nodeCrypto = null;
    try { nodeCrypto = typeof require === 'function' ? require('crypto') : null; } catch (e) { nodeCrypto = null; }
    var uuidN = 0;

    var gas = {
      __state: state, __ss: ss, Date: FakeDate,
      SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; }, openById: function () { return ss; } },
      PropertiesService: { getScriptProperties: function () { return {
        getProperty: function (k) { return state.props[k] === undefined ? null : state.props[k]; },
        setProperty: function (k, v) { state.props[k] = String(v); return this; } }; } },
      Session: {
        getActiveUser: function () { return { getEmail: function () { return state.activeEmail; } }; },
        getEffectiveUser: function () { return { getEmail: function () { return state.ownerEmail; } }; }
      },
      LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
      Utilities: {
        getUuid: function () { uuidN++; return 'uuid-' + ('00000' + uuidN).slice(-6); },
        formatDate: function (d) { // always Asia/Muscat ISO with ms
          var t = new RealDate(d.getTime() + 4 * 3600 * 1000).toISOString().replace('Z', '+04:00'); return t;
        },
        computeHmacSha256Signature: function (text, key) {
          if (!nodeCrypto) return Array.from(text + key).map(function (ch) { return ch.charCodeAt(0) & 127; });
          return Array.from(nodeCrypto.createHmac('sha256', key).update(text).digest());
        },
        base64EncodeWebSafe: function (bytes) {
          var b = typeof Buffer !== 'undefined' ? Buffer.from(bytes.map(function (x) { return x & 255; })).toString('base64') : btoa(String.fromCharCode.apply(null, bytes.map(function (x) { return x & 255; })));
          return b.replace(/\+/g, '-').replace(/\//g, '_');
        }
      },
      HtmlService: {
        createHtmlOutputFromFile: function (n) { throw new Error('No HTML file ' + n + ' in mock'); },
        XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' }
      },
      ScriptApp: { getProjectTriggers: function () { return []; } },
      Logger: { log: function (m) { state.log.push(m); } }
    };
    return gas;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createGas: createGas };
  else root.createGas = createGas;
})(this);
