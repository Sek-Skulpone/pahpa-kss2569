// สร้างรูปสรุปยอดร่วมทำบุญ (หลอดเทียบเป้าหมาย) สำหรับโพสต์ลง Facebook / LINE
// วาดบน canvas ล้วน ขนาด 1080×1080 (สี่เหลี่ยมจัตุรัส เห็นชัดบนมือถือ)
const QR = new URL("../../poster-qr/qr-donate.png", import.meta.url).href;
const W = 1080;
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

  // พื้นหลังเขียวไล่เฉด + กรอบทอง
  const bg = ctx.createLinearGradient(0, 0, 0, W);
  bg.addColorStop(0, "#0e6b45");
  bg.addColorStop(1, "#063d27");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, W);
  ctx.strokeStyle = "#d9a21b";
  ctx.lineWidth = 6;
  roundRect(ctx, 28, 28, W - 56, W - 56, 36);
  ctx.stroke();

  // หัวเรื่อง
  ctx.fillStyle = "#f6d66b";
  ctx.font = "400 38px Kanit";
  ctx.fillText("ขอเชิญร่วมทำบุญ", W / 2, 105);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.4)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = goldFill(ctx, 140, 100);
  fit(ctx, s.eventTitle || "", W - 160, 92, "500 {s}px Kanit");
  ctx.fillText(s.eventTitle || "", W / 2, 190);
  ctx.restore();
  ctx.fillStyle = "#e3f1e8";
  fit(ctx, s.eventSubtitle || "", W - 160, 38, "600 {s}px Sarabun");
  ctx.fillText(s.eventSubtitle || "", W / 2, 268);
  ctx.fillStyle = "#f6d66b";
  fit(ctx, s.eventPurpose || "", W - 160, 36, "600 {s}px Sarabun");
  ctx.fillText(s.eventPurpose || "", W / 2, 318);

  // แผงยอดเงิน
  const P = { x: 80, y: 360, w: W - 160, h: 455 };
  ctx.fillStyle = "#fffaf0";
  roundRect(ctx, P.x, P.y, P.w, P.h, 32);
  ctx.fill();

  const today = new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
  ctx.fillStyle = "#66736b";
  ctx.font = "600 34px Sarabun";
  ctx.fillText(`ยอดร่วมทำบุญ ณ วันที่ ${today}`, W / 2, P.y + 60);

  ctx.fillStyle = "#0b5d3b";
  fit(ctx, `${thb(d.raised)} บาท`, P.w - 80, 112, "500 {s}px Kanit");
  ctx.fillText(`${thb(d.raised)} บาท`, W / 2, P.y + 150);

  // หลอด
  const pct = d.goal > 0 ? (d.raised / d.goal) * 100 : 0;
  const B = { x: P.x + 50, y: P.y + 225, w: P.w - 100, h: 64 };
  ctx.fillStyle = "#e6f2ec";
  roundRect(ctx, B.x, B.y, B.w, B.h, B.h / 2);
  ctx.fill();
  const fw = Math.max(B.h, (B.w * Math.min(pct, 100)) / 100);
  if (pct > 0) {
    const g = ctx.createLinearGradient(B.x, 0, B.x + fw, 0);
    g.addColorStop(0, "#d9a21b");
    g.addColorStop(1, "#f0c24b");
    ctx.fillStyle = g;
    roundRect(ctx, B.x, B.y, fw, B.h, B.h / 2);
    ctx.fill();
  }
  ctx.fillStyle = "#063d27";
  ctx.font = "500 36px Kanit";
  ctx.fillText(`${pct.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`, W / 2, B.y + B.h / 2 + 2);

  ctx.font = "600 32px Sarabun";
  ctx.fillStyle = "#1f2a24";
  ctx.textAlign = "left";
  ctx.fillText(d.count ? `ผู้ร่วมทำบุญ ${thb(d.count)} รายการ` : "", B.x, B.y + 110);
  ctx.textAlign = "right";
  ctx.fillText(`เป้าหมาย ${thb(d.goal)} บาท`, B.x + B.w, B.y + 110);
  ctx.textAlign = "center";
  const left = d.goal - d.raised;
  ctx.fillStyle = "#b7791f";
  ctx.font = "500 32px Kanit";
  ctx.fillText(left > 0 ? `ยังขาดอีก ${thb(left)} บาท` : "🙏 ครบเป้าหมายแล้ว ขออนุโมทนาบุญ", W / 2, P.y + P.h - 45);

  // ส่วนท้าย: QR ร่วมทำบุญ
  const Q = { size: 180, x: W - 80 - 180, y: 850 };
  ctx.fillStyle = "#fff";
  roundRect(ctx, Q.x - 12, Q.y - 12, Q.size + 24, Q.size + 24, 18);
  ctx.fill();
  try {
    ctx.drawImage(await loadImg(QR), Q.x, Q.y, Q.size, Q.size);
  } catch {}
  ctx.textAlign = "left";
  ctx.fillStyle = "#f6d66b";
  ctx.font = "500 50px Kanit";
  ctx.fillText("สแกน QR เพื่อร่วมทำบุญ", 90, 895);
  ctx.fillStyle = "#e3f1e8";
  ctx.font = "600 34px Sarabun";
  ctx.fillText(s.eventDate || "", 90, 955);
  ctx.fillText(s.schoolName || "", 90, 1003);

  return c;
}
