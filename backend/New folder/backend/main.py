"""
SpendWise Backend — FastAPI + SQLite + Claude AI
"""

import os
import sqlite3
import json
import base64
from datetime import datetime, date, timedelta
from typing import Optional, List
from contextlib import contextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import anthropic
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="SpendWise API")

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Database ─────────────────────────────────────────────────────────────────
DB_PATH = Path(__file__).parent / "spendwise.db"

CATEGORIES = [
    "Food", "Transport", "Rent", "Groceries", "Entertainment",
    "Subscriptions", "Education", "Health", "Shopping", "Other"
]

DEFAULT_BUDGETS = {
    "Food": 3000, "Transport": 2000, "Rent": 8000, "Groceries": 2500,
    "Entertainment": 1500, "Subscriptions": 500, "Education": 1000,
    "Health": 1000, "Shopping": 2000, "Other": 1000
}


def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()

    cur.executescript("""
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
    """)

    # Insert default budgets
    for cat in CATEGORIES:
        cur.execute(
            "INSERT OR IGNORE INTO budgets (category, monthly_limit) VALUES (?, ?)",
            (cat, DEFAULT_BUDGETS.get(cat, 1000))
        )

    # Seed data
    count = cur.execute("SELECT COUNT(*) FROM expenses").fetchone()[0]
    if count == 0:
        now = datetime.now()
        yr = now.strftime("%Y")
        mo = now.strftime("%m")

        seed = [
            ("120 chai and samosa at tapri",  120,  "Food",          "Local Tapri",     json.dumps(["chai","samosa"]),           f"{yr}-{mo}-01"),
            ("lunch at canteen 85",            85,   "Food",          "College Canteen", json.dumps(["lunch"]),                  f"{yr}-{mo}-03"),
            ("swiggy order 340",               340,  "Food",          "Swiggy",          json.dumps(["biryani","raita"]),         f"{yr}-{mo}-05"),
            ("coffee at ccd 180",              180,  "Food",          "Cafe Coffee Day", json.dumps(["cappuccino"]),              f"{yr}-{mo}-07"),
            ("uber to college 450",            450,  "Transport",     "Uber",            json.dumps(["cab ride"]),                f"{yr}-{mo}-02"),
            ("metro card recharge 200",        200,  "Transport",     "Delhi Metro",     json.dumps(["metro recharge"]),          f"{yr}-{mo}-04"),
            ("rapido bike 80",                 80,   "Transport",     "Rapido",          json.dumps(["bike taxi"]),               f"{yr}-{mo}-08"),
            ("paid 7500 rent to landlord",    7500,  "Rent",          "Landlord",        json.dumps(["monthly rent"]),            f"{yr}-{mo}-01"),
            ("big basket order 680",           680,  "Groceries",     "BigBasket",       json.dumps(["vegetables","milk","bread"]),f"{yr}-{mo}-06"),
            ("dmart groceries 420",            420,  "Groceries",     "D-Mart",          json.dumps(["rice","dal","oil"]),        f"{yr}-{mo}-10"),
            ("movie tickets pvr 600",          600,  "Entertainment", "PVR Cinemas",     json.dumps(["2 movie tickets"]),         f"{yr}-{mo}-09"),
            ("netflix 199 subscription",       199,  "Subscriptions", "Netflix",         json.dumps(["netflix monthly"]),         f"{yr}-{mo}-01"),
            ("spotify premium 119",            119,  "Subscriptions", "Spotify",         json.dumps(["spotify monthly"]),         f"{yr}-{mo}-01"),
            ("udemy course 499",               499,  "Education",     "Udemy",           json.dumps(["React course"]),            f"{yr}-{mo}-11"),
            ("pharmacy medicine 230",          230,  "Health",        "Apollo Pharmacy", json.dumps(["vitamins","paracetamol"]),  f"{yr}-{mo}-12"),
        ]

        cur.executemany(
            "INSERT INTO expenses (raw_text, amount, category, merchant, items, date, source) VALUES (?,?,?,?,?,?,'text')",
            seed
        )
        print(f"✅ Seeded {len(seed)} sample expenses")

    conn.commit()
    conn.close()


def row_to_expense(row):
    d = dict(row)
    d["items"] = json.loads(d["items"]) if d.get("items") else []
    return d


# ─── Claude client ────────────────────────────────────────────────────────────
def get_claude():
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set in backend/.env")
    return anthropic.Anthropic(api_key=key)


