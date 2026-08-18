import { useState } from 'react';
import { Check, X, ChevronDown } from 'lucide-react';
import { CATEGORIES, getCategoryConfig, formatCurrency } from '../lib/utils';

export default function ConfirmationCard({ parsed, onConfirm, onCancel }) {
  const [form, setForm] = useState({
    amount: parsed.amount || '',
    category: parsed.category || 'Other',
    merchant: parsed.merchant || '',
    items: (parsed.items || []).join(', '),
    date: parsed.date || new Date().toISOString().split('T')[0],
  });

  const cfg = getCategoryConfig(form.category);

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleConfirm = () => {
    onConfirm({
      ...parsed,
      amount: parseFloat(form.amount),
      category: form.category,
      merchant: form.merchant || null,
      items: form.items ? form.items.split(',').map(s => s.trim()).filter(Boolean) : [],
      date: form.date,
    });
  };

  return (
    <div className="glass rounded-2xl p-5 border border-indigo-500/30 shadow-[0_0_30px_rgba(99,102,241,0.15)]
      animate-fade-in space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
            style={{ background: cfg.bg }}>
            {cfg.emoji}
          </div>
          <div>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Confirm Expense</p>
            {parsed.raw_text && (
              <p className="text-xs text-slate-500 mt-0.5 italic truncate max-w-[200px]">
                "{parsed.raw_text}"
              </p>
            )}
          </div>
        </div>
        <button onClick={onCancel} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
          <X size={16} />
        </button>
      </div>

      {/* Amount — hero field */}
      <div className="text-center py-2">
        <div className="flex items-center justify-center gap-1">
          <span className="text-3xl font-bold text-slate-400">₹</span>
          <input
            type="number"
            value={form.amount}
            onChange={(e) => handleChange('amount', e.target.value)}
            className="text-4xl font-bold text-white bg-transparent text-center w-40 outline-none
              border-b-2 border-indigo-500/40 focus:border-indigo-400 transition-colors"
            placeholder="0"
          />
        </div>
      </div>

      {/* Fields grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Category */}
        <div className="col-span-2">
          <label className="text-xs text-slate-400 font-medium mb-1.5 block">Category</label>
          <div className="relative">
            <select
              value={form.category}
              onChange={(e) => handleChange('category', e.target.value)}
              className="w-full input-dark rounded-xl px-3 py-2.5 text-sm appearance-none pr-8"
              style={{ color: cfg.text }}
            >
              {CATEGORIES.map(cat => {
                const c = getCategoryConfig(cat);
                return <option key={cat} value={cat}>{c.emoji} {cat}</option>;
              })}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Merchant */}
        <div>
          <label className="text-xs text-slate-400 font-medium mb-1.5 block">Merchant</label>
          <input
            type="text"
            value={form.merchant}
            onChange={(e) => handleChange('merchant', e.target.value)}
            placeholder="e.g. Swiggy"
            className="w-full input-dark rounded-xl px-3 py-2.5 text-sm"
          />
        </div>

        {/* Date */}
        <div>
          <label className="text-xs text-slate-400 font-medium mb-1.5 block">Date</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => handleChange('date', e.target.value)}
            className="w-full input-dark rounded-xl px-3 py-2.5 text-sm"
          />
        </div>

        {/* Items */}
        <div className="col-span-2">
          <label className="text-xs text-slate-400 font-medium mb-1.5 block">Items (comma-separated)</label>
          <input
            type="text"
            value={form.items}
            onChange={(e) => handleChange('items', e.target.value)}
            placeholder="chai, samosa"
            className="w-full input-dark rounded-xl px-3 py-2.5 text-sm"
          />
        </div>
      </div>

      {/* Confidence badge */}
      {parsed.confidence && parsed.confidence !== 'high' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <span className="text-amber-400 text-xs">⚠️</span>
          <p className="text-xs text-amber-300">
            AI confidence: <span className="font-semibold capitalize">{parsed.confidence}</span> — please review the fields above.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="btn-secondary flex-1 py-2.5 rounded-xl text-sm font-medium"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={!form.amount || !form.date}
          className="btn-primary flex-1 py-2.5 rounded-xl text-sm font-semibold
            flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Check size={16} className="relative z-10" />
          <span className="relative z-10">Save Expense</span>
        </button>
      </div>
    </div>
  );
}
