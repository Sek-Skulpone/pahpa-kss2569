// สร้างป้ายขอบคุณผู้ร่วมทำบุญ (1080×1350 เหมาะกับโพสต์ Facebook)
const W = 1080;
const H = 1350;
const GOLD = "#e7b52c";
const GOLD_LIGHT = "#f8dc84";

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

function flower(ctx, x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.55, r * 0.22, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = "#fff8e0";
  ctx.fill();
  ctx.restore();
}

function ornamentLine(ctx, cx, y, half) {
  ctx.save();
  const g = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
  g.addColorStop(0, "rgba(231,181,44,0)");
  g.addColorStop(0.5, GOLD);
  g.addColorStop(1, "rgba(231,181,44,0)");
  ctx.strokeStyle = g;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - half, y);
  ctx.lineTo(cx + half, y);
  ctx.stroke();
  ctx.translate(cx, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = GOLD;
  ctx.fillRect(-9, -9, 18, 18);
  ctx.restore();
}

/**
 * @param {{name:string, subtitle?:string, amount?:number, showAmount?:boolean, photo?:string, settings:object}} d
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderThanksCard(d) {
  await Promise.all([
    document.fonts.load("500 60px Kanit"),
    document.fonts.load("400 40px Kanit"),
    document.fonts.load("400 36px Sarabun"),
  ]).catch(() => {});

  const s = d.settings;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // พื้นหลัง
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0d6b45");
  bg.addColorStop(0.55, "#0a5236");
  bg.addColorStop(1, "#05311f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, 560, 50, W / 2, 560, 620);
  glow.addColorStop(0, "rgba(248,220,132,.28)");
  glow.addColorStop(1, "rgba(248,220,132,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ลายดอกจาง ๆ
  ctx.globalAlpha = 0.07;
  for (let y = 60; y < H; y += 150) {
    for (let x = (y / 150) % 2 ? 60 : 135; x < W; x += 150) flower(ctx, x, y, 40, GOLD_LIGHT);
  }
  ctx.globalAlpha = 1;

  // กรอบทอง
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 6;
  ctx.strokeRect(30, 30, W - 60, H - 60);
  ctx.lineWidth = 2;
  ctx.strokeRect(44, 44, W - 88, H - 88);
  [[44, 44], [W - 44, 44], [44, H - 44], [W - 44, H - 44]].forEach(([x, y]) => flower(ctx, x, y, 34, GOLD));

  // หัวเรื่อง
  ctx.fillStyle = GOLD_LIGHT;
  ctx.font = "500 92px Kanit";
  ctx.fillText("ขอขอบพระคุณ", W / 2, 170);
  ctx.fillStyle = "#fff";
  ctx.font = "400 40px Kanit";
  ctx.fillText("ผู้ร่วมทำบุญ " + (s.eventTitle || "ผ้าป่าเพื่อการศึกษา"), W / 2, 232);
  ornamentLine(ctx, W / 2, 268, 300);

  // รูป
  const cy = 520;
  const r = 205;
  ctx.save();
  ctx.beginPath();
  ctx.arc(W / 2, cy, r + 16, 0, Math.PI * 2);
  const ring = ctx.createLinearGradient(W / 2 - r, cy - r, W / 2 + r, cy + r);
  ring.addColorStop(0, GOLD_LIGHT);
  ring.addColorStop(0.5, GOLD);
  ring.addColorStop(1, "#b9861a");
  ctx.fillStyle = ring;
  ctx.shadowColor = "rgba(0,0,0,.35)";
  ctx.shadowBlur = 30;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(W / 2, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (d.photo) {
    try {
      const img = await loadImg(d.photo);
      const sc = Math.max((2 * r) / img.width, (2 * r) / img.height);
      const iw = img.width * sc;
      const ih = img.height * sc;
      ctx.drawImage(img, W / 2 - iw / 2, cy - ih / 2, iw, ih);
    } catch {
      d.photo = null;
    }
  }
  if (!d.photo) {
    ctx.fillStyle = "#fff8e6";
    ctx.fillRect(W / 2 - r, cy - r, 2 * r, 2 * r);
    flower(ctx, W / 2, cy, 150, GOLD);
  }
  ctx.restore();

  // ชื่อ
  let y = 820;
  ctx.fillStyle = "#fff";
  fitText(ctx, d.name, 900, 70);
  ctx.fillText(d.name, W / 2, y);

  if (d.subtitle) {
    y += 58;
    ctx.fillStyle = "#d8eadf";
    fitText(ctx, d.subtitle, 880, 36, "400", "Sarabun");
    ctx.fillText(d.subtitle, W / 2, y);
  }

  // ยอดเงิน
  if (d.showAmount !== false && d.amount) {
    y += 95;
    const txt = `ร่วมทำบุญ ${Number(d.amount).toLocaleString("th-TH")} บาท`;
    ctx.font = "500 50px Kanit";
    const tw = ctx.measureText(txt).width + 90;
    const bh = 86;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.roundRect(W / 2 - tw / 2, y - bh + 24, tw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = "#063d27";
    ctx.fillText(txt, W / 2, y);
  }

  // รายละเอียดงาน
  ornamentLine(ctx, W / 2, 1090, 360);
  ctx.fillStyle = GOLD_LIGHT;
  fitText(ctx, s.eventSubtitle || "", 920, 38, "400");
  ctx.fillText(s.eventSubtitle || "", W / 2, 1150);
  ctx.fillStyle = "#e8f3ec";
  const line2 = [s.eventPurpose, s.eventDate].filter(Boolean).join("  •  ");
  fitText(ctx, line2, 920, 32, "400", "Sarabun");
  ctx.fillText(line2, W / 2, 1203);
  ctx.fillStyle = "#fff";
  ctx.font = "500 36px Kanit";
  ctx.fillText(s.schoolName || "", W / 2, 1262);

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
