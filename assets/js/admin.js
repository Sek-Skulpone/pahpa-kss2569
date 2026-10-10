import {
  app, db, isConfigured, collection, query, orderBy, onSnapshot, doc, getDoc, updateDoc, deleteDoc, setDoc,
  serverTimestamp,
} from "./firebase.js?v=17";
import {
  initializeAuth, browserLocalPersistence, inMemoryPersistence, browserPopupRedirectResolver, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signInAnonymously, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  $, $$, baht, escapeHtml, loadSettings, setupBanner, toast, TYPE_LABEL, STATUS_LABEL, DELIVERY_LABEL, orderSummaryText,
} from "./common.js?v=17";
import { SHIRT_SIZES, DEFAULT_SETTINGS } from "./config.js?v=17";
import { renderThanksCard, downloadCanvas } from "./thanks-card.js?v=17";
import { renderLedger, payGroup, PAY_GROUP_LABEL } from "./ledger.js?v=17";

setupBanner();
// เก็บสถานะเข้าระบบใน localStorage (ไม่ใช้ IndexedDB ที่อาจค้างในบางเบราว์เซอร์)
const auth = app ? initializeAuth(app, { persistence: [browserLocalPersistence, inMemoryPersistence], popupRedirectResolver: browserPopupRedirectResolver }) : null;

// ถ้าโหลดไม่ขึ้นภายใน 10 วินาที แสดงทางแก้
setTimeout(() => {
  if (!firstLoad || !$("#login").hidden) return;
  const box = document.createElement("div");
  box.className = "container";
  box.innerHTML = `<div class="card" style="text-align:center">
    <h2>โหลดข้อมูลช้าผิดปกติ</h2>
    <p>อาจเกิดจากเบราว์เซอร์ค้าง ลองกดปุ่มด้านล่าง หรือปิด Chrome ทุกหน้าต่างแล้วเปิดใหม่</p>
    <button class="btn btn-primary" id="btn-nocache">🔄 เปิดแบบโหมดสำรอง</button></div>`;
  document.body.append(box);
  $("#btn-nocache").onclick = () => { try { localStorage.setItem("noCache", "1"); } catch {} location.reload(); };
}, 10000);

let settings = { ...DEFAULT_SETTINGS };
let orders = [];
let currentTab = "overview";
let unsub = null;
let firstLoad = true;
const known = new Set();

// ---------------- auth ----------------
// เจ้าหน้าที่เข้าด้วย "ลิงก์ลับ" (#k=คีย์) ไม่ต้องกรอกรหัส — คีย์จริงเก็บใน Firestore private/staffKey
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const keyFromHash = new URLSearchParams(location.hash.slice(1)).get("k");
if (keyFromHash) lsSet("staffKey", keyFromHash);
let staffKey = keyFromHash || lsGet("staffKey");

function showLogin(msg) {
  unsub?.();
  $("#app").hidden = true;
  $("#btn-logout").hidden = true;
  $("#login").hidden = false;
  if (msg) loginError({ message: msg });
}

if (!isConfigured) {
  $("#login").hidden = false;
} else {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      if (staffKey) {
        signInAnonymously(auth).catch((e) => showLogin("เชื่อมต่อไม่สำเร็จ: " + e.code));
      } else if ($("#login-err").hidden) showLogin();
      return;
    }
    if (user.isAnonymous && staffKey) {
      // ลงทะเบียนเครื่องนี้ด้วยคีย์ (ถ้าเคยลงทะเบียนแล้วจะไม่ผ่าน ซึ่งไม่เป็นไร — สิทธิ์จริงตรวจตอนโหลดข้อมูล)
      await setDoc(doc(db, "staffDevices", user.uid), { key: staffKey, createdAt: serverTimestamp() }).catch(() => {});
    }
    startApp(user);
  });
}

function loginError(e) {
  const el = $("#login-err");
  el.hidden = false;
  el.textContent = e.message && !e.code ? e.message : "เข้าสู่ระบบไม่สำเร็จ: " + (e.code || e.message);
}

$("#btn-google").onclick = async () => {
  unlockAudio();
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      signInWithRedirect(auth, provider);
    } else loginError(e);
  }
};
$("#btn-logout").onclick = () => signOut(auth);

