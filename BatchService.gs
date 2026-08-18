function createBatch(lineUid, recordIdList) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('ระบบไม่ว่าง กรุณาลองใหม่ในภายหลัง (Lock Timeout)');
  }
  
  try {
    var usersProfile = getSheetDataAsObjects(CONFIG.SHEET_USERS_PROFILE);
    var user = usersProfile.find(function(u) { return u['line_uid'] === lineUid; });
    if (!user || user['pettycash_control'] !== 'YES') {
      throw new Error('Access denied');
    }
    
    var taxDataSheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_TAXDATA);
    var taxDataRows = getSheetDataAsObjects(CONFIG.SHEET_TAXDATA);
    
    var validBills = [];
    var excludedRecords = [];
    var totalAmount = 0;
    
    // Validate each requested bill
    recordIdList.forEach(function(recordId) {
      var billRow = taxDataRows.find(function(row) { return row['record_id'] == recordId; });
      if (billRow && billRow['Line_UID'] === lineUid && billRow['req_type'] == '2' && billRow['status'] === 'pending' && (!billRow['pettycash_batch_id'] || billRow['pettycash_batch_id'] === '')) {
        var mappedBill = {
          _rowIndex: billRow._rowIndex,
          record_id: billRow['record_id'] || billRow['Record_id'] || '',
          doc_date: billRow['doc_date'] || billRow['Doc_date'] || '',
          vend_name: billRow['Vend_name'] || billRow['vend_name'] || '',
          net: billRow['Net'] || billRow['net'] || 0,
          pic_bill: billRow['Pic_bill'] || billRow['pic_bill'] || '',
          project: billRow['Project'] || billRow['project'] || '',
          tax_docno: billRow['Tax_docno'] || billRow['tax_docno'] || ''
        };
        validBills.push(mappedBill);
        var net = parseFloat(mappedBill.net) || 0;
        totalAmount += net;
      } else {
        excludedRecords.push(recordId);
      }
    });
    
    if (validBills.length === 0) {
      throw new Error('ไม่มีรายการบิลที่สามารถทำรายการได้');
    }
    
    // Generate Batch ID
    var batchId = "'" + new Date().getTime().toString();
    var holderName = user['Request_Name'];
    var empNo = user['emp_no'];
    var pcLimit = user['pc.limit'] || user['Pc.limit'] || user['PC.limit'] || 0;
    
    // Generate PDF (Moved to approval step)
    
    // Write to PettyCash_Batch
    var batchSheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_PETTYCASH_BATCH);
    var createDatetime = new Date();
    // Headers: batch_id, create_datetime, holder_line_uid, holder_name, record_id_list, total_amount, pdf_url, sent_email_to, sent_datetime, approve_status, Approver_name, Approve_Datetime, pc.limit
    batchSheet.appendRow([
      batchId, 
      createDatetime, 
      lineUid, 
      holderName, 
      validBills.map(function(b) { return b['record_id']; }).join(','), 
      totalAmount, 
      '', // pdf_url (generated on approve)
      '', // sent_email_to (sent on approve)
      '', // sent_datetime
      'pending', // Waiting for approver
      '', // Approver_name
      '', // Approve_Datetime
      pcLimit // pc.limit (Column M)
    ]);
    
    // Update TaxData
    // We need to find the column index for status and pettycash_batch_id
    var taxHeaders = taxDataSheet.getRange(1, 1, 1, taxDataSheet.getLastColumn()).getValues()[0];
    var statusColIdx = taxHeaders.indexOf('status') + 1;
    var batchIdColIdx = taxHeaders.indexOf('pettycash_batch_id') + 1;
    var approveUserIdColIdx = taxHeaders.indexOf('approve_userid') + 1;
    var approveDatetimeColIdx = taxHeaders.indexOf('approve_datetime') + 1;
    
    var currentDateTime = new Date();
    
    validBills.forEach(function(billRow) {
      var rowIndex = billRow._rowIndex;
      if (statusColIdx > 0) taxDataSheet.getRange(rowIndex, statusColIdx).setValue('Approved'); // Immediately approve
      if (batchIdColIdx > 0) taxDataSheet.getRange(rowIndex, batchIdColIdx).setValue(batchId);
      if (approveUserIdColIdx > 0) taxDataSheet.getRange(rowIndex, approveUserIdColIdx).setValue(lineUid);
      if (approveDatetimeColIdx > 0) taxDataSheet.getRange(rowIndex, approveDatetimeColIdx).setValue(currentDateTime);
    });
    
    // Send Email (Moved to approval step)
    
    return {
      batch_id: batchId,
      pdf_url: '', // No PDF yet
      total_amount: totalAmount,
      excluded_records: excludedRecords
    };
  } finally {
    lock.releaseLock();
  }
}
