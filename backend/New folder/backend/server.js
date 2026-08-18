import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createRequire } from 'node:module';

import expensesRouter from './routes/expenses.js';
import budgetsRouter from './routes/budgets.js';
import reportsRouter from './routes/reports.js';
import { startTelegramBot } from './telegram.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use('/api/expenses', expensesRouter);
app.use('/api/budgets', budgetsRouter);
app.use('/api/reports', reportsRouter);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    groqKeySet: !!process.env.GROQ_API_KEY
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 SpendWise backend running on http://localhost:${PORT}`);
  if (!process.env.GROQ_API_KEY) {
    console.warn('⚠️  GROQ_API_KEY not set — AI features will fail. Add it to backend/.env');
  } else {
    console.log('✅ Groq API key loaded');
  }
  startTelegramBot();
});
