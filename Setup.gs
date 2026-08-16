function setupPettyCashBatchSheet() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(CONFIG.SHEET_PETTYCASH_BATCH);
  
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_PETTYCASH_BATCH);
  }
  
  var headers = [
    'batch_id',
    'create_datetime',
    'holder_line_uid',
    'holder_name',
    'record_id_list',
    'total_amount',
    'pdf_url',
    'sent_email_to',
    'sent_datetime',
    'approve_status'
  ];
  
  // Set headers in the first row
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // Format the header row (bold, background color)
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#f3f4f6');
  
  // Optional: Freeze the first row
  sheet.setFrozenRows(1);
  
  Logger.log('สร้างหัวตารางสำเร็จเรียบร้อย!');
}
