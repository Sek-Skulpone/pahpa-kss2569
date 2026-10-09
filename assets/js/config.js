// ============================================================
//  ตั้งค่าระบบ — แก้ไขไฟล์นี้ก่อนใช้งาน (ดูขั้นตอนใน README.md)
// ============================================================

// 1) ค่าจาก Firebase Console > Project settings > Your apps > Web app
export const firebaseConfig = {
  apiKey: "AIzaSyCKwgrBYMOVFRMKJaE3sXR6_TqGElWBblo",
  authDomain: "pahpa-kss2569.firebaseapp.com",
  projectId: "pahpa-kss2569",
  storageBucket: "pahpa-kss2569.firebasestorage.app",
  messagingSenderId: "648298518551",
  appId: "1:648298518551:web:d36ee2710e77acb025a452",
};

// 2) URL ของ Google Apps Script (Web app) สำหรับส่งแจ้งเตือนเข้า LINE
//    เว้นว่างไว้ได้ ถ้ายังไม่ใช้การแจ้งเตือน
export const LINE_NOTIFY_URL = "";
// ต้องตรงกับ SHARED_KEY ใน line/Code.gs
export const LINE_NOTIFY_KEY = "change-me-kss2569";

// QR รับเงินของแต่ละระบบ (ถ้ามี QR แยกบัญชี ให้วางรูปใน assets/img แล้วแก้ชื่อไฟล์ตรงนี้)
export const PAYMENT_QR = {
  shirt: "assets/img/qr-payment.jpg",
  ticket: "assets/img/qr-payment.jpg",
  donation: "assets/img/qr-payment.jpg",
};

// 3) ค่าเริ่มต้น (แอดมินแก้ไขได้ภายหลังที่หน้า admin > ตั้งค่า โดยไม่ต้องแก้โค้ด)
export const DEFAULT_SETTINGS = {
  eventTitle: "ผ้าป่าเพื่อการศึกษา",
  eventSubtitle: "ครบรอบ 48 ปี ลูกศิษย์หลวงปู่จันดี โคกสีวิทยาสรรค์",
  eventDate: "วันศุกร์ที่ 25 ธันวาคม 2569",
  eventPurpose: "สมทบค่างวดรถรับส่งนักเรียน",
  schoolName: "โรงเรียนโคกสีวิทยาสรรค์",

  shirtPrice: 300,
  shirtShipping: 0,        // ค่าส่งไปรษณีย์ต่อออเดอร์เสื้อ (บาท)
  ticketPrice: 100,        // บัตรรำวงใบละ
  ticketBookPrice: 1000,   // บัตรรำวงเล่มละ
  ticketBookSize: 10,      // จำนวนบัตรต่อเล่ม
  ticketShipping: 0,       // ค่าส่งไปรษณีย์ต่อออเดอร์บัตร (บาท)

  openShirt: true,
  openTicket: true,
  openDonate: true,

  contactShirt: "ครูนิโลบล คำลือชัย",
  contactShirtPhone: "0933249264",
  contactTicket: "ครูเพชรรัตน์ ประสานเชื้อ",
  contactTicketPhone: "0844059871",
  contactInfo: "ผอ.สราวุธ วิเชียรลม",
  contactInfoPhone: "0635419232",
};

export const SHIRT_SIZES = [
  { size: "24", chest: 24, length: 17 },
  { size: "26", chest: 26, length: 18 },
  { size: "28", chest: 28, length: 19 },
  { size: "30", chest: 30, length: 20 },
  { size: "32", chest: 32, length: 21 },
  { size: "34", chest: 34, length: 22 },
  { size: "XS", chest: 34, length: 25 },
  { size: "S", chest: 36, length: 26 },
  { size: "M", chest: 38, length: 27 },
  { size: "L", chest: 40, length: 28 },
  { size: "XL", chest: 42, length: 29 },
  { size: "2XL", chest: 44, length: 30 },
  { size: "3XL", chest: 46, length: 31 },
  { size: "4XL", chest: 48, length: 32 },
  { size: "5XL", chest: 50, length: 33 },
  { size: "6XL", chest: 52, length: 34 },
  { size: "7XL", chest: 54, length: 35 },
  { size: "8XL", chest: 56, length: 36 },
];

export const NAME_PREFIXES = ["นาย", "นาง", "นางสาว", "ด.ช.", "ด.ญ.", "ครู", "ผอ.", "ดร.", "พระ", "อื่นๆ"];
