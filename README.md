# Seito's bot Console

A SillyTavern UI extension with character status, relationship tracking, phone messages, missions, appointments, an in-chat shop, and customizable themes. It includes a Honkai Impact 3rd profile and a general profile.

## Install

1. Make sure Git is installed.
2. In SillyTavern, open **Extensions → Install Extension**.
3. Paste this repository URL:

   `https://github.com/Seito2006/bot-console`

SillyTavern downloads and loads the extension. Restart SillyTavern if it does not appear.

Some AI-assisted features need an API provider configured in the extension settings. The extension supports Google AI Studio, OpenRouter, and custom OpenAI-compatible endpoints. Add your own API key in SillyTavern; never commit a key to this repository.

## ภาษาไทย

Extension สำหรับ SillyTavern ที่เพิ่มหน้าต่าง Bot Console สำหรับดูสถานะตัวละคร ความสัมพันธ์ ข้อความในโทรศัพท์ ภารกิจ นัดหมาย ร้านค้าในแชต และปรับแต่งธีม มีโปรไฟล์สำหรับ Honkai Impact 3rd และโปรไฟล์ทั่วไป

### วิธีติดตั้ง

1. ติดตั้ง Git ไว้ในเครื่องก่อน
2. ใน SillyTavern เปิด **Extensions → Install Extension**
3. วาง URL นี้ แล้วกดติดตั้ง:

   `https://github.com/Seito2006/bot-console`

SillyTavern จะดาวน์โหลดและโหลด Extension ให้ หากยังไม่แสดง ให้เริ่ม SillyTavern ใหม่

ฟีเจอร์ที่ใช้ AI ต้องตั้งค่าผู้ให้บริการในหน้าตั้งค่าของ Extension รองรับ Google AI Studio, OpenRouter และ endpoint แบบ OpenAI-compatible โดยผู้ใช้ต้องใส่ API key ของตนเอง และไม่ควรนำ key ไปใส่ใน repository

### เลเวลบัญชีและการอัปเดต

- ภารกิจที่สำเร็จให้ EXP ตามความยาก แชทกับ HI3 Rpg และการขึ้นเลเวลให้ Point เลเวล แต้ม ธีม และวอลเปเปอร์ของแต่ละธีมถูกเก็บบนเซิร์ฟเวอร์ SillyTavern แยกตามบัญชี จึงตรงกันทุกอุปกรณ์ที่เข้าเซิร์ฟเวอร์เดียวกัน (ตำแหน่ง ขนาด และการล็อกปุ่มยังแยกตามเครื่อง)
- Bot Console จะแจ้งเมื่อสาขาที่ติดตั้งผ่าน Git มีการเปลี่ยนแปลงบน GitHub ของโครงการ หลังจากกด **อัปเดต** รายการเปลี่ยนแปลงจะแสดงหนึ่งครั้งเมื่อการติดตั้งเสร็จ แล้วกด **โหลดหน้าใหม่** เพื่อใช้รุ่นล่าสุด ผู้เผยแพร่เพิ่มรายการของแต่ละเวอร์ชันใน `changelog.json`

### แนบไฟล์อัปเดตบอท

วางการ์ดที่ส่งออกจาก SillyTavern แบบ PNG หรือ JSON ใน `bots/hi3/` หรือ `bots/hsr/` แล้วเพิ่มรายการของแต่ละบอทใน `bot-update.json` ที่อยู่ข้าง `manifest.json` ตัวอย่างสำหรับผู้เผยแพร่

```json
[
  { "name": "HI3 Rpg", "version": "2.0.3", "folder": "hi3", "file": "HI3 Rpg.json", "cover": "HI3 Rpg.png", "lorebook": "Honkai 3 LB.json" },
  { "name": "Honkai Star Rail Rpg", "version": "1.0.0", "folder": "hsr", "file": "Honkai Star Rail Rpg.json", "lorebook": "HSR LB.json" }
]
```

ตั้งชื่อให้ตรงกับชื่อในการ์ดและเพิ่มเลข version ของบอทตัวนั้นเมื่อปล่อยชุดไฟล์ใหม่ การ์ดรุ่นแรกที่ไม่มีเลขรุ่นและการ์ดที่มีเลขรุ่นเก่ากว่าจะได้รับแจ้งอัปเดต หรือเปิด **ตั้งค่า → ทั่วไป** เพื่อเลือกชุดอัปเดตที่มี หากพบการ์ดชื่อตรงกันหลายใบ ให้ผู้เล่นเปิดแชทของการ์ดที่จะอัปเดต ป็อปอัปจะแสดงชื่อไฟล์เป้าหมายก่อนยืนยัน ระบบเขียนการ์ดทับชื่อไฟล์เดิมและเก็บแชทเดิมไว้ การ์ดแบบ PNG จะอัปเดตรูปด้วย ส่วน JSON จะใช้รูป cover หากกำหนดไว้

## Troubleshooting

- **Console button not showing** – the button appears in chats with `HI3 Rpg` or `Honkai Star Rail Rpg` by default. Open **Extensions → Seito's bot Console** and turn on *show in every chat* for other bots. The panel there also tells you why the button is hidden. *Settings → Reset button* restores its position and size.
- **Premium key on several devices** – the key is not tied to a device. Devices that share one SillyTavern server and user account pick it up automatically; separate SillyTavern installs each need the key entered once.

### แก้ปัญหาเบื้องต้น

- **ไม่เห็นปุ่มคอนโซล** – ปุ่มจะแสดงในแชทของ `HI3 Rpg` และ `Honkai Star Rail Rpg` โดยอัตโนมัติ สำหรับบอทอื่นให้เปิด **Extensions → Seito's bot Console** แล้วเปิดสวิตช์แสดงในทุกแชท ตรงนั้นบอกด้วยว่าปุ่มถูกซ่อนเพราะอะไร ส่วน ตั้งค่า → รีเซ็ตตำแหน่งและขนาดปุ่ม จะดึงปุ่มกลับมาที่เดิม
- **รหัส Premium หลายเครื่อง** – รหัสไม่ผูกกับเครื่อง เครื่องที่ใช้เซิร์ฟเวอร์และบัญชีผู้ใช้ SillyTavern เดียวกันจะได้รหัสเอง ส่วนเครื่องที่รัน SillyTavern แยกกันต้องใส่รหัสเครื่องละครั้ง

## License

No license file is included in this repository.
