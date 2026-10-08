import {
  $, $$, baht, escapeHtml, loadSettings, fillEventText, setupBanner, compressImage, readSlipQR,
  genCode, submitOrder, DuplicateSlipError, paymentBlockHtml, showSuccess, setupFilePreview, toast,
} from "./common.js";
import { NAME_PREFIXES } from "./config.js";

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
 * opts.successTitle
 * opts.photoInput  ช่องแนบรูปผู้บริจาค (ไม่บังคับ)
 */
export async function initOrderPage(opts) {
  setupBanner();
  const prefixSel = $("#f-prefix");
  NAME_PREFIXES.forEach((p) => prefixSel.add(new Option(p, p)));
  $("#pay").innerHTML = paymentBlockHtml();

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
  setupFilePreview($("#slip-input"), $("#slip-preview"), async (file) => {
    slipFile = file;
    slipInfo = null;
    const st = $("#slip-status");
    st.className = "slip-status";
    st.textContent = "";
    if (!file) return;
    $(".upload .ph", $("#slip-input").parentElement).hidden = true;
    st.textContent = "กำลังอ่าน QR บนสลิป…";
    slipInfo = await readSlipQR(file);
    if (slipInfo) {
      st.className = "slip-status ok";
      st.textContent = "✓ อ่านเลขอ้างอิงสลิปได้: " + slipInfo.ref.slice(0, 24);
    } else {
      st.textContent = "ไม่พบ QR บนสลิป (ส่งได้ตามปกติ เจ้าหน้าที่จะตรวจสอบด้วยตนเอง)";
    }
  });

  let photoFile = null;
  if (opts.photoInput) {
    setupFilePreview($("#photo-input"), $("#photo-preview"), (file) => {
      photoFile = file;
      $(".upload .ph", $("#photo-input").parentElement).hidden = !!file;
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
  refresh();

  // ---- submit ----
  const btn = $("#submit");
  btn.addEventListener("click", async () => {
    const err = validate();
    if (err) {
      toast(err, "err");
      return;
    }
    btn.disabled = true;
    const label = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> กำลังส่ง…';
    try {
      const files = { slip: await compressImage(slipFile, { maxDim: 1100, maxBytes: 350_000 }) };
      if (photoFile) files.photo = await compressImage(photoFile, { maxDim: 900, maxBytes: 420_000 });
      const first = $("#f-first").value.trim();
      const last = $("#f-last").value.trim();
      const prefix = prefixSel.value;
      const order = {
        code: genCode(opts.prefix),
        type: opts.type,
        prefix,
        firstName: first,
        lastName: last,
        fullName: `${prefix === "อื่นๆ" ? "" : prefix}${first} ${last}`.trim(),
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
      $(".bottom-bar").hidden = true;
      showSuccess($("main"), { code: order.code, title: opts.successTitle, total: order.total });
    } catch (e) {
      console.error(e);
      const msg = e instanceof DuplicateSlipError ? e.message : "ส่งข้อมูลไม่สำเร็จ: " + (e.message || e);
      toast(msg, "err");
      btn.disabled = false;
      btn.innerHTML = label;
    }
  });

  function validate() {
    if (current.error) return current.error;
    if (current.total <= 0) return "ยอดเงินต้องมากกว่า 0";
    if (!$("#f-first").value.trim() || !$("#f-last").value.trim()) return "กรุณากรอกชื่อและนามสกุล";
    const phone = $("#f-phone").value.replace(/\D/g, "");
    if ($("#f-phone").required && phone.length < 9) return "กรุณากรอกเบอร์โทรให้ถูกต้อง";
    if (opts.hasDelivery) {
      if (!deliveryVal()) return "กรุณาเลือกช่องทางการรับ";
      if (deliveryVal() === "post" && $("#f-address").value.trim().length < 15) return "กรุณากรอกที่อยู่สำหรับจัดส่งให้ครบถ้วน";
    }
    if (!slipFile) return "กรุณาแนบสลิปการโอนเงิน";
    return "";
  }
}
