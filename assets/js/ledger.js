// บัญชีรายนามผู้ร่วมทำบุญ (สำหรับคัดลอกลงสมุดบัญชี)
import { db, doc, updateDoc, setDoc, writeBatch, serverTimestamp } from "./firebase.js?v=11";
import { $, $$, baht, escapeHtml, genCode, toast, STATUS_LABEL } from "./common.js?v=11";
import { NAME_PREFIXES } from "./config.js?v=11";

const opt = { scope: "paid", notInBook: false, q: "" };
let ctx = null;

// ---------- จำนวนเงินเป็นตัวอักษร ----------
const DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const UNITS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];
function readInt(str) {
  str = str.replace(/^0+/, "");
  if (!str) return "";
  if (str.length > 6) {
    const hi = str.slice(0, -6);
    const lo = str.slice(-6);
    const loText = readInt(lo);
    return readInt(hi) + "ล้าน" + (loText.startsWith("หนึ่ง") && lo.replace(/^0+/, "").length === 1 ? "เอ็ด" : loText);
  }
  let out = "";
  const len = str.length;
  for (let i = 0; i < len; i++) {
    const d = +str[i];
    const p = len - i - 1;
    if (!d) continue;
    if (p === 1 && d === 1) out += "สิบ";
    else if (p === 1 && d === 2) out += "ยี่สิบ";
    else if (p === 0 && d === 1 && len > 1) out += "เอ็ด";
    else out += DIGITS[d] + UNITS[p];
  }
  return out;
}
export function bahtText(n) {
  n = Math.round(Number(n || 0) * 100) / 100;
  const [i, s = "0"] = n.toFixed(2).split(".");
  const intText = readInt(i) || (s === "00" ? "ศูนย์" : "");
  const sat = readInt(s);
  return (intText ? intText + "บาท" : "") + (sat ? sat + "สตางค์" : "ถ้วน");
}

