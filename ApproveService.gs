function checkApproverAccess(lineUid) {
  var approveUsers = getSheetDataAsObjects(CONFIG.SHEET_APPROVE_USERS);
  // Column A: Approve_request (Approve_request in header maybe?), Column C: Line_uid
  // The user says "ตรวจสอบ sheet Approve_Users colum Approve_request (colum A) ให้หา คำว่า "เงินสดย่อยรอตัด" ตรวจสอบ column C (Line_uid)"
  var approver = approveUsers.find(function(u) {
    var reqStr = String(u['Approve_request'] || u['approve_request'] || '').trim();
    var uidStr = String(u['Line_uid'] || u['line_uid'] || '').trim();
    return reqStr === 'เงินสดย่อยรอตัด' && uidStr === lineUid;
  });
  
  if (!approver) {
    throw new Error('Access denied: You do not have permission to approve petty cash.');
  }
  return approver;
}

function getPendingBatches(lineUid) {
  checkApproverAccess(lineUid);
  
  var batchSheetData = getSheetDataAsObjects(CONFIG.SHEET_PETTYCASH_BATCH);
  var pendingBatches = batchSheetData.filter(function(batch) {
    return batch['approve_status'] === 'pending';
  });
  
  return pendingBatches.map(function(b) {
    return {
      batch_id: String(b['batch_id'] || ''),
      create_datetime: b['create_datetime'] || '',
      holder_name: b['holder_name'] || '',
      total_amount: b['total_amount'] || 0,
      bill_count: (String(b['record_id_list'] || '').split(',').filter(function(i){ return i; })).length
    };
  });
}

function getBatchDetails(lineUid, batchId) {
  checkApproverAccess(lineUid);
  
  var taxData = getSheetDataAsObjects(CONFIG.SHEET_TAXDATA);
  var bills = taxData.filter(function(row) {
    return String(row['pettycash_batch_id']) === String(batchId);
  });
  
  return bills.map(function(bill) {
    return {
      record_id: bill['record_id'] || bill['Record_id'] || '',
      doc_date: bill['doc_date'] || bill['Doc_date'] || '',
      vend_name: bill['Vend_name'] || bill['vend_name'] || '',
      net: bill['Net'] || bill['net'] || 0,
      pic_bill: bill['Pic_bill'] || bill['pic_bill'] || '',
      project: bill['Project'] || bill['project'] || '',
      tax_docno: bill['Tax_docno'] || bill['tax_docno'] || '',
      remark: bill['Remark'] || bill['remark'] || ''
    };
  });
}

function approveBatchAction(lineUid, batchId) {
  var approver = checkApproverAccess(lineUid);
  // Name could be in column B (Name, or Approver_Name, etc). Let's try some common keys or just 'Name'
  var approverName = approver['Name'] || approver['name'] || approver['Approver_name'] || approver['ผู้ใช้อนุมัติ'] || 'Approver';
  
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('ระบบไม่ว่าง กรุณาลองใหม่ในภายหลัง (Lock Timeout)');
  }
  
  try {
    var batchSheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_PETTYCASH_BATCH);
    var batchRows = getSheetDataAsObjects(CONFIG.SHEET_PETTYCASH_BATCH);
    
    var batchRowData = batchRows.find(function(b) { return String(b['batch_id']) === String(batchId); });
    if (!batchRowData || batchRowData['approve_status'] !== 'pending') {
      throw new Error('Batch not found or already processed.');
    }
    
    // Get valid bills for PDF
    var validBills = getBatchDetails(lineUid, batchId);
    
    var currentDatetime = new Date();
    
    // Prepare batch data for PDF
    var batchDataForPdf = {
      batch_id: batchId,
      holder_name: batchRowData['holder_name'],
      emp_no: '', // Not strictly needed for PDF if not available, or could fetch from users_profile
      total_amount: parseFloat(batchRowData['total_amount']),
      bill_count: validBills.length,
      approve_datetime: currentDatetime
    };
    
    // Generate PDF
    var pdfUrl = buildSettlementPdf(batchDataForPdf, validBills);
    
    // Update PettyCash_Batch
    var headers = batchSheet.getRange(1, 1, 1, batchSheet.getLastColumn()).getValues()[0];
    var rowIndex = batchRowData._rowIndex;
    
    var lowerHeaders = headers.map(function(h) { return String(h).toLowerCase().trim(); });
    
    var colStatus = lowerHeaders.indexOf('approve_status') + 1;
    var colApproverName = lowerHeaders.indexOf('approver_name') + 1;
    var colApproveDatetime = lowerHeaders.indexOf('approve_datetime') + 1;
    var colPdfUrl = lowerHeaders.indexOf('pdf_url') + 1;
    var colSentEmail = lowerHeaders.indexOf('sent_email_to') + 1;
    var colSentDatetime = lowerHeaders.indexOf('sent_datetime') + 1;
    
    if (colStatus > 0) batchSheet.getRange(rowIndex, colStatus).setValue('Approved');
    if (colApproverName > 0) batchSheet.getRange(rowIndex, colApproverName).setValue(approverName);
    if (colApproveDatetime > 0) batchSheet.getRange(rowIndex, colApproveDatetime).setValue(currentDatetime);
    if (colPdfUrl > 0) batchSheet.getRange(rowIndex, colPdfUrl).setValue(pdfUrl);
    if (colSentEmail > 0) batchSheet.getRange(rowIndex, colSentEmail).setValue(CONFIG.EMAIL_ACCOUNTING);
    if (colSentDatetime > 0) batchSheet.getRange(rowIndex, colSentDatetime).setValue(currentDatetime);
    
    // Update TaxData
    var taxDataSheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_TAXDATA);
    var taxDataRows = getSheetDataAsObjects(CONFIG.SHEET_TAXDATA);
    var taxHeaders = taxDataSheet.getRange(1, 1, 1, taxDataSheet.getLastColumn()).getValues()[0];
    var lowerTaxHeaders = taxHeaders.map(function(h) { return String(h).toLowerCase().trim(); });
    
    var taxStatusColIdx = lowerTaxHeaders.indexOf('status') + 1;
    var taxApproveUserIdColIdx = lowerTaxHeaders.indexOf('approve_userid') + 1;
    var taxApproveDatetimeColIdx = lowerTaxHeaders.indexOf('approve_datetime') + 1;
    
    var taxBillsToUpdate = taxDataRows.filter(function(row) {
      return String(row['pettycash_batch_id']) === String(batchId);
    });
    
    taxBillsToUpdate.forEach(function(billRow) {
      var rIdx = billRow._rowIndex;
      if (taxStatusColIdx > 0) taxDataSheet.getRange(rIdx, taxStatusColIdx).setValue('Approved');
      if (taxApproveUserIdColIdx > 0) taxDataSheet.getRange(rIdx, taxApproveUserIdColIdx).setValue(lineUid);
      if (taxApproveDatetimeColIdx > 0) taxDataSheet.getRange(rIdx, taxApproveDatetimeColIdx).setValue(currentDatetime);
    });
    
    // Send Email
    sendAccountingEmail(batchRowData['holder_name'], parseFloat(batchRowData['total_amount']), validBills.length, pdfUrl);
    
    return { success: true, message: 'Approved successfully', pdf_url: pdfUrl };
  } finally {
    lock.releaseLock();
  }
}

