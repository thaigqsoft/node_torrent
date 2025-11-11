## Secure BitTorrent File Transfer

เอกสารนี้อธิบายวิธีใช้งานระบบส่งไฟล์แบบเข้ารหัสผ่าน BitTorrent ที่สร้างขึ้นด้วย Node.js

### 1. ความต้องการเบื้องต้น
- Node.js 20+
- pm2 ติดตั้งแล้ว (ตามเงื่อนไขผู้ใช้)
- พอร์ตว่างสำหรับ tracker (ค่าปริยาย 9000)
- เครื่องรับและเครื่องส่งต้องแลก public key กันก่อน (ช่องทางปลอดภัย เช่น Signal)

### 2. การติดตั้งแพ็กเกจ
```bash
npm install
```

### 3. สร้างหรือดูคีย์
สร้างคีย์สำหรับเครื่องส่งหรือรับ (ครั้งเดียวเท่านั้น):
```bash
npm run keygen -- --alias sender
npm run keygen -- --alias receiver
```

ดูรายการคีย์ที่มี:
```bash
npm run keygen -- --list
```

ไฟล์คีย์เก็บที่ `config/keys.json` สิทธิ์ไฟล์ถูกจำกัดเป็น 600

### 4. รัน Tracker แบบ private
```bash
pm2 start src/tracker/index.js --name secure-tracker -- --port 9000
pm2 logs secure-tracker --lines 50 --nostream
```

Tracker เปิดเฉพาะ HTTP (ไม่มี DHT) เพื่อลดการรั่วไหลข้อมูลบนเครือข่ายสาธารณะ

### 5. ฝั่งส่งไฟล์ (Sender)
1. รับ public key ของผู้รับ (ฐาน 64)
2. รันคำสั่ง:
   ```bash
   pm2 start src/sender/index.js --name secure-sender -- \
     --file /ABSOLUTE/PATH/TO/SECRET.ZIP \
     --alias sender \
     --recipient-key <PUBLIC_KEY_RECEIVER> \
     --handshake-out /ABSOLUTE/PATH/TO/handshake.json
   ```
3. เมื่อ seeding พร้อม โปรแกรมจะสร้างไฟล์ handshake (`handshake.json`) ให้ส่งไฟล์นี้ไปยังผู้รับผ่านช่องทางปลอดภัย (ห้ามเผยแพร่สาธารณะ)
4. ตรวจสอบสถานะการอัปโหลดด้วย:
   ```bash
   pm2 logs secure-sender --lines 50 --nostream
   ```

### 6. ฝั่งรับไฟล์ (Receiver)
1. นำไฟล์ handshake จากผู้ส่งมาวางในเครื่อง
2. รันคำสั่ง:
   ```bash
   pm2 start src/receiver/index.js --name secure-receiver -- \
     --handshake /ABSOLUTE/PATH/TO/handshake.json \
     --alias receiver \
     --save /ABSOLUTE/PATH/TO/OUTPUT/DIR
   ```
3. เมื่อดาวน์โหลดเสร็จ ไฟล์จะถูกถอดรหัสและวางในโฟลเดอร์ `--save`
4. ตรวจสอบสถานะด้วย:
   ```bash
   pm2 logs secure-receiver --lines 50 --nostream
   ```

### 7. ความปลอดภัย
- ข้อมูล handshake ถูกเข้ารหัสด้วยคีย์ร่วมที่ได้จาก Curve25519 (ผ่าน libsodium)
- ไฟล์จริงถูกเข้ารหัสด้วย `crypto_secretstream_xchacha20poly1305` ก่อน seed
- หากมีผู้ไม่ได้รับอนุญาตเข้ามาดาวน์โหลด จะได้แต่ไฟล์เข้ารหัสและถอดรหัสไม่ได้
- Tracker ปิด DHT เพื่อลดการค้นหาแบบสาธารณะ

### 8. โครงสร้างไฟล์สำคัญ
```
src/
  sender/          CLI ฝั่งส่ง
  receiver/        CLI ฝั่งรับ
  tracker/         Tracker ส่วนกลาง
  crypto/          โมดูลเข้ารหัสและจัดการคีย์
  common/          ตัวช่วย (progress bar, logger, config)
scripts/
  keygen.js        สร้าง/แสดงคีย์
docs/
  USAGE.md         เอกสารนี้
```

### 9. การทดสอบ
ชุดทดสอบ crypto รันด้วย:
```bash
npm test
```

### 10. ข้อควรระวัง
- อย่าแชร์ไฟล์ handshake ผ่านช่องทางที่ไม่ปลอดภัย
- ลบไฟล์เข้ารหัสชั่วคราวในโฟลเดอร์ temp หากไม่ต้องการเก็บ
- ใช้ไฟร์วอลล์จำกัด IP ที่เข้าถึง tracker ได้
- อัปเดต dependencies เป็นระยะเพื่อลดช่องโหว่