// ---------- ข้อมูล ----------
const fmtDate = (ts) => (ts?.toDate ? ts.toDate().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—");
const channel = (o) => (o.source === "manual" ? o.payMethod || "เงินสด" : "ออนไลน์");
const subtitle = (o) => [o.position, o.workplace].filter(Boolean).join(" / ");

function rows() {
  const q = opt.q.trim().toLowerCase();
  return ctx.orders
    .filter((o) => o.type === "donation" && o.status !== "rejected")
    .filter((o) => (opt.scope === "paid" ? ctx.isPaid(o) : true))
    .filter((o) => (opt.notInBook ? !o.inBook : true))
    .filter((o) => !q || [o.fullName, o.position, o.workplace, o.code, o.phone].join(" ").toLowerCase().includes(q))
    .sort((a, b) => (a.createdAt?.toMillis?.() ?? 9e15) - (b.createdAt?.toMillis?.() ?? 9e15));
}

// ---------- UI ----------
export function renderLedger(box, context) {
  ctx = context;
  if (!box.dataset.ready) {
    box.dataset.ready = "1";
    box.innerHTML = `
      <div class="toolbar">
        <input id="lg-q" type="search" placeholder="ค้นหาชื่อ / หน่วยงาน / เบอร์โทร">
        <select id="lg-scope">
          <option value="paid">เฉพาะที่ตรวจสลิปแล้ว</option>
          <option value="all">ทั้งหมด (รวมรอตรวจ)</option>
        </select>
        <label class="switch" style="margin:0"><input type="checkbox" id="lg-notbook"> ยังไม่ลงสมุด</label>
      </div>
      <div class="toolbar" style="margin-top:0">
        <button class="btn btn-sm btn-primary" id="lg-add">➕ เพิ่มรายการ (เงินสด/หน้างาน)</button>
        <button class="btn btn-sm btn-outline" id="lg-print">🖨️ พิมพ์</button>
        <button class="btn btn-sm btn-outline" id="lg-csv">⬇️ Excel (CSV)</button>
        <button class="btn btn-sm btn-outline" id="lg-markall">✓ ลงสมุดแล้วทั้งหมดที่แสดง</button>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <div class="ledger-wrap"><table class="ledger" id="lg-table"></table></div>
      </div>
      <div class="card ledger-sum" id="lg-sum"></div>`;
    $("#lg-q").oninput = (e) => { opt.q = e.target.value; draw(); };
    $("#lg-scope").onchange = (e) => { opt.scope = e.target.value; draw(); };
    $("#lg-notbook").onchange = (e) => { opt.notInBook = e.target.checked; draw(); };
    $("#lg-add").onclick = openAddForm;
    $("#lg-print").onclick = printLedger;
    $("#lg-csv").onclick = exportCsv;
    $("#lg-markall").onclick = markAll;
  }
  draw();
}

function draw() {
  const list = rows();
  let running = 0;
  const body = list.map((o, i) => {
    const amt = Number(o.amount ?? o.total) || 0;
    running += amt;
    return `<tr class="${o.inBook ? "done" : ""}">
      <td class="c">${i + 1}</td>
      <td class="nowrap">${fmtDate(o.createdAt)}</td>
      <td><div class="nm">${escapeHtml(o.fullName)}</div>${subtitle(o) ? `<div class="sub">${escapeHtml(subtitle(o))}</div>` : ""}
        ${o.phone ? `<div class="sub">📞 <a href="tel:${escapeHtml(o.phone)}">${escapeHtml(o.phone)}</a></div>` : ""}
        ${o.status === "pending" ? '<span class="chip pending">รอตรวจ</span>' : ""}</td>
      <td class="r">${baht(amt)}</td>
      <td class="r muted">${baht(running)}</td>
      <td class="c muted small">${escapeHtml(channel(o))}</td>
      <td class="c"><input type="checkbox" class="inbook" data-id="${o.id}" ${o.inBook ? "checked" : ""} aria-label="ลงสมุดแล้ว"></td>
    </tr>`;
  }).join("");
  $("#lg-table").innerHTML = `
    <thead><tr><th class="c">ที่</th><th>วันที่</th><th>ชื่อ - สกุล / หน่วยงาน / โทร</th><th class="r">จำนวนเงิน</th><th class="r">ยอดสะสม</th><th class="c">ช่องทาง</th><th class="c">ลงสมุด</th></tr></thead>
    <tbody>${body || `<tr><td colspan="7" class="c muted" style="padding:24px">ยังไม่มีรายการ</td></tr>`}</tbody>`;
  $$(".inbook", $("#lg-table")).forEach((cb) => (cb.onchange = () => {
    updateDoc(doc(db, "orders", cb.dataset.id), { inBook: cb.checked }).catch((e) => toast("บันทึกไม่สำเร็จ: " + e.message, "err"));
  }));
  const inBook = list.filter((o) => o.inBook).length;
  $("#lg-sum").innerHTML = `
    <div class="ledger-total"><span>รวม ${list.length.toLocaleString("th-TH")} ราย</span><strong>${baht(running)} บาท</strong></div>
    <div class="muted">(${bahtText(running)})</div>
    <div class="muted small" style="margin-top:6px">ลงสมุดแล้ว ${inBook} / ${list.length} รายการ</div>`;
}

async function markAll() {
  const list = rows().filter((o) => !o.inBook);
  if (!list.length) return toast("ทุกรายการที่แสดงลงสมุดแล้ว");
  if (!confirm(`ทำเครื่องหมาย "ลงสมุดแล้ว" ${list.length} รายการ?`)) return;
  try {
    for (let i = 0; i < list.length; i += 400) {
      const b = writeBatch(db);
      list.slice(i, i + 400).forEach((o) => b.update(doc(db, "orders", o.id), { inBook: true }));
      await b.commit();
    }
    toast("บันทึกแล้ว", "ok");
  } catch (e) {
    toast("ไม่สำเร็จ: " + e.message, "err");
  }
}

function exportCsv() {
  const list = rows();
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  let running = 0;
  const lines = [["ที่", "วันที่", "รหัส", "คำนำหน้า", "ชื่อ", "สกุล", "ตำแหน่ง", "หน่วยงาน", "โทร", "จำนวนเงิน", "ยอดสะสม", "ช่องทาง", "สถานะ", "ลงสมุด", "หมายเหตุ"].map(esc).join(",")];
  list.forEach((o, i) => {
    const amt = Number(o.amount ?? o.total) || 0;
    running += amt;
    lines.push([i + 1, fmtDate(o.createdAt), o.code, o.prefix, o.firstName || o.fullName, o.lastName, o.position, o.workplace, o.phone, amt, running,
      channel(o), STATUS_LABEL[o.status], o.inBook ? "✓" : "", o.note].map(esc).join(","));
  });
  lines.push(["", "", "", "", "รวม", "", "", "", "", running, "", bahtText(running)].map(esc).join(","));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  a.download = `บัญชีรายนามผู้ร่วมทำบุญ-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function printLedger() {
  const s = ctx.settings;
  const list = rows();
  let running = 0;
  const trs = list.map((o, i) => {
    const amt = Number(o.amount ?? o.total) || 0;
    running += amt;
    return `<tr><td class="c">${i + 1}</td><td>${fmtDate(o.createdAt)}</td><td>${escapeHtml(o.fullName)}</td>
      <td>${escapeHtml(subtitle(o))}</td><td class="nowrap">${escapeHtml(o.phone || "")}</td><td class="r">${baht(amt)}</td><td class="c">${escapeHtml(channel(o))}</td></tr>`;
  }).join("");
  const w = window.open("", "_blank");
  if (!w) return toast("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต pop-up", "err");
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>บัญชีรายนามผู้ร่วมทำบุญ</title>
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
    <style>
      body{font-family:Sarabun,sans-serif;font-size:14px;margin:24px;color:#000}
      h1{font-size:20px;text-align:center;margin:0}
      .sub{text-align:center;margin:4px 0 16px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #555;padding:5px 6px;vertical-align:top}
      th{background:#eee}
      .c{text-align:center}.r{text-align:right;white-space:nowrap}.nowrap{white-space:nowrap}
      tfoot td{font-weight:700}
      @page{size:A4;margin:14mm}
    </style></head><body>
    <h1>บัญชีรายนามผู้ร่วมทำบุญ ${escapeHtml(s.eventTitle || "")}</h1>
    <div class="sub">${escapeHtml(s.eventSubtitle || "")}<br>${escapeHtml(s.eventDate || "")} · ${escapeHtml(s.schoolName || "")}</div>
    <table><thead><tr><th>ที่</th><th>วันที่</th><th>ชื่อ - สกุล</th><th>ตำแหน่ง / หน่วยงาน</th><th>โทร</th><th>จำนวนเงิน (บาท)</th><th>ช่องทาง</th></tr></thead>
    <tbody>${trs}</tbody>
    <tfoot><tr><td colspan="5" class="r">รวม ${list.length} ราย (${bahtText(running)})</td><td class="r">${baht(running)}</td><td></td></tr></tfoot></table>
    <p style="margin-top:12px;font-size:12px">พิมพ์เมื่อ ${new Date().toLocaleString("th-TH")}</p>
    <script>document.fonts.ready.then(()=>setTimeout(()=>print(),300))<\/script></body></html>`);
  w.document.close();
}

