import { getCategoryConfig, formatCurrency } from '../lib/utils';

export default function BudgetBar({ budget }) {
  const cfg = getCategoryConfig(budget.category);
  const pct = Math.min(budget.pct, 100);

  const barColor = budget.status === 'danger'
    ? '#ef4444'
    : budget.status === 'warning'
    ? '#f59e0b'
    : cfg.color;

  const bgColor = budget.status === 'danger'
    ? 'rgba(239,68,68,0.1)'
    : budget.status === 'warning'
    ? 'rgba(245,158,11,0.1)'
    : cfg.bg;

  return (
    <div className="glass rounded-2xl p-4 glass-hover transition-all duration-200 space-y-3"
      style={{
        borderColor: budget.status !== 'ok' ? `${barColor}40` : 'rgba(255,255,255,0.06)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
            style={{ background: bgColor }}
          >
            {cfg.emoji}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{budget.category}</p>
            <p className="text-xs text-slate-500">
              {formatCurrency(budget.spent)} of {formatCurrency(budget.monthly_limit)}
            </p>
          </div>
        </div>

        {/* Status */}
        <div className="text-right">
          <p className="text-sm font-bold" style={{ color: barColor }}>
            {budget.pct.toFixed(0)}%
          </p>
          {budget.status === 'danger' ? (
            <p className="text-xs text-red-400">Exceeded</p>
          ) : budget.status === 'warning' ? (
            <p className="text-xs text-amber-400">Almost full</p>
          ) : (
            <p className="text-xs text-slate-500">
              {formatCurrency(budget.remaining)} left
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full rounded-full progress-bar-fill"
          style={{
            width: `${pct}%`,
            background: budget.status === 'ok'
              ? `linear-gradient(90deg, ${cfg.color}aa, ${cfg.color})`
              : barColor,
            boxShadow: `0 0 8px ${barColor}60`,
          }}
        />
      </div>
    </div>
  );
}
