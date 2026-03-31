require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");
const { google } = require("googleapis");

const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/calendar"],
});

const calendar = google.calendar({ version: "v3", auth });
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

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
    const slots = await getAvailableSlots();
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: "text", text: slots }],
    });
  }

  // จองเวลา เช่น "จอง วันพุธ 10:00"
  if (text.startsWith("จอง ")) {
    const result = await createBooking(text);
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: "text", text: result }],
    });
  }

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [
      {
        type: "text",
        text: 'พิมพ์ "ว่าง" เพื่อดูตารางว่าง\nหรือ "จอง วัน เวลา" เพื่อจองครับ\nเช่น "จอง วันพุธ 10:00"',
      },
    ],
  });
}

async function getAvailableSlots() {
  try {
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: now.toISOString(),
      timeMax: nextWeek.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      timeZone: "Asia/Bangkok",
    });

    const events = res.data.items || [];

    if (events.length === 0) {
      return '📅 ไม่มีการจองในสัปดาห์นี้\nพิมพ์ "จอง วัน เวลา" เพื่อจองได้เลยครับ';
    }

    const list = events
      .map((e) => {
        const start = new Date(e.start.dateTime || e.start.date);
        const end = new Date(e.end.dateTime || e.end.date);
        return `• ${e.summary} (${start.toLocaleDateString("th-TH")} ${start.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}-${end.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })})`;
      })
      .join("\n");

    return `📅 การจองสัปดาห์นี้\n\n${list}`;
  } catch (err) {
    console.error(err);
    return "เกิดข้อผิดพลาด ไม่สามารถดูตารางได้ครับ";
  }
}

async function createBooking(text) {
  try {
    // แยก "จอง วันพุธ 10:00" ออกมา
    const parts = text.replace("จอง ", "").split(" ");
    const dayText = parts[0];
    const timeText = parts[1];

    if (!dayText || !timeText) {
      return 'รูปแบบไม่ถูกต้องครับ ลองใหม่ เช่น "จอง วันพุธ 10:00"';
    }

    // หาวันที่จากชื่อวัน
    const dayMap = {
      วันจันทร์: 1,
      วันอังคาร: 2,
      วันพุธ: 3,
      วันพฤหัส: 4,
      วันศุกร์: 5,
      วันเสาร์: 6,
      วันอาทิตย์: 0,
    };
    const targetDay = dayMap[dayText];

    if (targetDay === undefined) {
      return 'ไม่เข้าใจชื่อวันครับ เช่น "วันพุธ", "วันศุกร์"';
    }

    const now = new Date();
    const diff = (targetDay - now.getDay() + 7) % 7 || 7;
    const bookDate = new Date(now);
    bookDate.setDate(now.getDate() + diff);

    const [hour, minute] = timeText.split(":").map(Number);
    bookDate.setHours(hour, minute, 0, 0);

    const endDate = new Date(bookDate.getTime() + 60 * 60 * 1000); // 1 ชั่วโมง

    await calendar.events.insert({
      calendarId: CALENDAR_ID,
      resource: {
        summary: "📌 การจองผ่าน LINE",
        start: { dateTime: bookDate.toISOString(), timeZone: "Asia/Bangkok" },
        end: { dateTime: endDate.toISOString(), timeZone: "Asia/Bangkok" },
      },
    });

    return `✅ จองสำเร็จแล้วครับ!\n📅 ${dayText} เวลา ${timeText}-${endDate.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
  } catch (err) {
    console.error(err);
    return "เกิดข้อผิดพลาด ไม่สามารถจองได้ครับ";
  }
}

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
