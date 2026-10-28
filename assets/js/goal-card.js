// สร้างรูปสรุปยอดร่วมทำบุญ (หลอดเทียบเป้าหมาย) สำหรับโพสต์ลง Facebook / LINE
// วาดบน canvas ขนาด 1080×1080: ป้ายงานเต็มความกว้างด้านบน (มี QR ร่วมทำบุญอยู่ในป้ายแล้ว) + แผงหลอดยอดด้านล่าง
const BANNER = new URL("../img/event-banner.jpg", import.meta.url).href;
const W = 1080;
const BANNER_H = Math.round((W * 960) / 1706); // ป้ายงาน 1706×960
const GOLD = ["#fff7c2", "#f6d66b", "#d9a521"];

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fit(ctx, text, maxWidth, size, font) {
  let s = size;
  do {
    ctx.font = `${font.replace("{s}", s)}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    s -= 2;
  } while (s > 18);
}

function goldFill(ctx, y, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  GOLD.forEach((c, i) => g.addColorStop(i / (GOLD.length - 1), c));
  return g;
}

const thb = (n) => Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 });

/**
 * @param {{raised:number, goal:number, count?:number, pending?:number, settings:object}} d
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderGoalCard(d) {
  const s = d.settings;
  await Promise.all(["500 60px Kanit", "400 60px Kanit", "600 40px Sarabun"].map((f) => document.fonts.load(f, "กขค0123"))).catch(() => {});

  const c = document.createElement("canvas");
  c.width = c.height = W;
  const ctx = c.getContext("2d");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // พื้นหลังน้ำเงินเข้ม เข้ากับโทนป้ายงาน
  const bg = ctx.createLinearGradient(0, BANNER_H, 0, W);
  bg.addColorStop(0, "#1d2f9e");
  bg.addColorStop(1, "#0b1452");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, W);

  // ป้ายงาน (ถ้าโหลดไม่ได้ ใช้ชื่องานแทน)
  try {
    ctx.drawImage(await loadImg(BANNER), 0, 0, W, BANNER_H);
  } catch {
    ctx.fillStyle = goldFill(ctx, BANNER_H / 2 - 50, 100);
    fit(ctx, s.eventTitle || "", W - 160, 92, "500 {s}px Kanit");
    ctx.fillText(s.eventTitle || "", W / 2, BANNER_H / 2 - 30);
    ctx.fillStyle = "#e6ebff";
    fit(ctx, s.eventSubtitle || "", W - 160, 38, "600 {s}px Sarabun");
    ctx.fillText(s.eventSubtitle || "", W / 2, BANNER_H / 2 + 50);
  }
  // เส้นทองคั่น
  const line = ctx.createLinearGradient(0, 0, W, 0);
  line.addColorStop(0, "#d9a21b");
  line.addColorStop(0.5, "#fff1a8");
  line.addColorStop(1, "#d9a21b");
  ctx.fillStyle = line;
  ctx.fillRect(0, BANNER_H, W, 8);

  // แผงยอดเงิน
  const top = BANNER_H + 8;
  const today = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
  ctx.fillStyle = "#dfe5ff";
  ctx.font = "600 32px Sarabun";
  ctx.fillText(`🙏 ยอดร่วมทำบุญ ณ วันที่ ${today}`, W / 2, top + 48);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.45)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = goldFill(ctx, top + 80, 100);
  fit(ctx, `${thb(d.raised)} บาท`, W - 160, 100, "500 {s}px Kanit");
  ctx.fillText(`${thb(d.raised)} บาท`, W / 2, top + 130);
  ctx.restore();

  // หลอด
  const pct = d.goal > 0 ? (d.raised / d.goal) * 100 : 0;
  const B = { x: 70, y: top + 200, w: W - 140, h: 64 };
  ctx.fillStyle = "rgba(255,255,255,.16)";
  roundRect(ctx, B.x - 6, B.y - 6, B.w + 12, B.h + 12, (B.h + 12) / 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  roundRect(ctx, B.x, B.y, B.w, B.h, B.h / 2);
  ctx.fill();
  const fw = Math.max(B.h, (B.w * Math.min(pct, 100)) / 100);
  if (pct > 0) {
    const g = ctx.createLinearGradient(B.x, 0, B.x + fw, 0);
    g.addColorStop(0, "#e8318a");
    g.addColorStop(1, "#ffc93c");
    ctx.fillStyle = g;
    roundRect(ctx, B.x, B.y, fw, B.h, B.h / 2);
    ctx.fill();
  }
  ctx.fillStyle = "#0b1452";
  ctx.font = "500 36px Kanit";
  ctx.fillText(`${pct.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`, W / 2, B.y + B.h / 2 + 2);

  ctx.font = "600 32px Sarabun";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.fillText(d.count ? `ผู้ร่วมทำบุญ ${thb(d.count)} รายการ` : "", B.x, B.y + 108);
  ctx.textAlign = "right";
  ctx.fillText(`เป้าหมาย ${thb(d.goal)} บาท`, B.x + B.w, B.y + 108);
  ctx.textAlign = "center";

  const left = d.goal - d.raised;
  const msg = left > 0 ? "สแกน QR บนป้าย ร่วมทำบุญได้เลย 🙏" : "🙏 ครบเป้าหมายแล้ว ขออนุโมทนาบุญ";
  ctx.font = "500 32px Kanit";
  const pw = Math.min(W - 100, ctx.measureText(msg).width + 70);
  const py = W - 62;
  ctx.fillStyle = "#e8318a";
  roundRect(ctx, (W - pw) / 2, py - 32, pw, 64, 32);
  ctx.fill();
  ctx.fillStyle = "#fff";
  fit(ctx, msg, pw - 50, 32, "500 {s}px Kanit");
  ctx.fillText(msg, W / 2, py + 2);

  return c;
}
