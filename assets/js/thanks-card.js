// สร้างป้ายขอบคุณผู้ร่วมทำบุญ จากพื้นหลังที่ออกแบบใน Canva (ไฟล์ ลิงค์ป้ายขอบคุณ.txt)
// ตำแหน่งด้านล่างวัดจากภาพพื้นหลังขนาด 2246×1134
const BG = new URL("../img/thanks-bg.jpg", import.meta.url).href;
const PHOTO = { x: 608, y: 513, r: 306 };
const NAME_BAR = { x: 1561, y: 500, w: 840, h: 143 };
const AMOUNT = { x: 1630, y: 790, w: 172 };

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

// ฟอนต์ไทยจาก Google Fonts (ต้องมีลิงก์โหลดในหน้า staff)
const FONTS = {
  name: { family: "Chonburi", weight: "400" },
  sub: { family: "Mitr", weight: "400" },
  amount: { family: "Chonburi", weight: "400" },
};

// ตัวอักษรสีทองไล่เฉด มีเงา
function goldText(ctx, text, x, y, size) {
  const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  g.addColorStop(0, "#fff7c2");
  g.addColorStop(0.45, "#f6d66b");
  g.addColorStop(1, "#d9a521");
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.45)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = g;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * @param {{name:string, subtitle?:string, amount?:number, showAmount?:boolean, photo?:string, settings:object, fonts?:object}} d
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderThanksCard(d) {
  const F = { ...FONTS, ...d.fonts };
  await Promise.all(
    [...Object.values(F), { family: "Kanit", weight: "500" }].map((f) => document.fonts.load(`${f.weight} 60px "${f.family}"`, "กขค0123"))
  ).catch(() => {});

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
    ctx.font = `${F.name.weight} 80px "${F.name.family}"`;
    ctx.fillText("ขอบคุณ", PHOTO.x, PHOTO.y);
  }
  ctx.restore();

  // ชื่อ (และบรรทัดรอง) ในแถบสีเขียว
  if (d.subtitle) {
    const sz = fitText(ctx, d.name, NAME_BAR.w, 70, F.name.weight, `"${F.name.family}"`);
    goldText(ctx, d.name, NAME_BAR.x, NAME_BAR.y - 18, sz);
    ctx.fillStyle = "#e3f1e8";
    fitText(ctx, d.subtitle, NAME_BAR.w, 32, F.sub.weight, `"${F.sub.family}"`);
    ctx.fillText(d.subtitle, NAME_BAR.x, NAME_BAR.y + 44);
  } else {
    const sz = fitText(ctx, d.name, NAME_BAR.w, 84, F.name.weight, `"${F.name.family}"`);
    goldText(ctx, d.name, NAME_BAR.x, NAME_BAR.y, sz);
  }

  // ยอดเงิน ในช่องว่างระหว่าง "จำนวนเงิน" กับ "บาท"
  if (d.showAmount !== false && d.amount) {
    const txt = Number(d.amount).toLocaleString("th-TH");
    ctx.fillStyle = "#0b4a2e";
    fitText(ctx, txt, AMOUNT.w, 54, F.amount.weight, `"${F.amount.family}"`);
    ctx.fillText(txt, AMOUNT.x, AMOUNT.y + 4);
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
