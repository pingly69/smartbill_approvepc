function getSheetDataAsObjects(sheetName) {
  var sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(sheetName);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  var headers = data[0];
  var rows = data.slice(1);
  
  return rows.map(function(row, rowIndex) {
    var obj = { _rowIndex: rowIndex + 2 }; // Keep track of actual row number (1-based index)
    headers.forEach(function(header, index) {
      obj[header] = row[index];
    });
    return obj;
  });
}

function getMyPendingBills(lineUid) {
  var usersProfile = getSheetDataAsObjects(CONFIG.SHEET_USERS_PROFILE);
  var user = usersProfile.find(function(u) { return u['line_uid'] === lineUid; });
  
  if (!user || user['pettycash_control'] !== 'YES') {
    throw new Error('Access denied: You do not have permission to manage petty cash.');
  }

  var taxData = getSheetDataAsObjects(CONFIG.SHEET_TAXDATA);
  
  var pendingBills = taxData.filter(function(row) {
    // req_type = "2", status = "pending", pettycash_batch_id = empty, Line_UID = lineUid
    return row['req_type'] == '2' && 
           row['status'] === 'pending' && 
           (!row['pettycash_batch_id'] || row['pettycash_batch_id'] === '') &&
           row['Line_UID'] === lineUid;
  });
  
  return pendingBills.map(function(bill) {
    return {
      record_id: bill['record_id'] || bill['Record_id'] || '',
      doc_date: bill['doc_date'] || bill['Doc_date'] || '',
      vend_name: bill['Vend_name'] || bill['vend_name'] || '',
      net: bill['Net'] || bill['net'] || 0,
      pic_bill: bill['Pic_bill'] || bill['pic_bill'] || '',
      project: bill['Project'] || bill['project'] || '',
      tax_docno: bill['Tax_docno'] || bill['tax_docno'] || ''
    };
  });
}
