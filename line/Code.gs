/**
 * แจ้งเตือนรายการสั่งจอง/บริจาคใหม่เข้า LINE (ผ่าน LINE Messaging API)
 * วิธีติดตั้งดูใน README.md หัวข้อ "แจ้งเตือน LINE"
 *
 * Script properties ที่ต้องตั้ง (Project Settings > Script properties):
 *   LINE_TOKEN  = Channel access token (long-lived) ของ LINE Official Account
 */

// ต้องตรงกับ LINE_NOTIFY_KEY ใน assets/js/config.js
const SHARED_KEY = 'change-me-kss2569';

const props = PropertiesService.getScriptProperties();

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse(e.postData.contents || '{}');
  } catch (err) {
    return out({ ok: false });
  }

  // 1) Webhook จาก LINE (มีคนพิมพ์ในกลุ่ม/แชท)
  if (Array.isArray(body.events)) {
    body.events.forEach(handleLineEvent);
    return out({ ok: true });
  }

  // 2) แจ้งเตือนจากหน้าเว็บ
  if (body.kind === 'order' && body.key === SHARED_KEY) {
    const cache = CacheService.getScriptCache();
    const code = String(body.code || '').slice(0, 40);
    if (code && cache.get('sent_' + code)) return out({ ok: true, dup: true });
    if (code) cache.put('sent_' + code, '1', 21600);
    if (!rateLimitOk(cache)) return out({ ok: false, error: 'rate' });
    pushToAll(String(body.message || '').slice(0, 2000));
    return out({ ok: true });
  }
  return out({ ok: false });
}

function doGet() {
  return out({ ok: true, targets: getTargets().length });
}

function handleLineEvent(ev) {
  const src = ev.source || {};
  const id = src.groupId || src.roomId || src.userId;
  if (ev.type === 'join' || ev.type === 'follow') {
    reply(ev.replyToken, 'สวัสดีครับ 🙏\nพิมพ์ "ลงทะเบียนแจ้งเตือน" เพื่อรับแจ้งเตือนรายการสั่งจองและบริจาคในแชทนี้');
    return;
  }
  if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;
  const text = ev.message.text.trim();
  if (text === 'ลงทะเบียนแจ้งเตือน') {
    const t = getTargets();
    if (t.indexOf(id) < 0) t.push(id);
    saveTargets(t);
    reply(ev.replyToken, '✅ ลงทะเบียนรับแจ้งเตือนแล้ว\nเมื่อมีรายการใหม่จะแจ้งในแชทนี้');
  } else if (text === 'ยกเลิกแจ้งเตือน') {
    saveTargets(getTargets().filter(function (x) { return x !== id; }));
    reply(ev.replyToken, '❎ ยกเลิกการแจ้งเตือนในแชทนี้แล้ว');
  }
}

function getTargets() {
  try {
    return JSON.parse(props.getProperty('TARGETS') || '[]');
  } catch (e) {
    return [];
  }
}
function saveTargets(t) {
  props.setProperty('TARGETS', JSON.stringify(t));
}

// จำกัดไม่เกิน 60 ข้อความ/ชั่วโมง กันคนยิงสแปม
function rateLimitOk(cache) {
  const key = 'rate_' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMddHH');
  const n = Number(cache.get(key) || 0);
  if (n >= 60) return false;
  cache.put(key, String(n + 1), 3700);
  return true;
}

function pushToAll(text) {
  getTargets().forEach(function (to) {
    callLine('push', { to: to, messages: [{ type: 'text', text: text }] });
  });
}

function reply(token, text) {
  if (!token) return;
  callLine('reply', { replyToken: token, messages: [{ type: 'text', text: text }] });
}

function callLine(path, payload) {
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/' + path, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + props.getProperty('LINE_TOKEN') },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) console.warn(path, res.getResponseCode(), res.getContentText());
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ใช้ทดสอบจากหน้า Apps Script: เลือกฟังก์ชันนี้แล้วกด Run
function testPush() {
  pushToAll('🔔 ทดสอบการแจ้งเตือนจากระบบผ้าป่า kss2569');
}
