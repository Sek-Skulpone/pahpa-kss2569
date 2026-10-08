import { db, isConfigured, doc, getDoc, writeBatch, serverTimestamp } from "./firebase.js?v=12";
import { DEFAULT_SETTINGS, LINE_NOTIFY_URL, LINE_NOTIFY_KEY } from "./config.js?v=12";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const baht = (n) => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const TYPE_LABEL = { shirt: "สั่งจองเสื้อ", ticket: "จองบัตรรำวง", donation: "ร่วมทำบุญ" };
export const STATUS_LABEL = { pending: "รอตรวจสอบ", verified: "ชำระแล้ว", delivered: "ส่งมอบแล้ว", rejected: "ไม่ผ่าน" };
export const DELIVERY_LABEL = { school: "รับที่ รร. โคกสีวิทยาสรรค์", post: "จัดส่งทางไปรษณีย์" };

// ---------- settings ----------
export async function loadSettings() {
  fillEventText(DEFAULT_SETTINGS); // แสดงค่าเริ่มต้นทันที ไม่ต้องรอฐานข้อมูล
  if (!isConfigured) return { ...DEFAULT_SETTINGS };
  try {
    const snap = await Promise.race([
      getDoc(doc(db, "settings", "public")),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 6000)),
    ]);
    return { ...DEFAULT_SETTINGS, ...(snap.exists() ? snap.data() : {}) };
  } catch (e) {
    console.warn("loadSettings", e);
    return { ...DEFAULT_SETTINGS };
  }
}

export function fillEventText(s) {
  $$("[data-s]").forEach((el) => {
    const v = s[el.dataset.s];
    if (v !== undefined && v !== "") el.textContent = typeof v === "number" ? baht(v) : v;
  });
  $$("[data-tel]").forEach((el) => {
    const phone = s[el.dataset.tel];
    if (phone) {
      el.href = "tel:" + phone.replace(/[^\d+]/g, "");
      el.textContent = phone;
      el.hidden = false;
    } else el.hidden = true;
  });
}

export function setupBanner() {
  if (isConfigured) return;
  const b = document.createElement("div");
  b.className = "setup-banner";
  b.innerHTML = "⚠️ ยังไม่ได้ตั้งค่า Firebase — แก้ไฟล์ <code>assets/js/config.js</code> ตาม README.md (ตอนนี้ระบบยังบันทึกข้อมูลไม่ได้)";
  document.body.prepend(b);
}

// ---------- images ----------
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("อ่านไฟล์รูปไม่ได้"));
    img.src = url;
  });
}

/** ย่อรูปให้เล็กพอเก็บใน Firestore (คืนค่า data URL) */
export async function compressImage(file, { maxDim = 1000, maxBytes = 300_000 } = {}) {
  const img = await loadImage(file);
  let dim = maxDim;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, dim / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.7, 0.6, 0.5]) {
      const url = c.toDataURL("image/jpeg", q);
      if (url.length <= maxBytes) return url;
    }
    dim = Math.round(dim * 0.8);
  }
  throw new Error("รูปมีขนาดใหญ่เกินไป");
}

