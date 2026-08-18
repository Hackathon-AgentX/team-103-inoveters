import { GoogleGenerativeAI } from '@google/generative-ai';
import TelegramBot from 'node-telegram-bot-api';
import Groq from 'groq-sdk';
import { db, CATEGORIES } from './db.js';

export function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn("⚠️ TELEGRAM_BOT_TOKEN not set. Telegram bot integration disabled.");
    return;
  }

  const bot = new TelegramBot(token, { polling: true });
  console.log("🤖 Telegram Bot initialized and polling...");

  // ─── Groq Client Helper ─────────────────────────────────────────────────────
  function getGroqClient() {
    return new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  // ─── Parse Text With Groq ───────────────────────────────────────────────────
  async function parseTextWithGroq(text) {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    let fewShot = '';
    try {
      const rows = db.prepare(
        `SELECT original_text, user_category FROM category_corrections ORDER BY created_at DESC LIMIT 5`
      ).all();
      if (rows.length) {
        fewShot = '\n\nPast user corrections for category accuracy:\n' +
          rows.map(r => `  "${r.original_text}" -> ${r.user_category}`).join('\n');
      }
    } catch (e) {}

    const prompt = `You are an expense parsing assistant for an Indian student expense tracker.
Today's date is ${today}.
Valid categories: ${CATEGORIES.join(', ')}.
${fewShot}

Parse the user's natural language expense input and return ONLY a single strict JSON object with these fields:
{
  "amount": <number, total amount in INR>,
  "category": <one of the valid categories>,
  "merchant": <string or null>,
  "items": <array of item strings>,
  "date": <"YYYY-MM-DD", use today if not mentioned, handle relative dates like "yesterday"="${yesterday}", "last friday">,
  "confidence": <"high"|"medium"|"low">
}

Rules:
- For multi-item entries like "120 chai and samosa", treat the total amount as given.
- If currency symbol present (₹, Rs, INR), strip it.
- Return ONLY the JSON, no explanation, no markdown fences.`;

    const groq = getGroqClient();
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: text }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0,
    });

    const raw = chatCompletion.choices[0].message.content.trim();
    const cleaned = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!CATEGORIES.includes(parsed.category)) parsed.category = 'Other';
    return parsed;
  }

  // ─── /start command ──────────────────────────────────────────────────────────
  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id,
      `👋 *Welcome to SpendWise!*

I'm your AI-powered expense tracker. Here's what you can do:

💬 *Log expenses by text:*
Just send me a message like:
• "120 chai and samosa"
• "paid 500 rent"
• "bought books 300 yesterday"

🖼 *Log expenses by photo:*
Send a photo of any receipt or bill!

📊 *Get a summary:*
Type /summary to see your monthly spending

All expenses are saved to your SpendWise dashboard.`,
      { parse_mode: 'Markdown' }
    );
  });

  // ─── /summary command ────────────────────────────────────────────────────────
  bot.onText(/\/summary/, (msg) => {
    try {
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const totalRow = db.prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE strftime('%Y-%m', date) = ?`
      ).get(ym);

      let text = `📊 *Monthly Summary (${ym})*\n`;
      text += `💰 *Total Spent:* ₹${(totalRow.total || 0).toFixed(0)}\n\n`;
      text += `📁 *Budget Breakdown:*\n`;

      const budgets = db.prepare(`SELECT * FROM budgets WHERE monthly_limit > 0`).all();
      for (const b of budgets) {
        const spentRow = db.prepare(
          `SELECT SUM(amount) as total FROM expenses WHERE category = ? AND strftime('%Y-%m', date) = ?`
        ).get(b.category, ym);
        const spent = spentRow.total || 0;
        const pct = ((spent / b.monthly_limit) * 100).toFixed(0);
        text += `📌 *${b.category}:* ₹${spent.toFixed(0)} / ₹${b.monthly_limit.toFixed(0)} (${pct}%)\n`;
      }

      bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    } catch (err) {
      bot.sendMessage(msg.chat.id, `❌ Error getting summary: ${err.message}`);
    }
  });

  // ─── TEXT MESSAGE LOGGING ────────────────────────────────────────────────────
  bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    if (!msg.text) return;

    const chatId = msg.chat.id;
    const text = msg.text;

    try {
      bot.sendChatAction(chatId, 'typing');
      const parsed = await parseTextWithGroq(text);

      const today = new Date().toISOString().split('T')[0];
      db.prepare(`
        INSERT INTO expenses (raw_text, amount, category, subcategory, merchant, items, date, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        text,
        Number(parsed.amount),
        parsed.category,
        parsed.subcategory || null,
        parsed.merchant || null,
        parsed.items ? JSON.stringify(parsed.items) : null,
        parsed.date || today,
        'telegram'
      );

      // Check budget alerts
      const now = new Date();
      const ymFormatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const totalRow = db.prepare(
        `SELECT SUM(amount) as total FROM expenses WHERE category = ? AND strftime('%Y-%m', date) = ?`
      ).get(parsed.category, ymFormatted);
      const total = totalRow.total || 0;

      const budgetRow = db.prepare('SELECT monthly_limit FROM budgets WHERE category = ?').get(parsed.category);

      let budgetAlertText = '';
      if (budgetRow && budgetRow.monthly_limit > 0) {
        const pct = (total / budgetRow.monthly_limit) * 100;
        if (pct >= 100) {
          budgetAlertText = `\n\n🔴 *BUDGET EXCEEDED!* You used ${pct.toFixed(0)}% of your *${parsed.category}* budget (₹${total.toFixed(0)}/₹${budgetRow.monthly_limit.toFixed(0)}).`;
        } else if (pct >= 80) {
          budgetAlertText = `\n\n⚠️ *WARNING!* You used ${pct.toFixed(0)}% of your *${parsed.category}* budget (₹${total.toFixed(0)}/₹${budgetRow.monthly_limit.toFixed(0)}).`;
        }
      }

      const response = `✅ *Expense Logged!*
💰 *Amount:* ₹${parsed.amount}
📁 *Category:* ${parsed.category}
🏪 *Merchant:* ${parsed.merchant || 'None'}
📅 *Date:* ${parsed.date || today}
🛒 *Items:* ${parsed.items ? parsed.items.join(', ') : 'None'}${budgetAlertText}`;

      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error(err);
      bot.sendMessage(chatId, `❌ Failed to parse expense: ${err.message}`);
    }
  });

  // ─── PHOTO RECEIPT LOGGING ───────────────────────────────────────────────────
  bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    try {
      bot.sendChatAction(chatId, 'upload_photo');
      bot.sendMessage(chatId, `📷 Receipt received! Extracting details using AI Vision...`);

      const photo = msg.photo[msg.photo.length - 1];
      const fileId = photo.file_id;

      const fileInfo = await bot.getFile(fileId);
      const filePath = fileInfo.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;

      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error("Failed to download receipt image from Telegram");

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const imageData = buffer.toString('base64');
      const mediaType = 'image/jpeg';

      const today = new Date().toISOString().split('T')[0];

      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `Today's date is ${today}. Extract expense info from this receipt and return ONLY a strict JSON object:
{
  "amount": <number, total amount paid in INR>,
  "category": <one of: ${CATEGORIES.join(', ')}>,
  "merchant": <store/restaurant name as string or null>,
  "items": <array of item name strings>,
  "date": <"YYYY-MM-DD" from receipt, or "${today}" if not visible>,
  "confidence": <"high"|"medium"|"low">
}
Return ONLY the JSON, no explanation, no markdown fences.`;

      const resultImg = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: imageData,
            mimeType: mediaType
          }
        }
      ]);
      const raw = resultImg.response.text().trim();
      const cleaned = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(cleaned);

      if (!CATEGORIES.includes(parsed.category)) parsed.category = 'Other';

      db.prepare(`
        INSERT INTO expenses (raw_text, amount, category, subcategory, merchant, items, date, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'Telegram Photo Upload',
        Number(parsed.amount),
        parsed.category,
        parsed.subcategory || null,
        parsed.merchant || null,
        parsed.items ? JSON.stringify(parsed.items) : null,
        parsed.date || today,
        'telegram'
      );

      // Check budget alerts
      const now = new Date();
      const ymFormatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const totalRow = db.prepare(
        `SELECT SUM(amount) as total FROM expenses WHERE category = ? AND strftime('%Y-%m', date) = ?`
      ).get(parsed.category, ymFormatted);
      const total = totalRow.total || 0;

      const budgetRow = db.prepare('SELECT monthly_limit FROM budgets WHERE category = ?').get(parsed.category);

      let budgetAlertText = '';
      if (budgetRow && budgetRow.monthly_limit > 0) {
        const pct = (total / budgetRow.monthly_limit) * 100;
        if (pct >= 100) {
          budgetAlertText = `\n\n🔴 *BUDGET EXCEEDED!* You used ${pct.toFixed(0)}% of your *${parsed.category}* budget (₹${total.toFixed(0)}/₹${budgetRow.monthly_limit.toFixed(0)}).`;
        } else if (pct >= 80) {
          budgetAlertText = `\n\n⚠️ *WARNING!* You used ${pct.toFixed(0)}% of your *${parsed.category}* budget (₹${total.toFixed(0)}/₹${budgetRow.monthly_limit.toFixed(0)}).`;
        }
      }

      const reply = `✅ *Receipt Logged via AI Vision!*
💰 *Amount:* ₹${parsed.amount}
📁 *Category:* ${parsed.category}
🏪 *Merchant:* ${parsed.merchant || 'None'}
📅 *Date:* ${parsed.date || today}
🛒 *Items:* ${parsed.items ? parsed.items.join(', ') : 'None'}${budgetAlertText}`;

      bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error(err);
      bot.sendMessage(chatId, `❌ Failed to process receipt photo: ${err.message}`);
    }
  });
}
