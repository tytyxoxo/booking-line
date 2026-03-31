require("dotenv").config();
const key = process.env.GOOGLE_PRIVATE_KEY;
console.log("มี key:", !!key);
console.log("ขึ้นต้นด้วย:", key ? key.substring(0, 40) : "ไม่มี");
console.log("มี newline:", key ? key.includes("\n") : false);