function rejectBatchAction(lineUid, batchId) {
  checkApproverAccess(lineUid);
  
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('ระบบไม่ว่าง กรุณาลองใหม่ในภายหลัง (Lock Timeout)');
  }
  
  try {
    var batchSheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_PETTYCASH_BATCH);
    var batchRows = getSheetDataAsObjects(CONFIG.SHEET_PETTYCASH_BATCH);
    
    var batchRowData = batchRows.find(function(b) { return String(b['batch_id']) === String(batchId); });
    if (!batchRowData || batchRowData['approve_status'] !== 'pending') {
      throw new Error('Batch not found or already processed.');
    }
    
    // Update PettyCash_Batch status to Rejected
    var batchHeaders = batchSheet.getRange(1, 1, 1, batchSheet.getLastColumn()).getValues()[0];
    var lowerBatchHeaders = batchHeaders.map(function(h) { return String(h).toLowerCase().trim(); });
    var batchStatusCol = lowerBatchHeaders.indexOf('approve_status') + 1;
    if (batchStatusCol > 0) batchSheet.getRange(batchRowData._rowIndex, batchStatusCol).setValue('Rejected');
    
    // Revert bills in TaxData back to pending
    var taxDataSheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_TAXDATA);
    var taxDataRows = getSheetDataAsObjects(CONFIG.SHEET_TAXDATA);
    var taxHeaders = taxDataSheet.getRange(1, 1, 1, taxDataSheet.getLastColumn()).getValues()[0];
    var lowerTaxHeaders = taxHeaders.map(function(h) { return String(h).toLowerCase().trim(); });
    
    var statusColIdx = lowerTaxHeaders.indexOf('status') + 1;
    var batchIdColIdx = lowerTaxHeaders.indexOf('pettycash_batch_id') + 1;
    var approveUserIdColIdx = lowerTaxHeaders.indexOf('approve_userid') + 1;
    var approveDatetimeColIdx = lowerTaxHeaders.indexOf('approve_datetime') + 1;
    
    var validBills = taxDataRows.filter(function(row) {
      return String(row['pettycash_batch_id']) === String(batchId);
    });
    
    validBills.forEach(function(billRow) {
      var rowIndex = billRow._rowIndex;
      if (statusColIdx > 0) taxDataSheet.getRange(rowIndex, statusColIdx).setValue('pending');
      if (batchIdColIdx > 0) taxDataSheet.getRange(rowIndex, batchIdColIdx).setValue('');
      if (approveUserIdColIdx > 0) taxDataSheet.getRange(rowIndex, approveUserIdColIdx).setValue('');
      if (approveDatetimeColIdx > 0) taxDataSheet.getRange(rowIndex, approveDatetimeColIdx).setValue('');
    });
    
    return { success: true, message: 'Rejected successfully' };
  } finally {
    lock.releaseLock();
  }
}