def get_few_shot_examples():
    conn = get_db()
    rows = conn.execute(
        "SELECT original_text, user_category FROM category_corrections ORDER BY created_at DESC LIMIT 5"
    ).fetchall()
    conn.close()
    if not rows:
        return ""
    lines = "\n".join(f'  "{r["original_text"]}" -> {r["user_category"]}' for r in rows)
    return f"\n\nPast user corrections for category accuracy:\n{lines}"


# ─── Pydantic models ──────────────────────────────────────────────────────────
class ExpenseCreate(BaseModel):
    raw_text: Optional[str] = None
    amount: float
    category: str
    subcategory: Optional[str] = None
    merchant: Optional[str] = None
    items: Optional[List[str]] = []
    date: str
    source: Optional[str] = "text"


class ExpenseUpdate(BaseModel):
    amount: float
    category: str
    subcategory: Optional[str] = None
    merchant: Optional[str] = None
    items: Optional[List[str]] = []
    date: str


class BudgetUpsert(BaseModel):
    category: str
    monthly_limit: float


class ParseTextRequest(BaseModel):
    text: str


class GenerateReportRequest(BaseModel):
    month: Optional[int] = None
    year: Optional[int] = None


# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "anthropicKeySet": bool(os.getenv("ANTHROPIC_API_KEY"))
    }


# ═══════════════════════════════════════════════════════════════════════════════
# EXPENSES
# ═══════════════════════════════════════════════════════════════════════════════

def compute_budget_alert(category: str, conn) -> Optional[dict]:
    ym = datetime.now().strftime("%Y-%m")
    total = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE category=? AND strftime('%Y-%m', date)=?",
        (category, ym)
    ).fetchone()["total"]

    budget = conn.execute("SELECT monthly_limit FROM budgets WHERE category=?", (category,)).fetchone()
    if not budget or budget["monthly_limit"] <= 0:
        return None

    limit = budget["monthly_limit"]
    pct = (total / limit) * 100
    if pct >= 100:
        over = total - limit
        return {"level": "danger", "message": f"{category} budget exceeded by ₹{over:.0f}!", "pct": pct}
    elif pct >= 80:
        return {"level": "warning", "message": f"You've used {pct:.0f}% of your {category} budget this month.", "pct": pct}
    return None


@app.get("/api/expenses")
def get_expenses(month: Optional[int] = None, year: Optional[int] = None,
                 limit: int = 100, offset: int = 0):
    conn = get_db()
    now = datetime.now()
    ym = f"{year or now.year}-{str(month or now.month).zfill(2)}"
    rows = conn.execute(
        "SELECT * FROM expenses WHERE strftime('%Y-%m', date)=? ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?",
        (ym, limit, offset)
    ).fetchall()
    conn.close()
    return {"success": True, "data": [row_to_expense(r) for r in rows]}


@app.get("/api/expenses/all")
def get_all_expenses():
    conn = get_db()
    rows = conn.execute("SELECT * FROM expenses ORDER BY date DESC, created_at DESC").fetchall()
    conn.close()
    return {"success": True, "data": [row_to_expense(r) for r in rows]}


@app.post("/api/expenses")
def create_expense(expense: ExpenseCreate):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO expenses (raw_text, amount, category, subcategory, merchant, items, date, source) VALUES (?,?,?,?,?,?,?,?)",
        (expense.raw_text, expense.amount, expense.category, expense.subcategory,
         expense.merchant, json.dumps(expense.items or []), expense.date, expense.source or "text")
    )
    row_id = cur.lastrowid
    alert = compute_budget_alert(expense.category, conn)
    conn.commit()
    row = conn.execute("SELECT * FROM expenses WHERE id=?", (row_id,)).fetchone()
    conn.close()
    return {"success": True, "data": row_to_expense(row), "alert": alert}


