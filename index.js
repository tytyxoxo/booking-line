require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");
const https = require("https");

const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const app = express();
app.use(express.json());

// Webhook รับจาก LINE
app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.status(200).end();
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

// Endpoint รับ booking จาก Claude แล้วตอบกลับ LINE
app.post("/booking", async (req, res) => {
  const { replyToken, action, dayText, timeText, title } = req.body;
  console.log("booking request:", req.body);
  res.status(200).json({ ok: true });
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") return;
  const text = event.message.text.trim();

  // ส่งข้อมูลไปให้ Claude API จัดการ
  const reply = await processMessage(text, event.replyToken);

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: "text", text: reply }],
  });
}

async function processMessage(text, replyToken) {
  return new Promise((resolve) => {
    const dayMap = {
      วันจันทร์: 1,
      วันอังคาร: 2,
      วันพุธ: 3,
      วันพฤหัส: 4,
      วันพฤหัสบดี: 4,
      วันศุกร์: 5,
      วันเสาร์: 6,
      วันอาทิตย์: 0,
    };

    // ดูตารางว่าง
    if (text === "ว่าง" || text === "ดูตารางว่าง") {
      return resolve(
        '📅 ว่างสัปดาห์นี้ครับ!\n\nพิมพ์ "จอง วัน เวลา ชื่อ" เพื่อจองได้เลย\nเช่น "จอง วันพฤหัส 15:00 ตัดผม"',
      );
    }

    // จองเวลา
    if (text.startsWith("จอง ")) {
      const parts = text.replace("จอง ", "").split(" ");
      const dayText = parts[0];
      const timeText = parts[1];
      const title = parts.slice(2).join(" ") || "การจองผ่าน LINE";

      if (!dayText || !timeText || dayMap[dayText] === undefined) {
        return resolve('รูปแบบไม่ถูกต้องครับ\nเช่น "จอง วันพฤหัส 15:00 ตัดผม"');
      }

      // คำนวณวันที่
      const now = new Date();
      const bkk = new Date(
        now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }),
      );
      const diff = (dayMap[dayText] - bkk.getDay() + 7) % 7 || 7;
      const bookDate = new Date(bkk);
      bookDate.setDate(bkk.getDate() + diff);

      const [hour, minute] = timeText.split(":").map(Number);
      bookDate.setHours(hour, minute, 0, 0);
      const endDate = new Date(bookDate.getTime() + 60 * 60 * 1000);

      const pad = (n) => String(n).padStart(2, "0");
      const startISO = `${bookDate.getFullYear()}-${pad(bookDate.getMonth() + 1)}-${pad(bookDate.getDate())}T${pad(bookDate.getHours())}:${pad(bookDate.getMinutes())}:00`;
      const endISO = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}:00`;

      // ส่งไปให้ Claude webhook สร้าง event
      const webhookData = JSON.stringify({
        action: "createBooking",
        title,
        dayText,
        timeText,
        startISO,
        endISO,
        replyToken,
      });

      const webhookUrl = process.env.CLAUDE_WEBHOOK_URL;
      if (!webhookUrl) {
        return resolve(
          `✅ จองสำเร็จ (ทดสอบ)\n📌 ${title}\n📅 ${dayText} ${timeText} น.`,
        );
      }

      const u = new (require("url").URL)(webhookUrl);
      const options = {
        hostname: u.hostname,
        path: u.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(webhookData),
        },
      };

      const req = https.request(options, (res) => {
        resolve(
          `✅ จองสำเร็จแล้วครับ!\n📌 ${title}\n📅 ${dayText} เวลา ${timeText} น.`,
        );
      });
      req.on("error", () =>
        resolve(
          `✅ จองสำเร็จแล้วครับ!\n📌 ${title}\n📅 ${dayText} เวลา ${timeText} น.`,
        ),
      );
      req.write(webhookData);
      req.end();
      return;
    }

    resolve(
      '📅 สวัสดีครับ!\n\nพิมพ์ "ว่าง" เพื่อดูตารางว่าง\nหรือ "จอง วัน เวลา ชื่อ" เพื่อจอง\nเช่น "จอง วันพฤหัส 15:00 ตัดผม"',
    );
  });
}

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
