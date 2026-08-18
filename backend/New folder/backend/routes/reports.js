import { Router } from 'express';
import Groq from 'groq-sdk';
import { db } from '../db.js';

const router = Router();

function getClient() {
  return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

// ─── POST /api/reports/generate ───────────────────────────────────────────────
router.post('/generate', async (req, res) => {
  try {
    const { month, year } = req.body;
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month || now.getMonth() + 1;
    const ym = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
    const monthName = new Date(targetYear, targetMonth - 1).toLocaleString('default', { month: 'long' });

    // Gather this month's expenses
    const expenses = db.prepare(
      `SELECT * FROM expenses WHERE strftime('%Y-%m', date) = ? ORDER BY date ASC`
    ).all(ym);

    if (!expenses.length) {
      return res.json({
        success: true,
        data: {
          month: monthName, year: targetYear,
          report: `No expenses found for ${monthName} ${targetYear}. Start tracking your expenses to get insights!`,
          stats: {}
        }
      });
    }

    // Compute per-category totals
    const categoryTotals = {};
    let totalSpent = 0;
    for (const e of expenses) {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
      totalSpent += e.amount;
    }

    // Budgets
    const budgets = db.prepare('SELECT * FROM budgets').all();
    const budgetMap = {};
    for (const b of budgets) budgetMap[b.category] = b.monthly_limit;

    // Previous month
    const prevDate = new Date(targetYear, targetMonth - 2, 1);
    const prevYm = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const prevExpenses = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE strftime('%Y-%m', date) = ?`
    ).get(prevYm);
    const prevTotal = prevExpenses.total;

    // Daily average
    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
    const today = now.getDate();
    const daysElapsed = targetMonth === now.getMonth() + 1 && targetYear === now.getFullYear()
      ? today : daysInMonth;
    const dailyAvg = totalSpent / daysElapsed;
    const projected = dailyAvg * daysInMonth;

    const statsText = Object.entries(categoryTotals)
      .map(([cat, amt]) => {
        const budget = budgetMap[cat] || 0;
        const pct = budget > 0 ? ((amt / budget) * 100).toFixed(0) : 'N/A';
        return `  ${cat}: ₹${amt.toFixed(0)} spent${budget ? ` / ₹${budget} budget (${pct}%)` : ''}`;
      })
      .join('\n');

    const prompt = `You are a friendly financial advisor for college students in India.

Here is the expense summary for ${monthName} ${targetYear}:
Total spent: ₹${totalSpent.toFixed(0)}
Previous month total: ₹${prevTotal.toFixed(0)}
Daily average: ₹${dailyAvg.toFixed(0)}
Projected month-end spend: ₹${projected.toFixed(0)}

Category breakdown:
${statsText}

Write a short, friendly, encouraging monthly expense report in 3-4 paragraphs. Include:
1. Overview: How the month went overall vs last month
2. Highlights: Top spending areas, any budget overruns (be supportive, not judgmental)
3. Savings tip: One specific, actionable money-saving tip tailored to their spending pattern
4. Encouragement: End with a motivating note

Use Indian rupee (₹) symbol. Keep it conversational and warm. Use emojis sparingly but effectively.`;

    const groq = getClient();
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant',
      temperature: 0.7,
    });
    
    const reportText = chatCompletion.choices[0].message.content;

    const stats = {
      totalSpent,
      prevTotal,
      dailyAvg,
      projected,
      categoryTotals,
      budgetMap,
      daysElapsed,
      daysInMonth,
      topCategory: Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0]
    };

    res.json({ success: true, data: { month: monthName, year: targetYear, report: reportText, stats } });
  } catch (err) {
    console.error('generate-report error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
