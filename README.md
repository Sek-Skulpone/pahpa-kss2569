# ระบบผ้าป่าเพื่อการศึกษา โคกสีวิทยาสรรค์ 2569

เว็บสำหรับ **ร่วมทำบุญออนไลน์ · สั่งจองเสื้อ · จองบัตรรำวง** ใช้ได้ดีบนมือถือและแท็บเล็ต
- คิดยอดเงินอัตโนมัติ (ราคา/ค่าส่งแก้ได้จากหน้าแอดมิน)
- แสดง QR พร้อมเพย์ให้สแกนจ่าย แล้วแนบสลิป ระบบจะบันทึกรายการลงฐานข้อมูล
- อ่าน QR บนสลิปอัตโนมัติ เพื่อ **กันการใช้สลิปซ้ำ**
- หน้าแอดมิน: สรุปยอดรวม, จำนวนเสื้อแยกไซส์, ตรวจสลิป, เปลี่ยนสถานะ, ส่งออก Excel (CSV), ตั้งค่าราคา/เปิด-ปิดรับ
- แจ้งเตือนรายการใหม่เข้า **LINE** (ผ่าน LINE Official Account + Google Apps Script)
- **สร้างป้ายขอบคุณอัตโนมัติ** สำหรับโพสต์ลงเพจโรงเรียน
- หน้า **รายนามผู้ร่วมทำบุญ** (แสดงเฉพาะผู้ที่ยินยอม และแอดมินตรวจสลิปแล้ว)

ไม่ต้องติดตั้งโปรแกรมหรือ build ใด ๆ เป็นไฟล์ HTML/JS ล้วน ใช้ Firebase แผนฟรี (Spark) ได้

| หน้า | ไฟล์ |
|---|---|
| หน้าหลัก | `index.html` |
| สั่งจองเสื้อ | `shirt.html` |
| จองบัตรรำวง | `ticket.html` |
| ร่วมทำบุญ | `donate.html` |
| รายนามผู้ร่วมทำบุญ | `donors.html` |
| แอดมิน (ลิงก์ลับ ไม่แสดงบนเว็บ) | `staff-49aacfdc.html#k=<คีย์>` (คีย์อยู่ใน Firestore: private/staffKey) |

---

## 1) ตั้งค่า Firebase

1. ไปที่ <https://console.firebase.google.com> → **Add project** (ปิด Google Analytics ได้)
2. **Build → Firestore Database → Create database** → เลือก location `asia-southeast1` (สิงคโปร์) → Production mode
3. **Build → Authentication → Get started** → เปิด **Google** (และ/หรือ **Email/Password**)
4. **Project settings (⚙️) → Your apps → Web (`</>`)** → ตั้งชื่อ → คัดลอกค่า `firebaseConfig` มาวางใน `assets/js/config.js`
5. **Firestore → Rules** → คัดลอกเนื้อหาไฟล์ `firestore.rules` ไปวาง
   แก้บรรทัด `"admin@example.com"` เป็นอีเมล Google ของเจ้าหน้าที่ (ใส่ได้หลายคน คั่นด้วย `,`) → **Publish**
6. **Authentication → Settings → Authorized domains** → เพิ่ม `<ชื่อ-github>.github.io`

> รูปสลิปและรูปผู้บริจาคถูกย่อขนาดแล้วเก็บใน Firestore โดยตรง จึง **ไม่ต้องใช้ Firebase Storage / ไม่ต้องผูกบัตรเครดิต**

## 2) เผยแพร่บน GitHub Pages

```bash
git remote add origin https://github.com/<ชื่อ-github>/pahpa-kss2569.git
git push -u origin main
```
จากนั้นใน GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / root** → Save
เว็บจะอยู่ที่ `https://<ชื่อ-github>.github.io/pahpa-kss2569/`

> นำลิงก์นี้ไปทำ QR Code ติดป้ายประชาสัมพันธ์ (เช่น ลิงก์ตรงไปหน้า `shirt.html` สำหรับป้ายสั่งเสื้อ)

## 3) แจ้งเตือน LINE

