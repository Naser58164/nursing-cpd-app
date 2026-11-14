/**
 * ENCOR 2026 — Sign-in helper (a SEPARATE, tiny Apps Script project).
 * ------------------------------------------------------------------
 * Why: the main app runs "as me" so it can write to the sheet, and in that
 * mode Google does not reveal the visitor's e-mail to the script for
 * accounts outside the owner's Workspace domain (e.g. @gmail.com).
 * This helper runs "as the user accessing", which only asks for permission
 * to see the user's e-mail address. It issues a 5-minute signed ticket and
 * sends the user to the main app, which verifies the signature.
 *
 * Script Properties (Project settings → Script properties):
 *   AUTH_SECRET  same value as the main project (run setupAuth() there)
 *   MAIN_URL     the main web app /exec URL
 */
function doGet() {
  var p = PropertiesService.getScriptProperties();
  var secret = p.getProperty('AUTH_SECRET'), main = p.getProperty('MAIN_URL');
  if (!secret || !main) return page_('<p>Sign-in is not configured yet. Ask the workshop Admin.</p>');
  var email = (Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) return page_('<p>Your Google e-mail address could not be read. Make sure you are signed in to Google.</p>');
  var body = email + '|' + (Date.now() + 5 * 60 * 1000);
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, secret)).replace(/=+$/, '');
  var url = main + '?ticket=' + encodeURIComponent(b64_(body) + '.' + sig);
  return page_('<p>Signed in as <b>' + esc_(email) + '</b>.</p><p><a class="b" href="' + esc_(url) + '" target="_top">Continue to ENCOR 2026 Assessment</a></p>');
}
function page_(inner) {
  return HtmlService.createHtmlOutput('<div style="font:16px system-ui;max-width:420px;margin:15vh auto;padding:0 16px;text-align:center">' +
    '<h2>ENCOR 2026 Assessment</h2>' + inner + '<style>.b{display:inline-block;padding:14px 20px;border-radius:10px;background:#1c5cab;color:#fff;text-decoration:none;font-weight:600}</style></div>')
    .setTitle('ENCOR 2026 sign-in').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function esc_(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
/** URL-safe base64 without padding — identical to Logic.gs encodeB64 in the main project. */
function b64_(s) {
  var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', out = '';
  for (var i = 0; i < s.length; i += 3) {
    var a = s.charCodeAt(i), b = s.charCodeAt(i + 1), c = s.charCodeAt(i + 2);
    var n = (a << 16) | ((b || 0) << 8) | (c || 0);
    out += A[(n >> 18) & 63] + A[(n >> 12) & 63] + (isNaN(b) ? '' : A[(n >> 6) & 63]) + (isNaN(c) ? '' : A[n & 63]);
  }
  return out;
}