// ---------- เพิ่มรายการเงินสด / หน้างาน ----------
function openAddForm() {
  ctx.openModal(`
    <h2>เพิ่มรายการร่วมทำบุญ</h2>
    <p class="hint" style="margin-top:0">สำหรับเงินสด หรือรายการที่รับหน้างาน (บันทึกเป็น "ชำระแล้ว" ทันที)</p>
    <div class="row-3">
      <div><label for="ma-prefix">คำนำหน้า</label><select id="ma-prefix">${NAME_PREFIXES.map((p) => `<option>${p}</option>`).join("")}</select></div>
      <div><label for="ma-first">ชื่อ</label><input id="ma-first" type="text"></div>
      <div><label for="ma-last">นามสกุล</label><input id="ma-last" type="text"></div>
    </div>
    <div class="row">
      <div><label for="ma-position">ตำแหน่ง</label><input id="ma-position" type="text"></div>
      <div><label for="ma-workplace">หน่วยงาน</label><input id="ma-workplace" type="text"></div>
    </div>
    <label for="ma-phone">เบอร์โทร <span class="opt">(ไม่บังคับ)</span></label><input id="ma-phone" type="tel" inputmode="tel">
    <div class="row">
      <div><label for="ma-amount">จำนวนเงิน (บาท)</label><input id="ma-amount" type="number" inputmode="decimal" min="1"></div>
      <div><label for="ma-method">ช่องทาง</label><select id="ma-method"><option>เงินสด</option><option>โอนเงิน</option><option>เช็ค</option><option>อื่นๆ</option></select></div>
    </div>
    <label for="ma-note">หมายเหตุ</label><input id="ma-note" type="text" placeholder="เช่น ผู้รับเงิน / เลขที่ใบอนุโมทนา">
    <label class="switch"><input type="checkbox" id="ma-show" checked> แสดงในหน้ารายนามผู้ร่วมทำบุญ</label>
    <label class="switch"><input type="checkbox" id="ma-inbook"> ลงสมุดแล้ว</label>
    <div id="ma-words" class="hint"></div>
    <div class="actions"><button class="btn btn-primary btn-block" id="ma-save">💾 บันทึก</button></div>`);
  $("#ma-amount").oninput = () => {
    const v = parseFloat($("#ma-amount").value);
    $("#ma-words").textContent = v > 0 ? `(${bahtText(v)})` : "";
  };
  $("#ma-save").onclick = saveManual;
}

