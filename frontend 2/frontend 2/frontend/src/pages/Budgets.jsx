import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getBudgets, upsertBudget } from '../lib/api';
import { CATEGORIES, getCategoryConfig, formatCurrency } from '../lib/utils';
import { Pencil, Check, X } from 'lucide-react';

function BudgetCard({ budget, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(budget.monthly_limit);
  const cfg = getCategoryConfig(budget.category);

  const handleSave = async () => {
    if (isNaN(value) || value < 0) { toast.error('Invalid amount'); return; }
    await onSave(budget.category, parseFloat(value));
    setEditing(false);
  };

  const barColor = budget.status === 'danger' ? '#ef4444'
    : budget.status === 'warning' ? '#f59e0b'
    : cfg.color;
  const pct = Math.min(budget.pct, 100);

  return (
    <div className="glass rounded-2xl p-5 glass-hover space-y-4"
      style={{ borderColor: budget.status !== 'ok' ? `${barColor}30` : undefined }}>
      {/* Category header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
            style={{ background: cfg.bg }}>
            {cfg.emoji}
          </div>
          <div>
            <p className="font-semibold text-white">{budget.category}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {formatCurrency(budget.spent)} spent
            </p>
          </div>
        </div>

        {/* Edit button */}
        {!editing ? (
          <button
            onClick={() => { setEditing(true); setValue(budget.monthly_limit); }}
            className="p-2 rounded-xl text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10
              transition-all"
          >
            <Pencil size={14} />
          </button>
        ) : (
          <div className="flex gap-1.5">
            <button onClick={handleSave}
              className="p-2 rounded-xl text-emerald-400 hover:bg-emerald-500/10 transition-all">
              <Check size={14} />
            </button>
            <button onClick={() => setEditing(false)}
              className="p-2 rounded-xl text-slate-400 hover:bg-white/5 transition-all">
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Budget amount */}
      {editing ? (
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-bold text-lg">₹</span>
          <input
            type="number"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            className="flex-1 input-dark rounded-xl px-3 py-2 text-sm font-semibold"
            placeholder="Monthly limit"
            autoFocus
          />
        </div>
      ) : (
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-bold text-white">{formatCurrency(budget.monthly_limit)}</p>
            <p className="text-xs text-slate-500 mt-0.5">monthly limit</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold" style={{ color: barColor }}>{pct.toFixed(0)}%</p>
            {budget.status === 'danger' && <p className="text-xs text-red-400">Exceeded!</p>}
            {budget.status === 'warning' && <p className="text-xs text-amber-400">Almost full</p>}
            {budget.status === 'ok' && <p className="text-xs text-slate-500">{formatCurrency(budget.remaining)} left</p>}
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: budget.status === 'ok'
              ? `linear-gradient(90deg, ${cfg.color}99, ${cfg.color})`
              : barColor,
            boxShadow: `0 0 8px ${barColor}60`,
          }}
        />
      </div>
    </div>
  );
}

export default function Budgets() {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBudgets().then(r => setBudgets(r.data.data || [])).finally(() => setLoading(false));
  }, []);

  const handleSave = async (category, monthly_limit) => {
    try {
      await upsertBudget(category, monthly_limit);
      const res = await getBudgets();
      setBudgets(res.data.data || []);
      toast.success(`${category} budget updated!`);
    } catch (err) {
      toast.error('Failed to update budget');
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CATEGORIES.map(c => <div key={c} className="skeleton h-40 rounded-2xl" />)}
      </div>
    );
  }

  const totalBudget = budgets.reduce((s, b) => s + b.monthly_limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold gradient-text">Budgets</h1>
        <p className="text-slate-400 text-sm mt-0.5">Set monthly limits per category</p>
      </div>

      {/* Summary */}
      <div className="glass rounded-2xl p-5 border border-white/[0.06]">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-white">{formatCurrency(totalBudget)}</p>
            <p className="text-xs text-slate-500 mt-1">Total Budget</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-indigo-400">{formatCurrency(totalSpent)}</p>
            <p className="text-xs text-slate-500 mt-1">Spent</p>
          </div>
          <div>
            <p className={`text-2xl font-bold ${totalBudget - totalSpent < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {formatCurrency(Math.abs(totalBudget - totalSpent))}
            </p>
            <p className="text-xs text-slate-500 mt-1">{totalBudget - totalSpent < 0 ? 'Over' : 'Remaining'}</p>
          </div>
        </div>
        {/* Overall progress */}
        <div className="mt-4 h-2.5 rounded-full overflow-hidden bg-white/5">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min((totalSpent / totalBudget) * 100, 100)}%`,
              background: 'linear-gradient(90deg, #6366f1, #7c3aed)',
              boxShadow: '0 0 12px rgba(99,102,241,0.5)',
            }}
          />
        </div>
        <p className="text-xs text-slate-500 text-right mt-1.5">
          {((totalSpent / totalBudget) * 100).toFixed(0)}% of total budget used
        </p>
      </div>

      {/* Budget cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {budgets.map(b => (
          <BudgetCard key={b.category} budget={b} onSave={handleSave} />
        ))}
      </div>
    </div>
  );
}
