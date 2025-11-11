# ระบบส่งไฟล์ BitTorrent แบบปลอดภัย

โครงการนี้เป็นชุดคำสั่ง CLI ที่พัฒนาบน Node.js สำหรับส่งไฟล์แบบส่วนตัวผ่านเครือข่าย BitTorrent โดยมีการเข้ารหัสแบบครบวงจร (End-to-End Encryption) เพื่อให้เครื่องปลายทางที่ได้รับอนุญาตเท่านั้นสามารถถอดรหัสและอ่านข้อมูลได้

## สถาปัตยกรรมโดยรวม
- `src/tracker` — ตัวติดตาม (Tracker) ส่วนตัว ทำหน้าที่จับคู่ peer และไม่เปิด DHT เพื่อลดการรั่วไหล
- `src/sender` — เครื่องฝั่งส่ง ทำหน้าที่เข้ารหัสไฟล์ สร้าง torrent และเผยแพร่ให้เครื่องปลายทาง
- `src/receiver` — เครื่องฝั่งรับ ดาวน์โหลดไฟล์เข้ารหัสและถอดรหัสเพื่อใช้งาน
- `src/crypto` — โมดูลจัดการคีย์ การเจรจาคีย์ร่วม (session key) และการเข้ารหัสแบบสตรีมผ่าน libsodium
- `docs/USAGE.md` — เอกสารขั้นตอนใช้งานโดยละเอียด และคำแนะนำด้านความปลอดภัย

## คุณสมบัติเด่น
- ใช้ `libsodium` สำหรับสร้างคู่กุญแจ (Curve25519) และเข้ารหัสข้อมูลแบบสตรีมด้วย `crypto_secretstream_xchacha20poly1305`
- Handshake Metadata (magnet, infoHash, header) ถูกเข้ารหัสอีกชั้นก่อนส่งไปยังผู้รับ
- รองรับการรันผ่าน `pm2` ตามเงื่อนไขผู้ใช้งาน เพื่อจัดการ process และดู log ได้สะดวก
- มี progress bar สวยงามสำหรับทั้งฝั่งส่งและรับ เห็นเปอร์เซ็นต์และความเร็วแบบเรียลไทม์
- มีชุดทดสอบพื้นฐานสำหรับโมดูลเข้ารหัสเพื่อความมั่นใจ

## การเตรียมระบบ
1. ติดตั้ง Node.js เวอร์ชัน 20 ขึ้นไป และติดตั้ง `pm2`
2. โคลนโปรเจ็กต์หรือดาวน์โหลดซอร์สโค้ดลงเครื่อง
3. ติดตั้ง dependencies

```bash
npm install
```

## การสร้างและจัดการคีย์
ต้องสร้างคีย์สำหรับเครื่องส่งและเครื่องรับอย่างน้อยอย่างละหนึ่งชุด (ทำครั้งแรกครั้งเดียว)

```bash
npm run keygen -- --alias sender
npm run keygen -- --alias receiver
```

- คีย์ที่สร้างจะถูกเก็บใน `config/keys.json` (ไฟล์ถูกตั้ง permission 600 เพื่อความปลอดภัย)
- ดูรายการคีย์ที่มีอยู่

```bash
npm run keygen -- --list
```

**หมายเหตุ:** ควรแลกเปลี่ยน `public key` ระหว่างเครื่องส่งและรับผ่านช่องทางที่ปลอดภัย เช่น Signal หรือออฟไลน์

## การรัน Tracker ส่วนตัว (กลาง)
```bash
pm2 start src/tracker/index.js --name secure-tracker -- --port 9000
pm2 logs secure-tracker --lines 50 --nostream
```

- ค่าเริ่มต้นเปิดเฉพาะ HTTP announce endpoint
- สามารถเปิด UDP หรือ WebSocket เพิ่มได้ผ่าน flag `--udp` หรือ `--websocket`
- โปรดตั้ง firewall จำกัดการเข้าถึงตาม IP ที่ไว้วางใจ

## ขั้นตอนฝั่งผู้ส่ง (Sender)
1. เตรียมไฟล์ที่ต้องการส่ง และทราบ `public key` ของผู้รับ
2. รันคำสั่ง (จำเป็นต้องระบุ path เป็นแบบ absolute ตามคำสั่งผู้ใช้)

```bash
pm2 start src/sender/index.js --name secure-sender -- \
  --file /ABSOLUTE/PATH/TO/SECRET.ZIP \
  --alias sender \
  --recipient-key <PUBLIC_KEY_RECEIVER> \
  --handshake-out /ABSOLUTE/PATH/TO/handshake.json
```

- โปรแกรมจะเข้ารหัสไฟล์และ seed ผ่าน WebTorrent โดยเชื่อมต่อกับ tracker ที่กำหนด
- เมื่อพร้อมจะสร้างไฟล์ handshake (JSON) เพื่อส่งให้ผู้รับ
- ตรวจสอบสถานะผ่าน

```bash
pm2 logs secure-sender --lines 50 --nostream
```

## ขั้นตอนฝั่งผู้รับ (Receiver)
1. รับไฟล์ `handshake.json` จากผู้ส่ง (ต้องเป็นช่องทางที่ปลอดภัย)
2. รันคำสั่ง

```bash
pm2 start src/receiver/index.js --name secure-receiver -- \
  --handshake /ABSOLUTE/PATH/TO/handshake.json \
  --alias receiver \
  --save /ABSOLUTE/PATH/TO/OUTPUT/DIR
```

- โปรแกรมจะดาวน์โหลดไฟล์เข้ารหัสแบบชั่วคราว แล้วถอดรหัสด้วย session key ที่ได้จาก handshake
- ผลลัพธ์ที่ถอดรหัสแล้วจะอยู่ในโฟลเดอร์ `--save`
- ตรวจสอบสถานะได้ที่

```bash
pm2 logs secure-receiver --lines 50 --nostream
```

## การทดสอบ
มีชุดทดสอบสำหรับโมดูล session crypto สามารถรันได้ด้วย

```bash
npm test
```

## แนวทางเสริมด้านความปลอดภัย
- ลบไฟล์ handshake และไฟล์เข้ารหัสชั่วคราวทันทีหลังใช้งานเสร็จ
- อัปเดต dependencies อย่างสม่ำเสมอ (`npm audit`)
- สร้างระบบ whitelist IP หรือ VPN สำหรับ tracker หากใช้งานในองค์กร
- พิจารณาเพิ่มการยืนยันตัวตนหลายปัจจัย (เช่น รหัสผ่านเสริมสำหรับ handshake)

## เอกสารเพิ่มเติม
รายละเอียดขั้นตอนแบบ step-by-step และคำแนะนำเพิ่มเติมอยู่ที่ `docs/USAGE.md` ซึ่งครอบคลุม:
- วิธีติดตั้ง
- การสร้าง/จัดการคีย์
- การรันแต่ละโมดูลด้วย pm2
- ทิปส์ด้านความปลอดภัยและการแก้ไขปัญหาทั่วไป

หากต้องการขยายระบบ เช่น ทำ GUI หรือเชื่อมต่อ REST API สามารถต่อยอดจากโครงสร้างปัจจุบันได้ทันที โดยใช้โมดูลใน `src/common` และ `src/crypto` ที่เตรียมไว้แล้ว

