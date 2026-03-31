require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");
const https = require("https");
const { URL } = require("url");

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

  // ดูตารางว่าง
  if (text === "ว่าง" || text === "ดูตารางว่าง") {
    const reply = await callAppsScript({ action: "getSlots" });
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: "text", text: reply }],
    });
  }

  // จองเวลา เช่น "จอง วันพฤหัส 15:00 ตัดผม"
  if (text.startsWith("จอง ")) {
    const parts = text.replace("จอง ", "").split(" ");
    const dayText = parts[0];
    const timeText = parts[1];
    const title = parts.slice(2).join(" ") || "การจองผ่าน LINE";

    if (!dayText || !timeText) {
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: "text",
            text: 'รูปแบบไม่ถูกต้องครับ\nเช่น "จอง วันพฤหัส 15:00 ตัดผม"',
          },
        ],
      });
    }

    const reply = await callAppsScript({
      action: "createBooking",
      dayText,
      timeText,
      title,
    });
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: "text", text: reply }],
    });
  }

  // ข้อความทั่วไป
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [
      {
        type: "text",
        text: '📅 สวัสดีครับ!\n\nพิมพ์ "ว่าง" เพื่อดูตารางว่าง\nหรือ "จอง วัน เวลา ชื่อ" เพื่อจอง\nเช่น "จอง วันพฤหัส 15:00 ตัดผม"',
      },
    ],
  });
}

function callAppsScript(params) {
  return new Promise((resolve) => {
    const u = new URL(process.env.APPS_SCRIPT_URL);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));

    function doGet(urlStr) {
      https
        .get(urlStr, (res) => {
          // follow redirect
          if (res.statusCode === 301 || res.statusCode === 302) {
            return doGet(res.headers.location);
          }

          let raw = "";
          res.on("data", (chunk) => (raw += chunk));
          res.on("end", () => {
            try {
              const data = JSON.parse(raw);
              resolve(data.text || "เกิดข้อผิดพลาดครับ");
            } catch {
              resolve("เกิดข้อผิดพลาดครับ กรุณาลองใหม่");
            }
          });
        })
        .on("error", (err) => {
          console.error("Apps Script error:", err.message);
          resolve("เกิดข้อผิดพลาดครับ กรุณาลองใหม่");
        });
    }

    doGet(u.toString());
  });
}

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
