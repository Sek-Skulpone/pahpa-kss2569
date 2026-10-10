import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js?v=18";

export const isConfigured = !String(firebaseConfig.apiKey).startsWith("YOUR_");

// หน้าแอดมิน: เก็บข้อมูลไว้ในเครื่อง ลดการอ่านฐานข้อมูล (โควตาฟรี 50,000 ครั้ง/วัน)
// หน้าสาธารณะ: ไม่ใช้ที่เก็บในเครื่องเลย เพื่อให้โหลดได้เสมอ
const isAdminPage = /staff-/.test(location.pathname);
// โหมดสำรอง: ปิดที่เก็บข้อมูลในเครื่อง (ใช้เมื่อเบราว์เซอร์ค้าง)
export const noCache = (() => { try { return localStorage.getItem("noCache") === "1"; } catch { return true; } })();
if ((noCache || !isAdminPage) && self.indexedDB) {
  // ปิด IndexedDB สำหรับ Firebase ทั้งหมด (Firebase จะใช้หน่วยความจำแทนโดยอัตโนมัติ)
  try { self.indexedDB.open = () => { throw new Error("IndexedDB disabled (fallback mode)"); }; } catch {}
}
export const app = isConfigured ? initializeApp(firebaseConfig) : null;

function makeDb() {
  if (!isAdminPage || noCache) return initializeFirestore(app, { localCache: memoryLocalCache() });
  try {
    return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    return initializeFirestore(app, { localCache: memoryLocalCache() });
  }
}
export const db = app ? makeDb() : null;

export * from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