async function startApp(user) {
  $("#login").hidden = true;
  $("#app").hidden = false;
  $("#btn-logout").hidden = user.isAnonymous;
  $("#who").textContent = user.isAnonymous ? "เจ้าหน้าที่" : user.email || user.displayName || "";
  settings = await loadSettings();

  firstLoad = true;
  unsub = onSnapshot(
    query(collection(db, "orders"), orderBy("createdAt", "desc")),
    (snap) => {
      orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const fresh = orders.filter((o) => !known.has(o.id));
      orders.forEach((o) => known.add(o.id));
      if (!firstLoad && fresh.length) newOrderAlert(fresh);
      firstLoad = false;
      render();
    },
    (e) => {
      console.error(e);
      $("#app").hidden = true;
      $("#login").hidden = false;
      lsSet("staffKey", null);
      staffKey = null;
      loginError({ message: e.code === "permission-denied" ? "ลิงก์เจ้าหน้าที่ไม่ถูกต้อง หรือถูกยกเลิกแล้ว" : e.message });
      signOut(auth);
    },
  );
}

// ---------------- alerts ----------------
let audioCtx = null;
function unlockAudio() {
  try {
    audioCtx ??= new AudioContext();
    audioCtx.resume();
  } catch {}
}
function beep() {
  if (!audioCtx) return;
  [0, 0.18].forEach((t) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.25, audioCtx.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.15);
    o.connect(g).connect(audioCtx.destination);
    o.start(audioCtx.currentTime + t);
    o.stop(audioCtx.currentTime + t + 0.16);
  });
}
document.addEventListener("click", unlockAudio, { once: true });

function newOrderAlert(fresh) {
  beep();
  const o = fresh[0];
  toast(`🔔 ${TYPE_LABEL[o.type]} ใหม่: ${o.fullName} ${baht(o.total)} บาท`, "ok");
}

