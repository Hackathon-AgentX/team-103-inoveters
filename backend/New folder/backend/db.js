

// Uses Node.js built-in SQLite (available since Node 22.5+)
// No native compilation required — works perfectly on Node 26.
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'spendwise.db');

const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for better performance
db.exec(`PRAGMA journal_mode = WAL`);
db.exec(`PRAGMA foreign_keys = ON`);

// ─── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_text    TEXT,
    amount      REAL    NOT NULL,
    category    TEXT    NOT NULL DEFAULT 'Other',
    subcategory TEXT,
    merchant    TEXT,
    items       TEXT,
    date        TEXT    NOT NULL,
    source      TEXT    NOT NULL DEFAULT 'text',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    category      TEXT    NOT NULL UNIQUE,
    monthly_limit REAL    NOT NULL DEFAULT 0,
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS category_corrections (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    original_text   TEXT NOT NULL,
    ai_category     TEXT,
    user_category   TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ─── Default budgets ──────────────────────────────────────────────────────────

export const CATEGORIES = [
  'Food', 'Transport', 'Rent', 'Groceries', 'Entertainment',
  'Subscriptions', 'Education', 'Health', 'Shopping', 'Other'
];

const DEFAULT_BUDGETS = {
  Food: 3000, Transport: 2000, Rent: 8000, Groceries: 2500,
  Entertainment: 1500, Subscriptions: 500, Education: 1000,
  Health: 1000, Shopping: 2000, Other: 1000
};

const insertBudget = db.prepare(
  `INSERT OR IGNORE INTO budgets (category, monthly_limit) VALUES (?, ?)`
);
for (const cat of CATEGORIES) {
  insertBudget.run(cat, DEFAULT_BUDGETS[cat] || 1000);
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

const existingCount = db.prepare('SELECT COUNT(*) as cnt FROM expenses').get();
if (existingCount.cnt === 0) {
  const now = new Date();
  const yr = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');

  const seed = [
    // Food
    { raw_text: '120 chai and samosa at tapri', amount: 120, category: 'Food', merchant: 'Local Tapri', items: JSON.stringify(['chai', 'samosa']), date: `${yr}-${mo}-01` },
    { raw_text: 'lunch at canteen 85', amount: 85, category: 'Food', merchant: 'College Canteen', items: JSON.stringify(['lunch']), date: `${yr}-${mo}-03` },
    { raw_text: 'swiggy order 340', amount: 340, category: 'Food', merchant: 'Swiggy', items: JSON.stringify(['biryani', 'raita']), date: `${yr}-${mo}-05` },
    { raw_text: 'coffee at ccd 180', amount: 180, category: 'Food', merchant: 'Cafe Coffee Day', items: JSON.stringify(['cappuccino']), date: `${yr}-${mo}-07` },
    // Transport
    { raw_text: 'uber to college 450', amount: 450, category: 'Transport', merchant: 'Uber', items: JSON.stringify(['cab ride']), date: `${yr}-${mo}-02` },
    { raw_text: 'metro card recharge 200', amount: 200, category: 'Transport', merchant: 'Delhi Metro', items: JSON.stringify(['metro recharge']), date: `${yr}-${mo}-04` },
    { raw_text: 'rapido bike 80', amount: 80, category: 'Transport', merchant: 'Rapido', items: JSON.stringify(['bike taxi']), date: `${yr}-${mo}-08` },
    // Rent
    { raw_text: 'paid 7500 rent to landlord', amount: 7500, category: 'Rent', merchant: 'Landlord', items: JSON.stringify(['monthly rent']), date: `${yr}-${mo}-01` },
    // Groceries
    { raw_text: 'big basket order 680', amount: 680, category: 'Groceries', merchant: 'BigBasket', items: JSON.stringify(['vegetables', 'milk', 'bread']), date: `${yr}-${mo}-06` },
    { raw_text: 'dmart groceries 420', amount: 420, category: 'Groceries', merchant: 'D-Mart', items: JSON.stringify(['rice', 'dal', 'oil']), date: `${yr}-${mo}-10` },
    // Entertainment
    { raw_text: 'movie tickets pvr 600', amount: 600, category: 'Entertainment', merchant: 'PVR Cinemas', items: JSON.stringify(['2 movie tickets']), date: `${yr}-${mo}-09` },
    // Subscriptions
    { raw_text: 'netflix 199 subscription', amount: 199, category: 'Subscriptions', merchant: 'Netflix', items: JSON.stringify(['netflix monthly']), date: `${yr}-${mo}-01` },
    { raw_text: 'spotify premium 119', amount: 119, category: 'Subscriptions', merchant: 'Spotify', items: JSON.stringify(['spotify monthly']), date: `${yr}-${mo}-01` },
    // Education
    { raw_text: 'udemy course 499', amount: 499, category: 'Education', merchant: 'Udemy', items: JSON.stringify(['React course']), date: `${yr}-${mo}-11` },
    // Health
    { raw_text: 'pharmacy medicine 230', amount: 230, category: 'Health', merchant: 'Apollo Pharmacy', items: JSON.stringify(['vitamins', 'paracetamol']), date: `${yr}-${mo}-12` },
  ];

  const insertExp = db.prepare(`
    INSERT INTO expenses (raw_text, amount, category, merchant, items, date, source)
    VALUES (?, ?, ?, ?, ?, ?, 'text')
  `);
  for (const e of seed) {
    insertExp.run(e.raw_text, e.amount, e.category, e.merchant, e.items, e.date);
  }
  console.log(`✅ Seeded ${seed.length} sample expenses`);
}

export { db };
