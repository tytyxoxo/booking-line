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

app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.status(200).end();
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") return;
  const text = event.message.text.trim();

  const reply = await askClaude(text);

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: "text", text: reply }],
  });
}

async function askClaude(userMessage) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `คุณเป็น assistant ช่วยรับจอง ตอบเป็นภาษาไทยสั้นๆ
วันนี้คือ ${new Date().toLocaleDateString("th-TH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
ถ้าผู้ใช้ถามดูตารางว่าง ให้บอกว่าว่างทุกช่วงเวลาในสัปดาห์นี้
ถ้าผู้ใช้จอง เช่น "จอง วันพุธ 10:00" ให้ตอบยืนยันการจองและบอกรายละเอียด`,
      messages: [{ role: "user", content: userMessage }],
    });

    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
    };

    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try {
          const data = JSON.parse(raw);
          resolve(data.content[0].text);
        } catch {
          resolve("เกิดข้อผิดพลาดครับ");
        }
      });
    });

    req.on("error", () => resolve("เกิดข้อผิดพลาดครับ"));
    req.write(body);
    req.end();
  });
}

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
