import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./config.js";

export const isConfigured = !String(firebaseConfig.apiKey).startsWith("YOUR_");

export const app = isConfigured ? initializeApp(firebaseConfig) : null;

// เก็บข้อมูลไว้ในเครื่อง ลดจำนวนการอ่านจากฐานข้อมูล (โควตาฟรี 50,000 ครั้ง/วัน)
function makeDb() {
  try {
    return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    return initializeFirestore(app, { localCache: memoryLocalCache() });
  }
}
export const db = app ? makeDb() : null;
export const auth = app ? getAuth(app) : null;

export * from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