@app.put("/api/expenses/{expense_id}")
def update_expense(expense_id: int, expense: ExpenseUpdate):
    conn = get_db()
    existing = conn.execute("SELECT * FROM expenses WHERE id=?", (expense_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Expense not found")

    # Track category correction
    if existing["category"] != expense.category and existing["raw_text"]:
        conn.execute(
            "INSERT INTO category_corrections (original_text, ai_category, user_category) VALUES (?,?,?)",
            (existing["raw_text"], existing["category"], expense.category)
        )

    conn.execute(
        "UPDATE expenses SET amount=?, category=?, subcategory=?, merchant=?, items=?, date=? WHERE id=?",
        (expense.amount, expense.category, expense.subcategory, expense.merchant,
         json.dumps(expense.items or []), expense.date, expense_id)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM expenses WHERE id=?", (expense_id,)).fetchone()
    conn.close()
    return {"success": True, "data": row_to_expense(row)}


@app.delete("/api/expenses/{expense_id}")
def delete_expense(expense_id: int):
    conn = get_db()
    conn.execute("DELETE FROM expenses WHERE id=?", (expense_id,))
    conn.commit()
    conn.close()
    return {"success": True}


@app.post("/api/expenses/parse-text")
def parse_text(req: ParseTextRequest):
    client = get_claude()
    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    few_shot = get_few_shot_examples()

    system = f"""You are an expense parsing assistant for an Indian student expense tracker.
Today's date is {today}.
Valid categories: {", ".join(CATEGORIES)}.
{few_shot}

Parse the user's natural language expense input and return ONLY a single strict JSON object with these fields:
{{
  "amount": <number, total amount in INR>,
  "category": <one of the valid categories>,
  "merchant": <string or null>,
  "items": <array of item strings>,
  "date": <"YYYY-MM-DD", use today if not mentioned, handle relative dates like "yesterday" = {yesterday}>,
  "confidence": <"high"|"medium"|"low">
}}

Rules:
- For multi-item entries like "120 chai and samosa", treat the total amount as given.
- If currency symbol present (₹, Rs, INR), strip it.
- Return ONLY the JSON, no explanation, no markdown fences."""

    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=512,
        system=system,
        messages=[{"role": "user", "content": req.text}]
    )

    raw = message.content[0].text.strip()
    # Strip markdown fences if Claude adds them
    raw = raw.lstrip("```json").lstrip("```").rstrip("```").strip()
    parsed = json.loads(raw)
    if parsed.get("category") not in CATEGORIES:
        parsed["category"] = "Other"

    return {"success": True, "data": {**parsed, "raw_text": req.text}}


@app.post("/api/expenses/parse-receipt")
async def parse_receipt(receipt: UploadFile = File(...)):
    content = await receipt.read()

    if receipt.content_type not in ["image/jpeg", "image/png", "image/webp", "image/gif"]:
        raise HTTPException(status_code=400, detail="Unsupported file type. Use JPG, PNG, or WebP.")

    image_data = base64.standard_b64encode(content).decode("utf-8")
    media_type = receipt.content_type
    today = date.today().isoformat()

    client = get_claude()
    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=512,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": media_type, "data": image_data}
                },
                {
                    "type": "text",
                    "text": f"""Today's date is {today}. Extract expense info from this receipt and return ONLY a strict JSON object:
{{
  "amount": <number, total amount paid in INR>,
  "category": <one of: {", ".join(CATEGORIES)}>,
  "merchant": <store/restaurant name or null>,
  "items": <array of item name strings>,
  "date": <"YYYY-MM-DD" from receipt, or "{today}" if not visible>,
  "confidence": <"high"|"medium"|"low">
}}
Return ONLY the JSON, no explanation, no markdown fences."""
                }
            ]
        }]
    )

    raw = message.content[0].text.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
    parsed = json.loads(raw)
    if parsed.get("category") not in CATEGORIES:
        parsed["category"] = "Other"

    return {"success": True, "data": {**parsed, "raw_text": "Receipt upload", "source": "receipt"}}


# ═══════════════════════════════════════════════════════════════════════════════
# BUDGETS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/api/budgets")
def get_budgets():
    conn = get_db()
    ym = datetime.now().strftime("%Y-%m")
    budgets = conn.execute("SELECT * FROM budgets ORDER BY category").fetchall()

    result = []
    for b in budgets:
        spent = conn.execute(
            "SELECT COALESCE(SUM(amount), 0) as s FROM expenses WHERE category=? AND strftime('%Y-%m', date)=?",
            (b["category"], ym)
        ).fetchone()["s"]

        limit = b["monthly_limit"]
        pct = round((spent / limit * 100) if limit > 0 else 0, 1)
        status = "danger" if pct >= 100 else "warning" if pct >= 80 else "ok"
        result.append({
            "id": b["id"], "category": b["category"], "monthly_limit": limit,
            "updated_at": b["updated_at"], "spent": spent, "pct": pct,
            "remaining": max(0, limit - spent), "status": status
        })

    conn.close()
    return {"success": True, "data": result}


