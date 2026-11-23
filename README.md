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

- ภารกิจที่สำเร็จให้ EXP ตามความยาก แชทกับ HI3 Rpg และการขึ้นเลเวลให้ Point เบราว์เซอร์เก็บเลเวลและแต้มแยกตามบัญชี SillyTavern
- Bot Console จะแจ้งเมื่อสาขาที่ติดตั้งผ่าน Git มีการเปลี่ยนแปลงบน GitHub ของโครงการ หลังจากกด **อัปเดต** รายการเปลี่ยนแปลงจะแสดงหนึ่งครั้งเมื่อการติดตั้งเสร็จ แล้วกด **โหลดหน้าใหม่** เพื่อใช้รุ่นล่าสุด ผู้เผยแพร่เพิ่มรายการของแต่ละเวอร์ชันใน `changelog.json`

### แนบไฟล์อัปเดตบอท

วางการ์ดที่ส่งออกจาก SillyTavern แบบ PNG หรือ JSON ในโฟลเดอร์ `bots/` แล้วกำหนดชื่อ เวอร์ชัน และชื่อไฟล์ใน `bot-update.json` ที่อยู่ข้าง `manifest.json` ตัวอย่างสำหรับผู้เผยแพร่

```json
{ "name": "HI3 Rpg", "version": "2.0.0", "file": "HI3 Rpg.png" }
```

ตั้งชื่อให้ตรงกับชื่อในการ์ด และเพิ่มเลขเวอร์ชันบอทเมื่อปล่อยไฟล์ใหม่ หากพบการ์ดชื่อตรงกันหลายใบ ให้ผู้เล่นเปิดแชทของการ์ดที่จะอัปเดต ป็อปอัปจะแสดงชื่อไฟล์เป้าหมายก่อนยืนยัน ระบบเขียนการ์ดทับชื่อไฟล์เดิมและเก็บแชทเดิมไว้ การ์ดแบบ PNG จะอัปเดตรูปด้วย ส่วน JSON จะใช้รูปที่ติดตั้งอยู่

## Troubleshooting

- **Console button not showing** – the button only appears in chats with the bot named `HI3 Rpg` (change `REQUIRED_NAME` in `profiles.js`, or leave it empty to allow every bot). Alternatively open **Extensions → Seito's bot Console** and turn on *show in every chat*. The panel there also tells you why the button is hidden. *Settings → Reset button* restores its position and size.
- **Premium key on several devices** – the key is not tied to a device. Devices that share one SillyTavern server and user account pick it up automatically; separate SillyTavern installs each need the key entered once.

### แก้ปัญหาเบื้องต้น

- **ไม่เห็นปุ่มคอนโซล** – ปุ่มจะแสดงเฉพาะแชทของบอทชื่อ `HI3 Rpg` (แก้ชื่อที่ `REQUIRED_NAME` ใน `profiles.js` หรือเว้นว่างเพื่อให้ทุกบอทใช้ได้) หรือเปิด **Extensions → Seito's bot Console** แล้วเปิดสวิตช์แสดงในทุกแชท ตรงนั้นบอกด้วยว่าปุ่มถูกซ่อนเพราะอะไร ส่วน ตั้งค่า → รีเซ็ตตำแหน่งและขนาดปุ่ม จะดึงปุ่มกลับมาที่เดิม
- **รหัส Premium หลายเครื่อง** – รหัสไม่ผูกกับเครื่อง เครื่องที่ใช้เซิร์ฟเวอร์และบัญชีผู้ใช้ SillyTavern เดียวกันจะได้รหัสเอง ส่วนเครื่องที่รัน SillyTavern แยกกันต้องใส่รหัสเครื่องละครั้ง

## License

No license file is included in this repository.
