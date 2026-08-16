function doGet(e) {
  var template = HtmlService.createTemplateFromFile('settlement');
  template.LIFF_ID = CONFIG.LIFF_ID;
  return template.evaluate()
    .setTitle('Petty Cash Settlement')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  var response = { success: false, message: 'Unknown action' };
  
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    
    if (action === 'getMyPendingBills') {
      response.data = getMyPendingBills(payload.lineUid);
      response.success = true;
      response.message = 'Success';
    } 
    else if (action === 'createBatch') {
      response.data = createBatch(payload.lineUid, payload.recordIdList);
      response.success = true;
      response.message = 'Success';
    }
  } catch (error) {
    Logger.log('Error in doPost: ' + error.message);
    response.success = false;
    response.message = error.message;
  }
  
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function serverGetMyPendingBills(lineUid) {
  try {
    var data = getMyPendingBills(lineUid);
    return JSON.stringify({ success: true, data: data });
  } catch (error) {
    Logger.log('Error in serverGetMyPendingBills: ' + error.message);
    return JSON.stringify({ success: false, message: error.message });
  }
}

function serverCreateBatch(lineUid, recordIdList) {
  try {
    var data = createBatch(lineUid, recordIdList);
    return JSON.stringify({ success: true, data: data });
  } catch (error) {
    Logger.log('Error in serverCreateBatch: ' + error.message);
    return JSON.stringify({ success: false, message: error.message });
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