@app.post("/api/budgets")
def upsert_budget(budget: BudgetUpsert):
    if budget.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category. Must be one of: {', '.join(CATEGORIES)}")

    conn = get_db()
    conn.execute(
        "INSERT INTO budgets (category, monthly_limit, updated_at) VALUES (?,?,datetime('now')) "
        "ON CONFLICT(category) DO UPDATE SET monthly_limit=excluded.monthly_limit, updated_at=excluded.updated_at",
        (budget.category, budget.monthly_limit)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM budgets WHERE category=?", (budget.category,)).fetchone()
    conn.close()
    return {"success": True, "data": dict(row)}


# ═══════════════════════════════════════════════════════════════════════════════
# REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/api/reports/generate")
def generate_report(req: GenerateReportRequest):
    now = datetime.now()
    target_year = req.year or now.year
    target_month = req.month or now.month
    ym = f"{target_year}-{str(target_month).zfill(2)}"
    month_name = datetime(target_year, target_month, 1).strftime("%B")

    conn = get_db()
    expenses = conn.execute(
        "SELECT * FROM expenses WHERE strftime('%Y-%m', date)=? ORDER BY date ASC", (ym,)
    ).fetchall()

    if not expenses:
        conn.close()
        return {"success": True, "data": {
            "month": month_name, "year": target_year,
            "report": f"No expenses found for {month_name} {target_year}. Start tracking your expenses to get insights!",
            "stats": {}
        }}

    # Per-category totals
    category_totals = {}
    total_spent = 0
    for e in expenses:
        category_totals[e["category"]] = category_totals.get(e["category"], 0) + e["amount"]
        total_spent += e["amount"]

    # Budgets map
    budgets_rows = conn.execute("SELECT * FROM budgets").fetchall()
    budget_map = {b["category"]: b["monthly_limit"] for b in budgets_rows}

    # Previous month
    prev_date = datetime(target_year if target_month > 1 else target_year - 1,
                         target_month - 1 if target_month > 1 else 12, 1)
    prev_ym = prev_date.strftime("%Y-%m")
    prev_total = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) as t FROM expenses WHERE strftime('%Y-%m', date)=?", (prev_ym,)
    ).fetchone()["t"]

    conn.close()

    # Daily average & projection
    days_in_month = (datetime(target_year, target_month % 12 + 1, 1) if target_month < 12
                     else datetime(target_year + 1, 1, 1) - timedelta(days=1)).day if target_month < 12 else 31
    # Simple approach
    import calendar
    days_in_month = calendar.monthrange(target_year, target_month)[1]
    days_elapsed = now.day if (target_month == now.month and target_year == now.year) else days_in_month
    daily_avg = total_spent / max(days_elapsed, 1)
    projected = daily_avg * days_in_month

    stats_text = "\n".join(
        f"  {cat}: ₹{amt:.0f} spent" +
        (f" / ₹{budget_map.get(cat, 0):.0f} budget ({amt / budget_map[cat] * 100:.0f}%)"
         if budget_map.get(cat, 0) > 0 else "")
        for cat, amt in sorted(category_totals.items(), key=lambda x: -x[1])
    )

    prompt = f"""You are a friendly financial advisor for college students in India.

Here is the expense summary for {month_name} {target_year}:
Total spent: ₹{total_spent:.0f}
Previous month total: ₹{prev_total:.0f}
Daily average: ₹{daily_avg:.0f}
Projected month-end spend: ₹{projected:.0f}

Category breakdown:
{stats_text}

Write a short, friendly, encouraging monthly expense report in 3-4 paragraphs. Include:
1. Overview: How the month went overall vs last month
2. Highlights: Top spending areas, any budget overruns (be supportive, not judgmental)
3. Savings tip: One specific, actionable money-saving tip tailored to their spending pattern
4. Encouragement: End with a motivating note

Use Indian rupee (₹) symbol. Keep it conversational and warm. Use emojis sparingly but effectively."""

    client = get_claude()
    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )
    report_text = message.content[0].text

    top_cat = max(category_totals, key=category_totals.get) if category_totals else None

    return {"success": True, "data": {
        "month": month_name,
        "year": target_year,
        "report": report_text,
        "stats": {
            "totalSpent": total_spent,
            "prevTotal": prev_total,
            "dailyAvg": daily_avg,
            "projected": projected,
            "categoryTotals": category_totals,
            "budgetMap": budget_map,
            "daysElapsed": days_elapsed,
            "daysInMonth": days_in_month,
            "topCategory": top_cat
        }
    }}


# ─── Startup ──────────────────────────────────────────────────────────────────
@app.on_event("startup")
def startup():
    init_db()
    print("🚀 SpendWise backend running!")
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("⚠️  ANTHROPIC_API_KEY not set — AI features will fail. Add it to backend/.env")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=3001, reload=True)
