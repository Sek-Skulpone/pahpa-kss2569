import {
  $, $$, baht, escapeHtml, loadSettings, fillEventText, setupBanner, compressImage, readSlipQR,
  genCode, submitOrder, DuplicateSlipError, paymentBlockHtml, showSuccess, setupFilePreview, toast,
} from "./common.js?v=13";
import { NAME_PREFIXES, PAYMENT_QR, BANK_APPS } from "./config.js?v=13";

// เบราว์เซอร์ในแอป LINE/Facebook เปิดแอปธนาคารไม่ได้
const UA = navigator.userAgent;
const inLine = / Line\//.test(UA);
const inAppBrowser = inLine || /FBAN|FBAV|FB_IAB|Instagram|Messenger|TikTok/i.test(UA);
if (inLine && !/[?&]openExternalBrowser=1/.test(location.search)) {
  // LINE รองรับพารามิเตอร์นี้ → เปิดหน้าเดิมใน Chrome/Safari
  const u = new URL(location.href);
  u.searchParams.set("openExternalBrowser", "1");
  location.replace(u.href);
}

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

/**
 * ตัวควบคุมฟอร์มสั่งจอง/บริจาค ใช้ร่วมกันทุกหน้า
 * opts.type        'shirt' | 'ticket' | 'donation'
 * opts.prefix      prefix ของรหัสรายการ เช่น 'SH'
 * opts.openKey     key ใน settings ที่บอกว่าเปิดรับอยู่หรือไม่
 * opts.hasDelivery ฟอร์มนี้มีตัวเลือกการรับของหรือไม่
 * opts.shippingKey key ค่าส่งใน settings
 * opts.calc(s)     คืน { lines: [[label, amount]], subtotal, error }
 * opts.extra(s)    คืนข้อมูลเฉพาะของฟอร์ม (ใส่ลงใน order)
 * opts.onReady(s, refresh)
 * opts.getState()/opts.setState(state)  เก็บ/คืนค่าที่เลือกไว้ (ใช้ตอนกลับมาจากแอปธนาคาร)
 * opts.successTitle
 * opts.photoInput  ช่องแนบรูปผู้บริจาค (ไม่บังคับ)
 * opts.optionalSlip / opts.optionalName  ไม่บังคับแนบสลิป / กรอกชื่อ (ใช้กับการบริจาค)
 */
