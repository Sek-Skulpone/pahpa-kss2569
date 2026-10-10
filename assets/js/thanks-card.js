// สร้างป้ายขอบคุณผู้ร่วมทำบุญ จากพื้นหลังที่ออกแบบใน Canva (ไฟล์ ลิงค์ป้ายขอบคุณ.txt)
// ตำแหน่งด้านล่างวัดจากภาพพื้นหลังขนาด 2246×1134
const BG = new URL("../img/thanks-bg.jpg", import.meta.url).href;
const PHOTO = { x: 608, y: 513, r: 306 };
const NAME_BAR = { x: 1561, y: 563, w: 840, h: 135 };
const AMOUNT = { x: 1628, y: 876, w: 172 };

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fitText(ctx, text, maxWidth, size, weight = "500", family = "Kanit") {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    s -= 2;
  } while (s > 20);
  return s;
}

/**
 * @param {{name:string, subtitle?:string, amount?:number, showAmount?:boolean, photo?:string, settings:object}} d
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderThanksCard(d) {
  await Promise.all([
    document.fonts.load("500 60px Kanit"),
    document.fonts.load("400 36px Sarabun"),
  ]).catch(() => {});

  const bg = await loadImg(BG);
  const c = document.createElement("canvas");
  c.width = bg.width;
  c.height = bg.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(bg, 0, 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // รูปผู้ร่วมทำบุญ ทับวงกลมตัวอย่าง (ไม่มีรูป = พื้นขาวนวล)
  ctx.save();
  ctx.beginPath();
  ctx.arc(PHOTO.x, PHOTO.y, PHOTO.r, 0, Math.PI * 2);
  ctx.clip();
  let drawn = false;
  if (d.photo) {
    try {
      const img = await loadImg(d.photo);
      const size = 2 * PHOTO.r;
      const sc = Math.max(size / img.width, size / img.height);
      const iw = img.width * sc;
      const ih = img.height * sc;
      ctx.drawImage(img, PHOTO.x - iw / 2, PHOTO.y - ih / 2, iw, ih);
      drawn = true;
    } catch {}
  }
  if (!drawn) {
    ctx.fillStyle = "#fff8e6";
    ctx.fillRect(PHOTO.x - PHOTO.r, PHOTO.y - PHOTO.r, 2 * PHOTO.r, 2 * PHOTO.r);
    ctx.fillStyle = "#c9a227";
    ctx.font = "500 64px Kanit";
    ctx.fillText("ขอบคุณ", PHOTO.x, PHOTO.y);
  }
  ctx.restore();

  // ชื่อ (และบรรทัดรอง) ในแถบสีเขียว
  ctx.fillStyle = "#fff6c8";
  if (d.subtitle) {
    fitText(ctx, d.name, NAME_BAR.w, 66);
    ctx.fillText(d.name, NAME_BAR.x, NAME_BAR.y - 20);
    ctx.fillStyle = "#e3f1e8";
    fitText(ctx, d.subtitle, NAME_BAR.w, 34, "400", "Sarabun");
    ctx.fillText(d.subtitle, NAME_BAR.x, NAME_BAR.y + 40);
  } else {
    fitText(ctx, d.name, NAME_BAR.w, 78);
    ctx.fillText(d.name, NAME_BAR.x, NAME_BAR.y + 4);
  }

  // ยอดเงิน ในช่องว่างระหว่าง "จำนวนเงิน" กับ "บาท"
  if (d.showAmount !== false && d.amount) {
    const txt = Number(d.amount).toLocaleString("th-TH");
    ctx.fillStyle = "#0b4a2e";
    fitText(ctx, txt, AMOUNT.w, 60);
    ctx.fillText(txt, AMOUNT.x, AMOUNT.y + 2);
  }

  return c;
}

export function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, "image/jpeg", 0.92);
}
