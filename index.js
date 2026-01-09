// ===============================================================
// 🤖 Telegram Lwu Storage Bot
// ===============================================================
// 📌 Purpose:
// This bot allows users to upload files (documents, photos, videos, etc.)
// and generates a private access link to retrieve those files later.
//
// 🌐 GitHub Repository:
// https://github.com/sychoxhassan/LwuStorageBot
//
// 🧠 Ideal for:
// - File storage bots
// - Private sharing systems
// - Learning Telegram Bot API
// ===============================================================

import fetch from "node-fetch";
import fs from "fs";

// ===============================================================
// ⚙️ STEP 1: CREATE YOUR TELEGRAM BOT
// ===============================================================
// 🔹 Open Telegram
// 🔹 Search for: @BotFather
// 🔹 Send command: /start
// 🔹 Then send: /newbot
// 🔹 Enter bot name (any name)
// 🔹 Enter bot username (must end with 'bot')
//
// ✅ BotFather will give you a BOT TOKEN
// ===============================================================

// 🔐 Paste your Bot Token here
// ❗ NEVER share this token publicly
const BOT_TOKEN = "TokenHere";

// ===============================================================
// 👤 STEP 2: BOT USERNAME
// ===============================================================
// 🔹 Enter your bot username WITHOUT '@'
// Example:
// If your bot is @MyStorageBot
// Then write: MyStorageBot
// ===============================================================
const BOT_USERNAME = "Without @";

// 🌍 Telegram API Base URL
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ===============================================================
// 💾 STEP 3: LOCAL DATABASE SETUP
// ===============================================================
// 📂 This file stores all sessions and uploaded file IDs
// 📌 Telegram file_id is permanent → no need to reupload files
// ===============================================================
const DB_FILE = "./data_store.json";

// 🔁 Offset is used to avoid reading old messages again
let offset = 0;

// ===============================================================
// 🗄️ DATABASE FUNCTIONS
// ===============================================================

// 📥 Read data from local JSON database
function readDB() {
  if (!fs.existsSync(DB_FILE)) return [];
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

// 📤 Save updated data back to database
function writeDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ===============================================================
// 🌐 TELEGRAM API HELPER
// ===============================================================
// 🔹 This function sends requests to Telegram API
// 🔹 Used for sendMessage, sendPhoto, sendDocument, etc.
// ===============================================================
async function tg(method, params = {}) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params)
  });
  return res.json();
}

// ===============================================================
// 🧩 SESSION MANAGEMENT SYSTEM
// ===============================================================
// 📌 One session = one upload batch
// 📌 Each user can upload multiple files in one session
// ===============================================================

// 🔑 Get active session OR create new one
function getOrInitSession(chatId) {
  const db = readDB();

  // 🔍 Check if an active session already exists
  const active = db.find(s => s.chat === chatId && s.status === "active");
  if (active) return active.session;

  // 🆕 Generate unique session ID
  const session =
    Date.now().toString(36) + Math.random().toString(36).slice(2);

  // 💾 Save new session
  db.push({
    session,
    chat: chatId,
    status: "active",
    files: []
  });

  writeDB(db);
  return session;
}

// 📎 Add uploaded file to session
function addFile(session, fileId, name, type, caption) {
  const db = readDB();
  const s = db.find(x => x.session === session);
  if (!s) return;

  s.files.push({
    file_id: fileId, // Telegram file identifier
    file_name: name,
    type,             // document | photo | video | audio | sticker
    caption
  });

  writeDB(db);
}

// 🔒 Close upload session
function closeSession(chatId) {
  const db = readDB();
  const s = db.find(x => x.chat === chatId && x.status === "active");
  if (!s) return null;

  s.status = "closed";
  writeDB(db);
  return s.session;
}

// 📤 Send all stored files of a session
async function sendSession(chatId, session) {
  const db = readDB();
  const s = db.find(x => x.session === session);

  // ❌ Invalid or expired session
  if (!s) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "❌ Invalid or expired session link."
    });
    return;
  }

  // 📦 Send each file one by one
  for (const f of s.files) {
    const method =
      "send" + f.type.charAt(0).toUpperCase() + f.type.slice(1);

    const payload = {
      chat_id: chatId,
      [f.type]: f.file_id
    };

    if (f.caption) payload.caption = f.caption;
    await tg(method, payload);
  }
}

// ===============================================================
// 📨 MESSAGE HANDLER
// ===============================================================
// 📌 This function handles ALL incoming messages
// ===============================================================
async function handleMessage(msg) {
  const chatId = msg.chat.id;

  // =============================================================
  // 📁 FILE UPLOAD HANDLING
  // =============================================================
  if (
    msg.document ||
    msg.photo ||
    msg.video ||
    msg.audio ||
    msg.sticker
  ) {
    let c, type, name;

    if (msg.document) {
      c = msg.document;
      type = "document";
      name = c.file_name || "file";
    } else if (msg.photo) {
      c = msg.photo[msg.photo.length - 1];
      type = "photo";
      name = "photo.jpg";
    } else if (msg.video) {
      c = msg.video;
      type = "video";
      name = "video.mp4";
    } else if (msg.audio) {
      c = msg.audio;
      type = "audio";
      name = "audio";
    } else if (msg.sticker) {
      c = msg.sticker;
      type = "sticker";
      name = "sticker.webp";
    }

    // 📌 Save file to session
    const session = getOrInitSession(chatId);
    addFile(session, c.file_id, name, type, msg.caption || "");

    await tg("sendMessage", {
      chat_id: chatId,
      text: "✅ File saved! Send more or type /done"
    });
    return;
  }

  // 🚫 Ignore non-text messages
  if (!msg.text) return;

  // ▶️ Start command
  if (msg.text === "/start") {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "📤 Send your files here.\nWhen finished, type /done"
    });
  }

  // 🔗 Session access via deep link
  else if (msg.text.startsWith("/start ")) {
    const session = msg.text.split(" ")[1];
    await sendSession(chatId, session);
  }

  // ✅ Finish upload and generate link
  else if (msg.text === "/done") {
    const session = closeSession(chatId);
    if (!session) return;

    const link = `https://t.me/${BOT_USERNAME}?start=${session}`;
    await tg("sendMessage", {
      chat_id: chatId,
      text: `🔗 Your private access link:\n${link}`
    });
  }
}

// ===============================================================
// 🔄 LONG POLLING SYSTEM
// ===============================================================
// 📌 Continuously checks Telegram for new updates
// ===============================================================
async function poll() {
  try {
    const res = await fetch(
      `${API}/getUpdates?timeout=30&offset=${offset}`
    );
    const data = await res.json();

    if (data.result) {
      for (const upd of data.result) {
        offset = upd.update_id + 1;
        if (upd.message) await handleMessage(upd.message);
      }
    }
  } catch (e) {
    // ⚠️ Ignore errors to keep bot running
  }

  setTimeout(poll, 1000);
}

// ===============================================================
// 🚀 BOT STARTUP
// ===============================================================
console.log("🚀 Telegram Storage Bot is running (Polling mode)");
poll();