// ---------- slip QR ----------
function parseTLV(str) {
  const out = {};
  let i = 0;
  while (i + 4 <= str.length) {
    const id = str.slice(i, i + 2);
    const len = parseInt(str.slice(i + 2, i + 4), 10);
    if (Number.isNaN(len)) break;
    out[id] = str.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

/** อ่าน QR บนสลิปธนาคาร เพื่อดึงเลขอ้างอิงรายการ (ใช้กันสลิปซ้ำ) */
export async function readSlipQR(file) {
  if (!window.jsQR) return null;
  try {
    const img = await loadImage(file);
    for (const maxDim of [1400, 900, 2000]) {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const code = window.jsQR(data.data, c.width, c.height, { inversionAttempts: "attemptBoth" });
      if (code?.data) {
        const raw = code.data.trim();
        let ref = "";
        try {
          const top = parseTLV(raw);
          if (top["00"]) ref = parseTLV(top["00"])["02"] || "";
        } catch {}
        return { raw: raw.slice(0, 300), ref: (ref || raw).replace(/[^A-Za-z0-9]/g, "").slice(0, 80) };
      }
    }
  } catch (e) {
    console.warn("readSlipQR", e);
  }
  return null;
}

// ---------- orders ----------
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function genCode(prefix) {
  let s = "";
  const rnd = crypto.getRandomValues(new Uint32Array(6));
  for (const r of rnd) s += CODE_CHARS[r % CODE_CHARS.length];
  return `${prefix}-${s}`;
}

export class DuplicateSlipError extends Error {}

/**
 * บันทึกรายการ + ไฟล์รูป ลง Firestore ในครั้งเดียว
 * order: ข้อมูลรายการ, files: { slip, photo } (data URL), slip: ผลจาก readSlipQR
 */
export async function submitOrder(order, files, slip) {
  if (!isConfigured) throw new Error("ยังไม่ได้ตั้งค่า Firebase");
  const id = order.code;
  if (slip?.ref) {
    const dup = await getDoc(doc(db, "slipRefs", slip.ref));
    if (dup.exists()) throw new DuplicateSlipError("สลิปนี้เคยถูกใช้ส่งรายการแล้ว (" + dup.data().orderId + ")");
  }
  const batch = writeBatch(db);
  batch.set(doc(db, "orders", id), {
    ...order,
    status: "pending",
    slipRef: slip?.ref || "",
    slipRaw: slip?.raw || "",
    hasPhoto: !!files.photo,
    createdAt: serverTimestamp(),
  });
  if (files.slip || files.photo) {
    const f = { createdAt: serverTimestamp() };
    if (files.slip) f.slip = files.slip;
    if (files.photo) f.photo = files.photo;
    batch.set(doc(db, "orderFiles", id), f);
  }
  if (slip?.ref) batch.set(doc(db, "slipRefs", slip.ref), { orderId: id, createdAt: serverTimestamp() });
  await batch.commit();
  notifyLine(order).catch(() => {});
  return id;
}

export function orderSummaryText(o) {
  const lines = [];
  if (o.type === "shirt") {
    lines.push(Object.entries(o.items).map(([s, q]) => `${s}×${q}`).join(", ") + ` (รวม ${o.qty} ตัว)`);
  } else if (o.type === "ticket") {
    const parts = [];
    if (o.singles) parts.push(`บัตรใบ ${o.singles} ใบ`);
    if (o.books) parts.push(`บัตรเล่ม ${o.books} เล่ม`);
    lines.push(parts.join(" + ") + ` (รวม ${o.ticketCount} ใบ)`);
  }
  return lines.join("\n");
}

export async function notifyLine(o) {
  if (!LINE_NOTIFY_URL) return;
  const msg = [
    `🔔 ${TYPE_LABEL[o.type]} ใหม่`,
    `รหัส: ${o.code}`,
    `ชื่อ: ${o.fullName}`,
    o.phone ? `โทร: ${o.phone}` : "",
    orderSummaryText(o),
    o.delivery ? `รับ: ${DELIVERY_LABEL[o.delivery]}` : "",
    `ยอดเงิน: ${baht(o.total)} บาท${o.hasSlip === false ? " (ไม่แนบสลิป)" : ""}`,
    `ตรวจสอบ: ${location.origin}${location.pathname.replace(/[^/]*$/, "")}staff-49aacfdc.html`,
  ].filter(Boolean).join("\n");
  await fetch(LINE_NOTIFY_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ kind: "order", key: LINE_NOTIFY_KEY, code: o.code, message: msg }),
  });
}

// ---------- UI helpers ----------
export function toast(text, type = "") {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.append(t);
  }
  t.className = "toast show " + type;
  t.textContent = text;
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.className = "toast"), 3500);
}

export function setupFilePreview(input, preview, onChange) {
  input.addEventListener("change", async () => {
    const file = input.files[0];
    preview.innerHTML = "";
    if (!file) return onChange?.(null);
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    preview.append(img);
    onChange?.(file);
  });
}

/** สร้างส่วน "ชำระเงิน" (ปุ่มจ่ายผ่านแอป + QR สำหรับสแกน) */
export function paymentBlockHtml(qrSrc) {
  return `
    <div class="qr-box">
      <div class="pay-amount">ยอดที่ต้องชำระ <strong class="js-total">0</strong> บาท</div>
      <button type="button" class="btn btn-gold btn-block btn-lg" id="btn-payapp">📱 จ่ายผ่านแอปธนาคาร</button>
      <p class="hint" style="margin:6px 0 14px">ระบบจะบันทึกรูป QR และคัดลอกยอดเงินให้ แล้วเปิดแอปธนาคาร<br>จ่ายเสร็จแล้วกลับมาหน้านี้เพื่อยืนยัน</p>
      <div class="or-line"><span>หรือสแกน QR นี้</span></div>
      <img src="${qrSrc}" alt="QR พร้อมเพย์ สำหรับโอนเงิน" class="qr-img" id="qr-img">
      <a class="btn btn-outline btn-sm" href="${qrSrc}" download="QR-ผ้าป่า-kss2569.jpg">⬇️ บันทึกรูป QR</a>
    </div>`;
}

export function showSuccess(container, { code, title, total, extraHtml = "" }) {
  container.innerHTML = `
    <div class="card success">
      <div class="success-icon">✅</div>
      <h2>สำเร็จแล้ว!</h2>
      <p style="font-size:1.1rem;margin:0 0 6px"><strong>${escapeHtml(title)}</strong></p>
      <p>ระบบบันทึกรายการของท่านเรียบร้อยแล้ว 🙏</p>
      <div class="code-box">รหัสรายการ<br><strong>${escapeHtml(code)}</strong></div>
      <p>ยอดเงิน <strong>${baht(total)}</strong> บาท</p>
      ${extraHtml}
      <p class="hint">กรุณาแคปหน้าจอนี้เก็บไว้เป็นหลักฐาน</p>
      <a href="index.html" class="btn btn-primary">กลับหน้าหลัก</a>
    </div>`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