export async function initOrderPage(opts) {
  setupBanner();
  const DRAFT_KEY = "draft_" + opts.type;
  const AWAIT_KEY = "awaitpay_" + opts.type;
  const qrSrc = PAYMENT_QR[opts.type];

  const prefixSel = $("#f-prefix");
  NAME_PREFIXES.forEach((p) => prefixSel.add(new Option(p, p)));
  $("#pay").innerHTML = paymentBlockHtml(qrSrc);

  const s = await loadSettings();
  fillEventText(s);
  if (!s[opts.openKey]) {
    $("#form").hidden = true;
    $(".bottom-bar").hidden = true;
    $("#closed-msg").hidden = false;
    return;
  }

  // ---- delivery ----
  const deliveryVal = () => $("input[name=delivery]:checked")?.value || null;
  if (opts.hasDelivery) {
    $$("input[name=delivery]").forEach((r) => r.addEventListener("change", () => {
      $("#address-box").hidden = deliveryVal() !== "post";
      refresh();
    }));
  }

  // ---- slip ----
  let slipFile = null;
  let slipInfo = null;
  async function setSlip(file) {
    slipFile = file;
    slipInfo = null;
    const st = $("#slip-status");
    st.className = "slip-status";
    st.textContent = "";
    $("#slip-preview").innerHTML = "";
    if (!file) return;
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    $("#slip-preview").append(img);
    $(".ph", $("#slip-input").parentElement).hidden = true;
    st.textContent = "กำลังอ่าน QR บนสลิป…";
    slipInfo = await readSlipQR(file);
    if (slipInfo) {
      st.className = "slip-status ok";
      st.textContent = "✓ อ่านเลขอ้างอิงสลิปได้: " + slipInfo.ref.slice(0, 24);
    } else {
      st.textContent = "ไม่พบ QR บนสลิป (ส่งได้ตามปกติ เจ้าหน้าที่จะตรวจสอบด้วยตนเอง)";
    }
  }
  $("#slip-input").addEventListener("change", () => setSlip($("#slip-input").files[0] || null));

  let photoFile = null;
  if (opts.photoInput) {
    setupFilePreview($("#photo-input"), $("#photo-preview"), (file) => {
      photoFile = file;
      $(".ph", $("#photo-input").parentElement).hidden = !!file;
    });
  }

  // ---- totals ----
  let current = { subtotal: 0, shipping: 0, total: 0, error: "x" };
  function refresh() {
    const r = opts.calc(s);
    const shipping = opts.hasDelivery && deliveryVal() === "post" && r.subtotal > 0 ? Number(s[opts.shippingKey] || 0) : 0;
    const total = r.subtotal + shipping;
    current = { ...r, shipping, total };
    const rows = r.lines.map(([l, a]) => `<tr><td>${escapeHtml(l)}</td><td>${baht(a)} บาท</td></tr>`);
    if (shipping) rows.push(`<tr><td>ค่าจัดส่งไปรษณีย์</td><td>${baht(shipping)} บาท</td></tr>`);
    rows.push(`<tr class="total"><td>รวมทั้งสิ้น</td><td>${baht(total)} บาท</td></tr>`);
    $("#summary").innerHTML = r.lines.length ? `<table class="summary">${rows.join("")}</table>` : `<p class="hint">ยังไม่ได้เลือกรายการ</p>`;
    $$(".js-total").forEach((el) => (el.textContent = baht(total)));
    $("#total-bar").textContent = baht(total);
  }
  opts.onReady?.(s, refresh);

  // ---- draft (กันข้อมูลหายตอนสลับไปแอปธนาคาร) ----
  const FIELDS = ["f-prefix", "f-first", "f-last", "f-phone", "f-address", "f-note", "f-position", "f-workplace"];
  function saveDraft() {
    const d = { fields: {}, delivery: deliveryVal(), state: opts.getState?.() };
    FIELDS.forEach((id) => { const el = $("#" + id); if (el) d.fields[id] = el.value; });
    $$("input[type=checkbox][id^=f-]").forEach((el) => (d.fields[el.id] = el.checked));
    store.set(DRAFT_KEY, d);
  }
  function restoreDraft() {
    const d = store.get(DRAFT_KEY);
    if (!d) return;
    Object.entries(d.fields || {}).forEach(([id, v]) => {
      const el = $("#" + id);
      if (!el) return;
      if (el.type === "checkbox") el.checked = v; else el.value = v;
    });
    if (d.delivery) {
      const r = $(`input[name=delivery][value=${d.delivery}]`);
      if (r) { r.checked = true; $("#address-box").hidden = d.delivery !== "post"; }
    }
    if (d.state) opts.setState?.(d.state);
  }
  restoreDraft();
  refresh();
  $("#form").addEventListener("input", saveDraft);
  $("#form").addEventListener("change", saveDraft);
  $("#form").addEventListener("click", () => setTimeout(saveDraft));

  // ---- จ่ายผ่านแอปธนาคาร ----
  $("#btn-payapp").addEventListener("click", async () => {
    const err = validate({ needSlip: false });
    if (err) return toast(err, "err");
    saveDraft();
    try { await navigator.clipboard?.writeText(String(current.total)); } catch {}
    openBankSheet();
  });

  async function saveQrToPhone() {
    try {
      const blob = await (await fetch(qrSrc)).blob();
      const file = new File([blob], "QR-ผ้าป่า-kss2569.jpg", { type: blob.type || "image/jpeg" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "QR ชำระเงิน" });
        return true;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      return true;
    } catch (e) {
      return false;
    }
  }

  const isAndroid = /android/i.test(navigator.userAgent);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function openBankSheet() {
    const sheet = document.createElement("div");
    sheet.className = "pay-sheet";
    sheet.innerHTML = `
      <div class="pay-panel">
        <button class="pay-close" aria-label="ปิด">×</button>
        <h2>จ่ายผ่านแอปธนาคาร</h2>
        <div class="pay-steps">
          <div class="pay-step"><b>1</b><div>บันทึกรูป QR ลงเครื่อง<br><button type="button" class="btn btn-outline btn-sm" id="ps-save">💾 บันทึกรูป QR</button> <span id="ps-saved" class="hint"></span></div></div>
          <div class="pay-step"><b>2</b><div>เลือกแอปธนาคาร แล้วกด <u>สแกน</u> → <u>เลือกรูปจากอัลบั้ม</u></div></div>
          <div class="pay-step"><b>3</b><div>ใส่ยอด <strong class="pay-amt">${baht(current.total)}</strong> บาท <span class="hint">(คัดลอกไว้ให้แล้ว)</span></div></div>
          <div class="pay-step"><b>4</b><div>จ่ายเสร็จ <u>กลับมาที่หน้านี้</u> ระบบจะให้แนบสลิปและยืนยันทันที</div></div>
        </div>
        <div class="bank-grid">${BANK_APPS.map((b, i) => `
          <button type="button" class="bank" data-i="${i}" style="background:${b.color};color:${b.text || "#fff"}">${escapeHtml(b.name)}</button>`).join("")}
        </div>
        ${inAppBrowser ? `<p class="hint" style="text-align:center;color:#b00020">⚠️ เปิดจากในแอป LINE/Facebook อาจกดเปิดแอปธนาคารไม่ได้<br>กด ⋯ มุมขวาบน → <b>เปิดในเบราว์เซอร์</b> แล้วทำรายการอีกครั้ง</p>` : ""}
        <p class="hint" style="text-align:center;margin-bottom:0">ไม่มีแอปในรายการ? เปิดแอปธนาคารของท่านเองได้เลย แล้วกลับมาหน้านี้</p>
        <button type="button" class="btn btn-outline btn-block" id="ps-manual" style="margin-top:10px">เปิดแอปเองแล้ว / จ่ายเสร็จแล้ว</button>
      </div>`;
    document.body.append(sheet);
    const close = () => sheet.remove();
    $(".pay-close", sheet).onclick = close;
    sheet.addEventListener("click", (e) => e.target === sheet && close());
    $("#ps-save", sheet).onclick = async () => {
      if (await saveQrToPhone()) $("#ps-saved", sheet).textContent = "✓ บันทึกแล้ว";
    };
    $("#ps-manual", sheet).onclick = () => {
      store.set(AWAIT_KEY, { at: Date.now() });
      close();
      showReturnModal();
    };
    $$(".bank", sheet).forEach((btn) => (btn.onclick = () => {
      const b = BANK_APPS[+btn.dataset.i];
      store.set(AWAIT_KEY, { at: Date.now(), bank: b.name });
      close();
      launchApp(b);
    }));
  }

  function launchApp(b) {
    let left = false;
    const onHide = () => { if (document.hidden) left = true; };
    document.addEventListener("visibilitychange", onHide);
    if (isAndroid) {
      location.href = `intent://#Intent;package=${b.android};S.browser_fallback_url=${encodeURIComponent("https://play.google.com/store/apps/details?id=" + b.android)};end`;
    } else {
      location.href = b.ios;
    }
    setTimeout(() => {
      document.removeEventListener("visibilitychange", onHide);
      if (!left && !document.hidden) {
        if (isIOS) {
          // เปิดแอปไม่ได้ → ไป App Store (ถ้ามีแอปอยู่แล้วจะมีปุ่ม "เปิด")
          location.href = `itms-apps://search.itunes.apple.com/WebObjects/MZSearch.woa/wa/search?media=software&term=${encodeURIComponent(b.search || b.name)}`;
          showReturnModal();
          return;
        }
        toast(`เปิดแอป ${b.name} ไม่ได้ — กรุณาเปิดแอปธนาคารเอง แล้วสแกนรูป QR ที่บันทึกไว้`, "err");
        showReturnModal();
      }
    }, 2500);
  }

  // ---- กลับมาจากแอปธนาคาร ----
  function showReturnModal() {
    if ($(".return-modal")) return;
    const m = document.createElement("div");
    m.className = "pay-sheet return-modal";
    m.innerHTML = `
      <div class="pay-panel" style="text-align:center">
        <div style="font-size:3rem">🧾</div>
        <h2>ชำระเงินเรียบร้อยแล้วใช่ไหม?</h2>
        <p>ยอด <strong class="pay-amt">${baht(current.total)}</strong> บาท<br>
        <span class="hint">แอปธนาคารจะบันทึกสลิปไว้ในอัลบั้มรูปอัตโนมัติ</span></p>
        <label class="btn btn-primary btn-block btn-lg" style="position:relative;margin:0">
          📎 แนบสลิปและยืนยัน
          <input type="file" accept="image/*" id="rm-slip" style="position:absolute;inset:0;opacity:0">
        </label>
        ${opts.optionalSlip ? '<button type="button" class="btn btn-gold btn-block" id="rm-noslip" style="margin-top:10px">จ่ายแล้ว ยืนยันโดยไม่แนบสลิป</button>' : ""}
        <button type="button" class="btn btn-outline btn-block" id="rm-later" style="margin-top:10px">ยังไม่ได้จ่าย</button>
      </div>`;
    document.body.append(m);
    $("#rm-later", m).onclick = () => { store.del(AWAIT_KEY); m.remove(); };
    const noSlip = $("#rm-noslip", m);
    if (noSlip) noSlip.onclick = () => { m.remove(); submit(); };
    $("#rm-slip", m).onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      m.remove();
      await setSlip(file);
      submit();
    };
  }

  function checkReturn() {
    const a = store.get(AWAIT_KEY);
    if (!a || slipFile) return;
    if (Date.now() - a.at > 2 * 60 * 60 * 1000) return store.del(AWAIT_KEY);
    showReturnModal();
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(checkReturn, 400); });
  window.addEventListener("pageshow", () => setTimeout(checkReturn, 400));
  checkReturn();

  // ---- submit ----
  const btn = $("#submit");
  btn.addEventListener("click", () => {
    if (!slipFile && !validate({ needSlip: false })) {
      if (opts.optionalSlip) return showReturnModal();
      // ยังไม่แนบสลิป: พาไปส่วนชำระเงิน
      $("#pay").scrollIntoView({ behavior: "smooth", block: "start" });
      toast("กรุณาชำระเงิน แล้วแนบสลิปการโอน", "err");
      return;
    }
    submit();
  });

  let sending = false;
  async function submit() {
    if (sending) return;
    const err = validate({ needSlip: true });
    if (err) {
      toast(err, "err");
      return;
    }
    sending = true;
    btn.disabled = true;
    const label = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> กำลังส่ง…';
    const overlay = document.createElement("div");
    overlay.className = "pay-sheet";
    overlay.innerHTML = `<div class="pay-panel" style="text-align:center"><div class="spinner dark"></div><h2 style="margin-top:12px">กำลังบันทึกรายการ…</h2></div>`;
    document.body.append(overlay);
    try {
      const files = {};
      if (slipFile) files.slip = await compressImage(slipFile, { maxDim: 900, maxBytes: 180_000 });
      if (photoFile) files.photo = await compressImage(photoFile, { maxDim: 800, maxBytes: 220_000 });
      const first = $("#f-first").value.trim();
      const last = $("#f-last").value.trim();
      const prefix = prefixSel.value;
      const order = {
        code: genCode(opts.prefix),
        type: opts.type,
        prefix,
        firstName: first,
        lastName: last,
        fullName: first || last ? `${prefix === "อื่นๆ" ? "" : prefix}${first} ${last}`.trim() : "ผู้ไม่ประสงค์ออกนาม",
        hasSlip: !!slipFile,
        phone: $("#f-phone").value.trim(),
        delivery: opts.hasDelivery ? deliveryVal() : null,
        address: opts.hasDelivery && deliveryVal() === "post" ? $("#f-address").value.trim() : "",
        note: $("#f-note")?.value.trim() || "",
        subtotal: current.subtotal,
        shipping: current.shipping,
        total: current.total,
        ...opts.extra(s),
      };
      await submitOrder(order, files, slipInfo);
      store.del(DRAFT_KEY);
      store.del(AWAIT_KEY);
      overlay.remove();
      $(".bottom-bar").hidden = true;
      showSuccess($("main"), { code: order.code, title: opts.successTitle, total: order.total });
    } catch (e) {
      console.error(e);
      overlay.remove();
      const msg = e instanceof DuplicateSlipError ? e.message : "ส่งข้อมูลไม่สำเร็จ: " + (e.message || e);
      toast(msg, "err");
      btn.disabled = false;
      btn.innerHTML = label;
    } finally {
      sending = false;
    }
  }

  function validate({ needSlip }) {
    if (current.error) return current.error;
    if (current.total <= 0) return "ยอดเงินต้องมากกว่า 0";
    if (!opts.optionalName && (!$("#f-first").value.trim() || !$("#f-last").value.trim())) return "กรุณากรอกชื่อและนามสกุล";
    const phone = $("#f-phone").value.replace(/\D/g, "");
    if ($("#f-phone").required && phone.length < 9) return "กรุณากรอกเบอร์โทรให้ถูกต้อง";
    if (opts.hasDelivery) {
      if (!deliveryVal()) return "กรุณาเลือกช่องทางการรับ";
      if (deliveryVal() === "post" && $("#f-address").value.trim().length < 15) return "กรุณากรอกที่อยู่สำหรับจัดส่งให้ครบถ้วน";
    }
    if (needSlip && !slipFile && !opts.optionalSlip) return "กรุณาแนบสลิปการโอนเงิน";
    return "";
  }
}
