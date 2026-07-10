// EmailAuto Studio — Google Sheet "templates" tab webhook (Task 4: auto-fill after SendGrid push).
//
// Install (sheet owner):
//   1. Open the tracking sheet → Extensions → Apps Script → replace Code.gs with this file.
//   2. Set SECRET below to the value of SHEETS_WEBHOOK_SECRET from the app env.
//   3. Deploy → New deployment → type "Web app" → Execute as: Me → Who has access: Anyone → Deploy.
//   4. Copy the Web app URL (…/exec) into the app env as SHEETS_WEBHOOK_URL.
//
// The app POSTs { secret, row } where row keys match the header names in row 1 of the
// "templates" tab. Unknown headers are left blank, so column order never matters.
// Expected headers (add/rename freely — keys are matched by exact header text):
//   date | name | subject | type | design_id | template_id | singlesend_id | sendgrid_url | status | user_id

const SHEET_NAME = 'templates';
const SECRET = 'REPLACE_WITH_SHEETS_WEBHOOK_SECRET';

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (!SECRET || body.secret !== SECRET) return json({ ok: false, error: 'unauthorized' });

    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sh) return json({ ok: false, error: 'sheet not found: ' + SHEET_NAME });

    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
      .map(function (h) { return String(h).trim(); });
    const row = headers.map(function (h) {
      return body.row && body.row[h] != null ? body.row[h] : '';
    });
    sh.appendRow(row); // appendRow targets the next empty row atomically
    return json({ ok: true, appendedRow: sh.getLastRow() });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
