require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");

const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const app = express();
app.use("/webhook", line.middleware(config));

app.post("/webhook", (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then(() => res.status(200).end())
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") return;
  const text = event.message.text.trim();

  if (text === "ว่าง" || text === "ดูตารางว่าง") {
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: "text", text: getAvailableSlots() }],
    });
  }

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: "text", text: 'พิมพ์ "ว่าง" เพื่อดูตารางว่างครับ' }],
  });
}

function getAvailableSlots() {
  return [
    "📅 ตารางว่างสัปดาห์นี้",
    "",
    "• จันทร์ 10:00 - 12:00",
    "• จันทร์ 14:00 - 16:00",
    "• พุธ 09:00 - 11:00",
    "• ศุกร์ 13:00 - 15:00",
    "",
    "ตอบกลับวัน + เวลาที่ต้องการจองได้เลยครับ",
  ].join("\n");
}

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
