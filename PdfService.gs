function buildSettlementPdf(batchData, validBills) {
  var templateId = CONFIG.GOOGLE_DOC_TEMPLATE_ID;
  var folderId = CONFIG.DRIVE_FOLDER_ID_SETTLEMENT_PDF;
  
  var templateFile = DriveApp.getFileById(templateId);
  var targetFolder = DriveApp.getFolderById(folderId);
  var docName = 'PettyCash_' + batchData.batch_id.replace("'", "") + '_' + batchData.holder_name;
  
  var tempDocFile = templateFile.makeCopy(docName, targetFolder);
  var doc = DocumentApp.openById(tempDocFile.getId());
  var body = doc.getBody();
  
  // Replace Text Placeholders
  var createDateStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm");
  
  body.replaceText('{{holder_name}}', batchData.holder_name);
  body.replaceText('{{emp_no}}', batchData.emp_no);
  body.replaceText('{{batch_id}}', batchData.batch_id.replace("'", ""));
  body.replaceText('{{create_date}}', createDateStr);
  body.replaceText('{{total_amount}}', batchData.total_amount.toFixed(2));
  body.replaceText('{{bill_count}}', batchData.bill_count.toString());
  
  // Create Table Rows
  var tables = body.getTables();
  var tableWithPlaceholder = null;
  var rowIndex = -1;
  
  for (var i = 0; i < tables.length; i++) {
    var tbl = tables[i];
    for (var r = 0; r < tbl.getNumRows(); r++) {
      var row = tbl.getRow(r);
      if (row.getText().indexOf('{{bill_table_row}}') !== -1) {
        tableWithPlaceholder = tbl;
        rowIndex = r;
        break;
      }
    }
    if (tableWithPlaceholder) break;
  }
  
  if (tableWithPlaceholder) {
    // Remove the placeholder row
    tableWithPlaceholder.removeRow(rowIndex);
    
    // Insert actual data rows
    var insertIdx = rowIndex;
    validBills.forEach(function(bill) {
      var dateStr = "";
      if (bill.doc_date) {
        try {
          dateStr = Utilities.formatDate(new Date(bill.doc_date), "Asia/Bangkok", "dd/MM/yyyy");
        } catch (e) {
          dateStr = bill.doc_date;
        }
      }
      var newRow = tableWithPlaceholder.insertTableRow(insertIdx);
      newRow.appendTableCell(dateStr);
      newRow.appendTableCell(bill.tax_docno ? bill.tax_docno.toString() : '');
      newRow.appendTableCell(bill.vend_name ? bill.vend_name.toString() : '');
      newRow.appendTableCell(parseFloat(bill.net).toFixed(2));
      newRow.appendTableCell(bill.project ? bill.project.toString() : '');
      insertIdx++;
    });
  } else {
    // Fallback if {{bill_table_row}} is not inside a table, just append a new table
    body.replaceText('{{bill_table_row}}', ''); // Clear placeholder if any
    var cells = [['Date', 'Doc No', 'Vendor', 'Amount', 'Project']];
    validBills.forEach(function(bill) {
      cells.push([
        String(bill.doc_date || ''), 
        String(bill.tax_docno || ''), 
        String(bill.vend_name || ''), 
        parseFloat(bill.net).toFixed(2), 
        String(bill.project || '')
      ]);
    });
    body.appendTable(cells);
  }
  
  // Append Images
  body.appendPageBreak();
  body.appendParagraph("เอกสารประกอบ (รูปบิล)");
  
  validBills.forEach(function(bill) {
    if (bill.pic_bill) {
      try {
        var blob = getBlobFromUrlOrDrive(bill.pic_bill);
        if (blob) {
          var para = body.appendParagraph("");
          var img = para.appendInlineImage(blob);
          
          // Resize image to fit page width (A4 width is ~595 points, margins ~72*2, so usable width is ~450)
          var maxWidth = 450;
          var width = img.getWidth();
          var height = img.getHeight();
          if (width > maxWidth) {
            var ratio = maxWidth / width;
            img.setWidth(maxWidth);
            img.setHeight(height * ratio);
          }
          
          body.appendParagraph("อ้างอิง: " + (bill.vend_name || 'ไม่ระบุ') + " - " + parseFloat(bill.net).toFixed(2) + " บาท");
        }
      } catch (e) {
        Logger.log("Failed to insert image for bill " + bill.record_id + ": " + e.message);
        body.appendParagraph("ไม่สามารถโหลดรูปบิลได้: " + bill.pic_bill);
      }
    }
  });
  
  doc.saveAndClose();
  
  // Convert to PDF
  var pdfBlob = tempDocFile.getAs('application/pdf');
  var finalPdf = targetFolder.createFile(pdfBlob);
  finalPdf.setName(docName + '.pdf');
  
  // Set permissions to anyone with the link
  finalPdf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  // Delete the temp doc
  tempDocFile.setTrashed(true);
  
  return finalPdf.getUrl();
}

function getBlobFromUrlOrDrive(url) {
  if (!url) return null;
  // If it's a drive view/uc?id= link
  var match = url.match(/id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    var fileId = match[1];
    return DriveApp.getFileById(fileId).getBlob();
  } else if (url.indexOf('drive.google.com/file/d/') !== -1) {
    var match2 = url.match(/d\/([a-zA-Z0-9_-]+)/);
    if (match2 && match2[1]) {
      return DriveApp.getFileById(match2[1]).getBlob();
    }
  }
  
  // Standard fetch
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() === 200) {
    return response.getBlob();
  }
  return null;
}