(LINE Notify ปิดบริการแล้วตั้งแต่ มี.ค. 2025 จึงใช้ LINE Messaging API แทน)

1. สร้าง LINE Official Account ที่ <https://manager.line.biz> → **Settings → Messaging API → Enable**
2. ที่ <https://developers.line.biz/console> → เลือก channel → แท็บ **Messaging API**
   - ออก **Channel access token (long-lived)** → คัดลอกไว้
   - เปิด **Allow bot to join group chats** (ใน LINE OA Manager → Settings → Response settings ปิด auto-reply ด้วย)
3. ไปที่ <https://script.google.com> → New project → วางโค้ดจาก `line/Code.gs`
   - เปลี่ยน `SHARED_KEY` ให้เป็นคำลับของเราเอง (และแก้ `LINE_NOTIFY_KEY` ใน `config.js` ให้ตรงกัน)
   - **Project Settings → Script properties** → เพิ่ม `LINE_TOKEN` = token จากข้อ 2
   - **Deploy → New deployment → Web app** → Execute as: *Me*, Who has access: *Anyone* → คัดลอก URL
4. ใส่ URL ใน `LINE_NOTIFY_URL` ของ `assets/js/config.js`
5. กลับไปที่ LINE Developers → **Webhook URL** = URL เดียวกัน → เปิด **Use webhook**
6. เชิญบอทเข้ากลุ่ม LINE ของคณะทำงาน แล้วพิมพ์ **`ลงทะเบียนแจ้งเตือน`** (พิมพ์ `ยกเลิกแจ้งเตือน` เพื่อหยุด)
7. ทดสอบ: ใน Apps Script เลือกฟังก์ชัน `testPush` → Run

> LINE OA แผนฟรีส่ง push ได้จำนวนจำกัดต่อเดือน (นับตามจำนวนผู้รับในกลุ่ม) หากรายการเยอะอาจต้องอัปเกรดแพ็กเกจ

## 4) ใช้งานหน้าแอดมิน

เปิด `staff-49aacfdc.html#k=<คีย์>` (คีย์อยู่ใน Firestore: private/staffKey) → เข้าสู่ระบบด้วยบัญชีที่อยู่ใน `firestore.rules`
- **ภาพรวม**: ยอดเงินที่ตรวจแล้ว/รอตรวจ, จำนวนเสื้อแยกไซส์ (ใช้สั่งโรงงาน), บัตรรำวง, รายการรอส่ง
- **เสื้อ / บัตรรำวง / บริจาค**: แตะรายการเพื่อดูสลิป → กด ✓ ยืนยันชำระแล้ว / 📦 ส่งมอบแล้ว / ✕ ไม่ผ่าน
  ช่อง "บันทึกของเจ้าหน้าที่" ใช้จดเลขพัสดุได้
- **บริจาค → 🖼️ สร้างป้ายขอบคุณ**: ได้รูป 2246×1134 จากแบบใน Canva (ลิงค์ป้ายขอบคุณ.txt) — ถ้าแก้แบบใน Canva ต้อง export ใหม่ทับ assets/img/thanks-bg.jpg (ตำแหน่งรูป/ชื่อ/ยอดเงิน อยู่ต้นไฟล์ thanks-card.js)
- **ตั้งค่า**: แก้ราคา ค่าส่ง เบอร์โทรผู้ประสานงาน เปิด/ปิดรับรายการ (มีผลทันทีไม่ต้องแก้โค้ด)
- เปิดหน้าแอดมินค้างไว้บนแท็บเล็ต จะมีเสียงเตือนเมื่อมีรายการใหม่

## หมายเหตุ

- QR ที่ใช้เป็น QR คงที่ ระบบ **ยืนยันการโอนเงินกับธนาคารเองไม่ได้** เจ้าหน้าที่ต้องตรวจสลิปกับยอดเข้าบัญชี
  (ถ้าต้องการตรวจอัตโนมัติ ต่อบริการตรวจสลิปแบบเสียเงิน เช่น SlipOK / EasySlip เพิ่มได้ภายหลัง)
- ทดสอบในเครื่อง: `python -m http.server 8000` แล้วเปิด <http://localhost:8000>
