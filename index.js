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
      messages: [{ type: "text", text: reply.text }],
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
      messages: [{ type: "text", text: reply.text }],
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

// เรียก Google Apps Script พร้อม follow redirect
function callAppsScript(body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);

    function doRequest(urlStr) {
      const u = new URL(urlStr);
      const options = {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      };

      const req = https.request(options, (res) => {
        // Apps Script redirect เสมอ ต้องตาม redirect
        if (res.statusCode === 301 || res.statusCode === 302) {
          return doRequest(res.headers.location);
        }

        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve({ text: "เกิดข้อผิดพลาดครับ กรุณาลองใหม่" });
          }
        });
      });

      req.on("error", (err) => {
        console.error("Apps Script error:", err.message);
        resolve({ text: "เกิดข้อผิดพลาดครับ กรุณาลองใหม่" });
      });

      req.write(data);
      req.end();
    }

    doRequest(process.env.APPS_SCRIPT_URL);
  });
}

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
