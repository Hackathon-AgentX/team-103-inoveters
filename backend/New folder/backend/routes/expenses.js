import { GoogleGenerativeAI } from '@google/generative-ai';
import { Router } from 'express';
import multer from 'multer';
import Groq from 'groq-sdk';
import { db, CATEGORIES } from '../db.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function getClient() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

// ─── Helper: get few-shot corrections ────────────────────────────────────────
function getFewShotExamples() {
  const rows = db.prepare(
    `SELECT original_text, user_category FROM category_corrections ORDER BY created_at DESC LIMIT 5`
  ).all();
  if (!rows.length) return '';
  return '\n\nPast user corrections for category accuracy:\n' +
    rows.map(r => `  "${r.original_text}" -> ${r.user_category}`).join('\n');
}

// ─── GET /api/expenses ────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const { month, year, limit = 100, offset = 0 } = req.query;
    let query = `SELECT * FROM expenses`;
    const params = [];

    if (month && year) {
      query += ` WHERE strftime('%Y-%m', date) = ?`;
      params.push(`${year}-${String(month).padStart(2, '0')}`);
    } else if (!month && !year) {
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      query += ` WHERE strftime('%Y-%m', date) = ?`;
      params.push(ym);
    }

    query += ` ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));

    const rows = db.prepare(query).all(...params);
    const parsed = rows.map(r => ({ ...r, items: r.items ? JSON.parse(r.items) : [] }));
    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/expenses/all ────────────────────────────────────────────────────
router.get('/all', (req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM expenses ORDER BY date DESC, created_at DESC`).all();
    const parsed = rows.map(r => ({ ...r, items: r.items ? JSON.parse(r.items) : [] }));
    res.json({ success: true, data: parsed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/expenses ───────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { raw_text, amount, category, subcategory, merchant, items, date, source } = req.body;
    if (!amount || !category || !date) {
      return res.status(400).json({ success: false, error: 'amount, category, and date are required' });
    }
    const result = db.prepare(`
      INSERT INTO expenses (raw_text, amount, category, subcategory, merchant, items, date, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      raw_text || null,
      Number(amount),
      category,
      subcategory || null,
      merchant || null,
      items ? JSON.stringify(items) : null,
      date,
      source || 'text'
    );

    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
    expense.items = expense.items ? JSON.parse(expense.items) : [];

    // Check budget
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const total = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE category = ? AND strftime('%Y-%m', date) = ?`
    ).get(category, ym);
    const budget = db.prepare('SELECT monthly_limit FROM budgets WHERE category = ?').get(category);

    let alert = null;
    if (budget && budget.monthly_limit > 0) {
      const pct = (total.total / budget.monthly_limit) * 100;
      if (pct >= 100) {
        const over = total.total - budget.monthly_limit;
        alert = { level: 'danger', message: `${category} budget exceeded by ₹${over.toFixed(0)}!`, pct };
      } else if (pct >= 80) {
        alert = { level: 'warning', message: `You've used ${pct.toFixed(0)}% of your ${category} budget this month.`, pct };
      }
    }

    res.json({ success: true, data: expense, alert });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PUT /api/expenses/:id ────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { amount, category, subcategory, merchant, items, date } = req.body;

    const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    if (existing && existing.category !== category && existing.raw_text) {
      db.prepare(`INSERT INTO category_corrections (original_text, ai_category, user_category) VALUES (?, ?, ?)`)
        .run(existing.raw_text, existing.category, category);
    }

    db.prepare(`
      UPDATE expenses SET amount=?, category=?, subcategory=?, merchant=?, items=?, date=?
      WHERE id=?
    `).run(Number(amount), category, subcategory || null, merchant || null,
      items ? JSON.stringify(items) : null, date, id);

    const updated = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
    updated.items = updated.items ? JSON.parse(updated.items) : [];
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/expenses/:id ─────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/expenses/parse-text ───────────────────────────────────────────
router.post('/parse-text', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false, error: 'text is required' });

    const fewShot = getFewShotExamples();
    const today = getTodayStr();
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const groq = getClient();

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

    res.json({ success: true, data: { ...parsed, raw_text: text } });
  } catch (err) {
    console.error('parse-text error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/expenses/parse-receipt ────────────────────────────────────────
router.post('/parse-receipt', upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const today = getTodayStr();
    const groq = getClient();

    const mediaType = req.file.mimetype;
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType)) {
      return res.status(400).json({ success: false, error: 'Unsupported file type. Use JPG, PNG, or WebP.' });
    }

    const imageData = req.file.buffer.toString('base64');

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY');
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

    res.json({ success: true, data: { ...parsed, raw_text: 'Receipt upload', source: 'receipt' } });
  } catch (err) {
    console.error('parse-receipt error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
