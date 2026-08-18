import { Router } from 'express';
import { db, CATEGORIES } from '../db.js';

const router = Router();

// ─── GET /api/budgets ─────────────────────────────────────────────────────────
// Returns all budgets with current month's usage
router.get('/', (req, res) => {
  try {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const budgets = db.prepare('SELECT * FROM budgets ORDER BY category').all();

    const result = budgets.map(b => {
      const usage = db.prepare(
        `SELECT COALESCE(SUM(amount), 0) as spent FROM expenses 
         WHERE category = ? AND strftime('%Y-%m', date) = ?`
      ).get(b.category, ym);

      const spent = usage.spent;
      const pct = b.monthly_limit > 0 ? (spent / b.monthly_limit) * 100 : 0;

      return {
        ...b,
        spent,
        pct: Math.round(pct * 10) / 10,
        remaining: Math.max(0, b.monthly_limit - spent),
        status: pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'ok'
      };
    });

    res.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/budgets ────────────────────────────────────────────────────────
// Upsert budget for a category
router.post('/', (req, res) => {
  try {
    const { category, monthly_limit } = req.body;

    if (!category || monthly_limit === undefined) {
      return res.status(400).json({ success: false, error: 'category and monthly_limit are required' });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: `Invalid category. Must be one of: ${CATEGORIES.join(', ')}` });
    }

    db.prepare(`
      INSERT INTO budgets (category, monthly_limit, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit, updated_at = excluded.updated_at
    `).run(category, Number(monthly_limit));

    const budget = db.prepare('SELECT * FROM budgets WHERE category = ?').get(category);
    res.json({ success: true, data: budget });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
