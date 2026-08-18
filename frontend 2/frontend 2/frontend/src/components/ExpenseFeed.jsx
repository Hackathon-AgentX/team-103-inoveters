import { useState } from 'react';
import { Trash2, Pencil } from 'lucide-react';
import { getCategoryConfig, formatCurrency, formatDate } from '../lib/utils';

export default function ExpenseFeed({ expenses, onDelete, onEdit }) {
  const [hoveredId, setHoveredId] = useState(null);

  if (!expenses || expenses.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <div className="text-5xl mb-3">💸</div>
        <p className="font-medium text-slate-400">No expenses yet</p>
        <p className="text-sm mt-1">Type an expense above to get started</p>
      </div>
    );
  }

  // Group by date
  const grouped = {};
  for (const e of expenses) {
    const key = e.date;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  }
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      {sortedDates.map(date => (
        <div key={date}>
          {/* Date separator */}
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-white/5" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-2">
              {formatDate(date)}
            </span>
            <div className="h-px flex-1 bg-white/5" />
          </div>

          {/* Expense bubbles */}
          <div className="space-y-2">
            {grouped[date].map(expense => {
              const cfg = getCategoryConfig(expense.category);
              return (
                <div
                  key={expense.id}
                  className="chat-bubble flex items-start gap-3 group"
                  onMouseEnter={() => setHoveredId(expense.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* Category icon */}
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg flex-shrink-0
                      transition-transform duration-200 group-hover:scale-110"
                    style={{ background: cfg.bg, border: `1px solid ${cfg.color}30` }}
                  >
                    {cfg.emoji}
                  </div>

                  {/* Bubble */}
                  <div
                    className="flex-1 glass rounded-2xl rounded-tl-sm px-4 py-3 glass-hover cursor-default"
                    style={{
                      borderColor: hoveredId === expense.id ? `${cfg.color}30` : 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Merchant / items */}
                        <p className="text-sm font-semibold text-white truncate">
                          {expense.merchant || expense.items?.join(', ') || expense.raw_text || expense.category}
                        </p>
                        {expense.items?.length > 0 && expense.merchant && (
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {expense.items.join(', ')}
                          </p>
                        )}
                        {/* Category badge */}
                        <span
                          className="category-badge inline-block mt-1.5"
                          style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.color}30` }}
                        >
                          {expense.category}
                        </span>
                      </div>

                      {/* Amount */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-base font-bold" style={{ color: cfg.text }}>
                          {formatCurrency(expense.amount)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 capitalize">
                          {expense.source === 'receipt' ? '📷 receipt' : '💬 text'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className={`flex flex-col gap-1 transition-all duration-200 flex-shrink-0
                    ${hoveredId === expense.id ? 'opacity-100' : 'opacity-0'}`}>
                    {onEdit && (
                      <button
                        onClick={() => onEdit(expense)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10
                          transition-all duration-150"
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(expense.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10
                        transition-all duration-150"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