// ---------------- tabs ----------------
$$("#tabs button").forEach((b) => (b.onclick = () => {
  currentTab = b.dataset.tab;
  $$("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
  render();
  window.scrollTo({ top: 0 });
}));
["#q", "#f-status", "#f-delivery"].forEach((s) => $(s).addEventListener("input", render));

function render() {
  const counts = { shirt: 0, ticket: 0, donation: 0 };
  orders.forEach((o) => o.status === "pending" && counts[o.type]++);
  $$("[data-badge]").forEach((el) => {
    const n = counts[el.dataset.badge];
    el.hidden = !n;
    el.textContent = n;
  });
  $("#tab-overview").hidden = currentTab !== "overview";
  $("#tab-settings").hidden = currentTab !== "settings";
  $("#tab-ledger").hidden = currentTab !== "ledger";
  $("#tab-list").hidden = !["shirt", "ticket", "donation"].includes(currentTab);
  if (currentTab === "overview") renderOverview();
  else if (currentTab === "settings") renderSettings();
  else if (currentTab === "ledger") renderLedger($("#tab-ledger"), { orders, isPaid, settings, syncPublicDonor, openModal, closeModal });
  else renderList();
}

const isPaid = (o) => o.status === "verified" || o.status === "delivered";
const active = (o) => o.status !== "rejected";

function renderOverview() {
  const by = (t) => orders.filter((o) => o.type === t && active(o));
  const sum = (arr, f = (o) => o.total) => arr.reduce((a, o) => a + (Number(f(o)) || 0), 0);
  const sh = by("shirt"), tk = by("ticket"), dn = by("donation");
  const paidAll = sum(orders.filter(isPaid));
  const pendingAll = sum(orders.filter((o) => o.status === "pending"));

  const stat = (l, v, s, cls = "") => `<div class="stat ${cls}"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;

  const sizeRows = SHIRT_SIZES.map((z) => {
    const paid = sum(sh.filter(isPaid), (o) => o.items?.[z.size]);
    const pend = sum(sh.filter((o) => o.status === "pending"), (o) => o.items?.[z.size]);
    return { size: z.size, paid, pend };
  }).filter((r) => r.paid || r.pend);
  const tp = sizeRows.reduce((a, r) => a + r.paid, 0);
  const tpe = sizeRows.reduce((a, r) => a + r.pend, 0);

  const postWaiting = orders.filter((o) => o.delivery === "post" && o.status === "verified").length;
  const schoolWaiting = orders.filter((o) => o.delivery === "school" && o.status === "verified").length;

  $("#tab-overview").innerHTML = `
    <div class="stats">
      ${stat("ยอดเงินที่ตรวจแล้ว", baht(paidAll), `รอตรวจสอบอีก ${baht(pendingAll)} บาท`, "gold")}
      ${stat("🙏 ร่วมทำบุญ", baht(sum(dn.filter(isPaid))), `${dn.filter(isPaid).length} ราย · รอตรวจ ${baht(sum(dn.filter((o) => o.status === "pending")))}`)}
      ${stat("👕 เสื้อ (ตัว)", tp + tpe, `ชำระแล้ว ${tp} · รอตรวจ ${tpe} · ${baht(sum(sh.filter(isPaid)))} บาท`)}
      ${stat("🎟️ บัตรรำวง (ใบ)", sum(tk, (o) => o.ticketCount), `ชำระแล้ว ${sum(tk.filter(isPaid), (o) => o.ticketCount)} ใบ · ${baht(sum(tk.filter(isPaid)))} บาท`)}
      ${stat("📦 รอส่งไปรษณีย์", postWaiting, "รายการที่ชำระแล้วแต่ยังไม่ส่ง")}
      ${stat("🏫 รอรับที่โรงเรียน", schoolWaiting, "รายการที่ชำระแล้วแต่ยังไม่รับ")}
    </div>
    <div class="card">
      <h2>สรุปจำนวนเสื้อแยกไซส์</h2>
      ${sizeRows.length ? `<table class="tbl">
        <thead><tr><th>ไซส์</th><th>ชำระแล้ว</th><th>รอตรวจ</th><th>รวม</th></tr></thead>
        <tbody>${sizeRows.map((r) => `<tr><td>${r.size}</td><td>${r.paid}</td><td>${r.pend}</td><td>${r.paid + r.pend}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td>รวม</td><td>${tp}</td><td>${tpe}</td><td>${tp + tpe}</td></tr></tfoot>
      </table>` : `<p class="hint">ยังไม่มีรายการสั่งเสื้อ</p>`}
    </div>
    <div class="card">
      <h2>แยกตามช่องทางชำระ <span class="hint" style="font-size:.85rem">(ชำระแล้ว)</span></h2>
      <table class="tbl">
        <thead><tr><th></th><th>บริจาค</th><th>เสื้อ</th><th>บัตรรำวง</th><th>รวม</th></tr></thead>
        <tbody>${["cash", "transfer", "other"].map((g) => {
          const paidIn = (t) => orders.filter((o) => isPaid(o) && (!t || o.type === t) && payGroup(o) === g);
          if (!paidIn().length && g === "other") return "";
          return `<tr><td>${PAY_GROUP_LABEL[g]}</td><td>${baht(sum(paidIn("donation")))}</td><td>${baht(sum(paidIn("shirt")))}</td><td>${baht(sum(paidIn("ticket")))}</td><td><strong>${baht(sum(paidIn()))}</strong></td></tr>`;
        }).join("")}</tbody>
        <tfoot><tr><td>รวม</td><td>${baht(sum(dn.filter(isPaid)))}</td><td>${baht(sum(sh.filter(isPaid)))}</td><td>${baht(sum(tk.filter(isPaid)))}</td><td>${baht(paidAll)}</td></tr></tfoot>
      </table>
    </div>
    <div class="card">
      <h2>สรุปบัตรรำวง</h2>
      <table class="tbl">
        <thead><tr><th></th><th>ชำระแล้ว</th><th>รอตรวจ</th></tr></thead>
        <tbody>
          <tr><td>บัตรใบ (ใบ)</td><td>${sum(tk.filter(isPaid), (o) => o.singles)}</td><td>${sum(tk.filter((o) => o.status === "pending"), (o) => o.singles)}</td></tr>
          <tr><td>บัตรเล่ม (เล่ม)</td><td>${sum(tk.filter(isPaid), (o) => o.books)}</td><td>${sum(tk.filter((o) => o.status === "pending"), (o) => o.books)}</td></tr>
        </tbody>
      </table>
    </div>`;
}

function filtered() {
  const q = $("#q").value.trim().toLowerCase();
  const st = $("#f-status").value;
  const dv = $("#f-delivery").value;
  return orders.filter((o) =>
    o.type === currentTab &&
    (!st || o.status === st) &&
    (!dv || o.delivery === dv) &&
    (!q || [o.fullName, o.phone, o.code, o.workplace].join(" ").toLowerCase().includes(q)));
}

const fmtTime = (ts) => (ts?.toDate ? ts.toDate().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—");

function renderList() {
  $("#f-delivery").hidden = currentTab === "donation";
  const list = filtered();
  $("#list-sum").textContent = `${list.length} รายการ · รวม ${baht(list.reduce((a, o) => a + (o.total || 0), 0))} บาท`;
  $("#orders").innerHTML = list.map((o) => `
    <div class="order ${o.status}" data-id="${o.id}">
      <div class="top">
        <div class="name">${escapeHtml(o.fullName)}</div>
        <div class="amt">${baht(o.total)} ฿</div>
      </div>
      <div class="meta">${escapeHtml(o.code)} · ${fmtTime(o.createdAt)}${o.phone ? " · " + escapeHtml(o.phone) : ""}</div>
      <div class="meta">${escapeHtml(o.type === "donation" ? [o.position, o.workplace].filter(Boolean).join(" · ") : orderSummaryText(o))}</div>
      <div style="margin-top:4px"><span class="chip ${o.status}">${STATUS_LABEL[o.status]}</span>${o.delivery === "post" ? '<span class="chip post">ไปรษณีย์</span>' : ""}${o.hasPhoto ? '<span class="chip">มีรูป</span>' : ""}${o.hasSlip === false ? '<span class="chip rejected">ไม่แนบสลิป</span>' : ""}${o.type === "donation" && o.allowPublish === false ? '<span class="chip">ไม่ต้องการป้าย</span>' : ""}</div>
    </div>`).join("") || `<p class="hint">ไม่มีรายการ</p>`;
  $$("#orders .order").forEach((el) => (el.onclick = () => openOrder(el.dataset.id)));
}

// ---------------- order detail ----------------
function openModal(html) {
  $("#sheet").innerHTML = `<button class="close" aria-label="ปิด">×</button>` + html;
  $("#modal").hidden = false;
  document.body.style.overflow = "hidden";
  $("#sheet .close").onclick = closeModal;
}
function closeModal() {
  $("#modal").hidden = true;
  document.body.style.overflow = "";
}
$("#modal").addEventListener("click", (e) => e.target.id === "modal" && closeModal());

function zoom(src) {
  const lb = document.createElement("div");
  lb.className = "lightbox";
  lb.innerHTML = `<img src="${src}" alt="">`;
  lb.onclick = () => lb.remove();
  document.body.append(lb);
}

async function openOrder(id) {
  const o = orders.find((x) => x.id === id);
  if (!o) return;
  const kv = [
    ["รหัส", o.code],
    ["ประเภท", TYPE_LABEL[o.type]],
    ["สถานะ", `<span class="chip ${o.status}">${STATUS_LABEL[o.status]}</span>`],
    ["วันที่", fmtTime(o.createdAt)],
    ["ชื่อ", escapeHtml(o.fullName)],
    o.phone && ["โทร", `<a href="tel:${escapeHtml(o.phone)}">${escapeHtml(o.phone)}</a>`],
    o.position && ["ตำแหน่ง", escapeHtml(o.position)],
    o.workplace && ["ที่ทำงาน", escapeHtml(o.workplace)],
    o.type !== "donation" && ["รายการ", escapeHtml(orderSummaryText(o))],
    o.delivery && ["การรับ", DELIVERY_LABEL[o.delivery]],
    o.address && ["ที่อยู่", escapeHtml(o.address).replace(/\n/g, "<br>")],
    o.shipping ? ["ค่าส่ง", baht(o.shipping) + " บาท"] : null,
    ["ยอดเงิน", `<strong>${baht(o.total)} บาท</strong>`],
    o.note && ["หมายเหตุ", escapeHtml(o.note)],
    o.type === "donation" && ["แสดงรายนาม", o.showName ? "ยินยอม" : "ไม่ประสงค์ออกนาม"],
    o.type === "donation" && ["ป้ายขอบคุณ", o.allowPublish ? "ต้องการ" : "ไม่ต้องการ"],
    o.hasSlip === false
      ? ["สลิป", '<span class="chip rejected">ไม่แนบสลิป — ตรวจยอดจากบัญชีธนาคาร</span>']
      : ["เลขอ้างอิงสลิป", o.slipRef ? escapeHtml(o.slipRef) : '<span class="hint">อ่าน QR ไม่ได้ — ตรวจด้วยตา</span>'],
  ].filter(Boolean);

  const btn = (status, label, cls) => (o.status === status ? "" : `<button class="btn btn-sm ${cls}" data-status="${status}">${label}</button>`);
  openModal(`
    <h2>${TYPE_LABEL[o.type]}</h2>
    <dl class="kv">${kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
    <label for="admin-note">บันทึกของเจ้าหน้าที่</label>
    <input id="admin-note" type="text" value="${escapeHtml(o.adminNote || "")}" placeholder="เช่น เลขพัสดุ / ผู้รับแทน">
    <div class="actions">
      ${btn("verified", "✓ ยืนยันชำระแล้ว", "btn-primary")}
      ${o.type !== "donation" ? btn("delivered", "📦 ส่งมอบแล้ว", "btn-gold") : ""}
      ${btn("pending", "↺ รอตรวจสอบ", "btn-outline")}
      ${btn("rejected", "✕ ไม่ผ่าน", "btn-danger")}
      ${o.type === "donation" && o.allowPublish !== false ? '<button class="btn btn-sm btn-gold" id="btn-card">🖼️ สร้างป้ายขอบคุณ</button>' : ""}
    </div>
    <div class="imgs" id="imgs"><p class="hint">กำลังโหลดรูป…</p></div>
    <div id="card-preview"></div>
    <div class="actions" style="justify-content:flex-end;margin-top:24px">
      <button class="btn btn-sm btn-danger" id="btn-del">ลบรายการ</button>
    </div>`);

  $("#admin-note").onchange = (e) => updateDoc(doc(db, "orders", id), { adminNote: e.target.value.trim() }).then(() => toast("บันทึกแล้ว", "ok"));
  $$("[data-status]", $("#sheet")).forEach((b) => (b.onclick = () => setStatus(o, b.dataset.status)));
  $("#btn-del").onclick = () => deleteOrder(o);

  let files = {};
  try {
    const snap = await getDoc(doc(db, "orderFiles", id));
    files = snap.exists() ? snap.data() : {};
  } catch (e) {
    console.warn(e);
  }
  const imgs = $("#imgs");
  if (!imgs) return;
  imgs.innerHTML = [
    files.slip && `<div><div class="cap">สลิปการโอน</div><img src="${files.slip}" alt="สลิป"></div>`,
    files.photo && `<div><div class="cap">รูปผู้บริจาค</div><img src="${files.photo}" alt="รูปผู้บริจาค"></div>`,
  ].filter(Boolean).join("") || `<p class="hint">ไม่มีรูปแนบ</p>`;
  $$("img", imgs).forEach((im) => (im.onclick = () => zoom(im.src)));
  const cardBtn = $("#btn-card");
  if (cardBtn) cardBtn.onclick = () => makeCard(o, files.photo);
}

async function setStatus(o, status) {
  try {
    await updateDoc(doc(db, "orders", o.id), { status, statusAt: serverTimestamp(), statusBy: auth.currentUser.email || "เจ้าหน้าที่" });
    if (o.type === "donation") await syncPublicDonor({ ...o, status });
    toast(`เปลี่ยนสถานะเป็น "${STATUS_LABEL[status]}" แล้ว`, "ok");
    closeModal();
  } catch (e) {
    toast("ไม่สำเร็จ: " + e.message, "err");
  }
}

function donorSubtitle(o) {
  return [o.position, o.workplace].filter(Boolean).join(" ");
}

async function syncPublicDonor(o) {
  const ref = doc(db, "publicDonors", o.id);
  if (isPaid(o) && o.showName) {
    await setDoc(ref, { name: o.fullName, subtitle: donorSubtitle(o), amount: o.amount ?? o.total, createdAt: o.createdAt || serverTimestamp() });
  } else {
    await deleteDoc(ref).catch(() => {});
  }
}

async function deleteOrder(o) {
  if (!confirm(`ลบรายการ ${o.code} ของ ${o.fullName}? (ย้อนกลับไม่ได้)`)) return;
  try {
    await Promise.all([
      deleteDoc(doc(db, "orders", o.id)),
      deleteDoc(doc(db, "orderFiles", o.id)),
      deleteDoc(doc(db, "publicDonors", o.id)),
      o.slipRef ? deleteDoc(doc(db, "slipRefs", o.slipRef)) : null,
    ]);
    toast("ลบแล้ว", "ok");
    closeModal();
  } catch (e) {
    toast("ลบไม่สำเร็จ: " + e.message, "err");
  }
}

async function makeCard(o, photo) {
  const box = $("#card-preview");
  box.innerHTML = `
    <h3>ป้ายขอบคุณ</h3>
    <label class="switch"><input type="checkbox" id="c-amount" checked> แสดงยอดเงิน</label>
    <label for="c-name">ชื่อบนป้าย</label><input id="c-name" type="text" value="${escapeHtml(o.fullName)}">
    <label for="c-sub">บรรทัดรอง</label><input id="c-sub" type="text" value="${escapeHtml(donorSubtitle(o))}">
    <div id="c-canvas" style="margin-top:12px"></div>
    <div class="actions"><button class="btn btn-primary btn-block" id="c-dl">⬇️ ดาวน์โหลดรูปป้าย</button></div>`;
  let canvas;
  const draw = async () => {
    canvas = await renderThanksCard({
      name: $("#c-name").value.trim(),
      subtitle: $("#c-sub").value.trim(),
      amount: o.amount ?? o.total,
      showAmount: $("#c-amount").checked,
      photo,
      settings,
    });
    $("#c-canvas").replaceChildren(canvas);
  };
  ["#c-amount", "#c-name", "#c-sub"].forEach((s) => $(s).addEventListener("change", draw));
  $("#c-dl").onclick = () => downloadCanvas(canvas, `ขอบคุณ-${o.code}.jpg`);
  await draw();
  box.scrollIntoView({ behavior: "smooth" });
}

// ---------------- CSV ----------------
$("#btn-csv").onclick = () => {
  const list = filtered();
  const base = [["รหัส", (o) => o.code], ["วันที่", (o) => fmtTime(o.createdAt)], ["สถานะ", (o) => STATUS_LABEL[o.status]], ["ชื่อ-สกุล", (o) => o.fullName], ["โทร", (o) => o.phone]];
  const cols = {
    shirt: [...SHIRT_SIZES.map((z) => [z.size, (o) => o.items?.[z.size] || ""]), ["รวมตัว", (o) => o.qty]],
    ticket: [["บัตรใบ", (o) => o.singles], ["บัตรเล่ม", (o) => o.books], ["รวมใบ", (o) => o.ticketCount]],
    donation: [["ตำแหน่ง", (o) => o.position], ["ที่ทำงาน", (o) => o.workplace]],
  }[currentTab];
  const tail = currentTab === "donation"
    ? [["ยอดเงิน", (o) => o.total], ["แสดงรายนาม", (o) => (o.showName ? "Y" : "N")], ["หมายเหตุ", (o) => o.note], ["บันทึกจนท.", (o) => o.adminNote]]
    : [["การรับ", (o) => (o.delivery ? DELIVERY_LABEL[o.delivery] : "")], ["ที่อยู่", (o) => o.address], ["ค่าส่ง", (o) => o.shipping], ["ยอดเงิน", (o) => o.total], ["หมายเหตุ", (o) => o.note], ["บันทึกจนท.", (o) => o.adminNote]];
  const all = [...base, ...cols, ...tail, ["เลขอ้างอิงสลิป", (o) => o.slipRef]];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [all.map(([h]) => esc(h)).join(","), ...list.map((o) => all.map(([, f]) => esc(f(o))).join(","))].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${TYPE_LABEL[currentTab]}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
};

// ---------------- settings ----------------
const SETTING_FIELDS = [
  ["ข้อมูลงาน", [
    ["eventTitle", "ชื่องาน"], ["eventSubtitle", "ชื่องาน (บรรทัดรอง)"], ["eventDate", "วันที่จัดงาน"],
    ["eventPurpose", "วัตถุประสงค์"], ["schoolName", "ชื่อโรงเรียน"],
  ]],
  ["ราคา (บาท)", [
    ["shirtPrice", "เสื้อ ราคาตัวละ", "number"], ["shirtShipping", "เสื้อ ค่าส่งไปรษณีย์/ออเดอร์", "number"],
    ["ticketPrice", "บัตรรำวง ใบละ", "number"], ["ticketBookPrice", "บัตรรำวง เล่มละ", "number"],
    ["ticketBookSize", "จำนวนบัตรต่อเล่ม", "number"], ["ticketShipping", "บัตร ค่าส่งไปรษณีย์/ออเดอร์", "number"],
  ]],
  ["ผู้ประสานงาน", [
    ["contactShirt", "สั่งจองเสื้อ"], ["contactShirtPhone", "เบอร์โทร (เสื้อ)"],
    ["contactTicket", "สั่งจองบัตรรำวง"], ["contactTicketPhone", "เบอร์โทร (บัตร)"],
    ["contactInfo", "สอบถามเพิ่มเติม"], ["contactInfoPhone", "เบอร์โทร (สอบถาม)"],
  ]],
];

function renderSettings() {
  const box = $("#tab-settings");
  if (box.dataset.ready) return;
  box.dataset.ready = "1";
  box.innerHTML = `
    <div class="card">
      <h2>QR Code ป้ายประชาสัมพันธ์</h2>
      <p class="hint">QR แยก 3 ระบบ: สั่งเสื้อ / จองบัตรรำวง / ร่วมทำบุญ</p>
      <a class="btn btn-outline btn-sm" href="posters.html" target="_blank">🖨️ เปิดหน้า QR สำหรับพิมพ์</a>
    </div>
    <div class="card">
      <h2>เปิด/ปิดรับรายการ</h2>
      <label class="switch"><input type="checkbox" id="s-openShirt"> เปิดรับสั่งจองเสื้อ</label>
      <label class="switch"><input type="checkbox" id="s-openTicket"> เปิดรับจองบัตรรำวง</label>
      <label class="switch"><input type="checkbox" id="s-openDonate"> เปิดรับบริจาคออนไลน์</label>
    </div>
    ${SETTING_FIELDS.map(([title, fields]) => `
      <div class="card"><h2>${title}</h2><div class="set-grid">
        ${fields.map(([k, l, t]) => `<div><label for="s-${k}">${l}</label><input id="s-${k}" type="${t || "text"}" ${t === "number" ? 'inputmode="numeric" min="0"' : ""}></div>`).join("")}
      </div></div>`).join("")}
    <button class="btn btn-primary btn-block" id="s-save">💾 บันทึกการตั้งค่า</button>`;
  ["openShirt", "openTicket", "openDonate"].forEach((k) => ($("#s-" + k).checked = !!settings[k]));
  SETTING_FIELDS.flatMap(([, f]) => f).forEach(([k]) => ($("#s-" + k).value = settings[k] ?? ""));
  $("#s-save").onclick = async () => {
    const data = {};
    ["openShirt", "openTicket", "openDonate"].forEach((k) => (data[k] = $("#s-" + k).checked));
    SETTING_FIELDS.flatMap(([, f]) => f).forEach(([k, , t]) => {
      const v = $("#s-" + k).value.trim();
      data[k] = t === "number" ? Number(v) || 0 : v;
    });
    try {
      await setDoc(doc(db, "settings", "public"), data, { merge: true });
      settings = { ...settings, ...data };
      toast("บันทึกการตั้งค่าแล้ว", "ok");
    } catch (e) {
      toast("บันทึกไม่สำเร็จ: " + e.message, "err");
    }
  };
}