async function saveManual() {
  const amount = Math.round((parseFloat($("#ma-amount").value) || 0) * 100) / 100;
  const first = $("#ma-first").value.trim();
  const last = $("#ma-last").value.trim();
  if (!(amount > 0)) return toast("กรุณาระบุจำนวนเงิน", "err");
  const prefix = $("#ma-prefix").value;
  const code = genCode("DN");
  const o = {
    code, type: "donation", status: "verified", source: "manual", payMethod: $("#ma-method").value,
    prefix, firstName: first, lastName: last,
    fullName: first || last ? `${prefix === "อื่นๆ" ? "" : prefix}${first} ${last}`.trim() : "ผู้ไม่ประสงค์ออกนาม",
    position: $("#ma-position").value.trim(), workplace: $("#ma-workplace").value.trim(),
    phone: $("#ma-phone").value.trim(), address: "", delivery: null, note: $("#ma-note").value.trim(),
    amount, subtotal: amount, shipping: 0, total: amount,
    showName: $("#ma-show").checked && !!(first || last), allowPublish: false,
    hasSlip: false, hasPhoto: false, slipRef: "", slipRaw: "",
    inBook: $("#ma-inbook").checked,
    createdAt: serverTimestamp(), statusAt: serverTimestamp(), statusBy: "เจ้าหน้าที่",
  };
  const btn = $("#ma-save");
  btn.disabled = true;
  try {
    await setDoc(doc(db, "orders", code), o);
    await ctx.syncPublicDonor({ ...o, id: code, createdAt: null });
    toast(`บันทึกแล้ว ${baht(amount)} บาท`, "ok");
    ctx.closeModal();
  } catch (e) {
    toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    btn.disabled = false;
  }
}
