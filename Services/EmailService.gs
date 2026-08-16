function sendAccountingEmail(holderName, totalAmount, billCount, pdfUrl) {
  var recipient = CONFIG.EMAIL_ACCOUNTING;
  var subject = "ขออนุมัติเติมวงเงินสดย่อย - " + holderName + " - " + totalAmount.toFixed(2) + " บาท";
  
  var body = [
    "เรียน แผนกบัญชี,",
    "",
    "มีการสร้างรายการขอสรุปวงเงินสดย่อยใหม่ รายละเอียดดังนี้:",
    "- ผู้ขอเบิก: " + holderName,
    "- จำนวนบิล: " + billCount + " รายการ",
    "- ยอดรวมทั้งสิ้น: " + totalAmount.toFixed(2) + " บาท",
    "",
    "สามารถตรวจสอบรายละเอียดและเอกสารแนบได้ที่ลิงก์ด้านล่าง:",
    pdfUrl,
    "",
    "รายการนี้ได้ถูกบันทึกและอนุมัติในระบบเรียบร้อยแล้ว",
    "",
    "ระบบ SmartBill PettyCash"
  ].join("\n");
  
  MailApp.sendEmail({
    to: recipient,
    subject: subject,
    body: body
  });
}
