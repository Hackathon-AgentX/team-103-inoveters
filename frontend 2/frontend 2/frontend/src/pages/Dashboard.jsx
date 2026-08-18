import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, LineChart, Line, CartesianGrid, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, Calendar, Wallet, ArrowRight, Zap } from 'lucide-react';
import { getExpenses, getBudgets } from '../lib/api';
import {
  formatCurrency, getCategoryConfig, groupByCategory, groupByDay,
  getDaysLeftInMonth, getMonthName, CHART_COLORS, CATEGORIES
} from '../lib/utils';
import BudgetBar from '../components/BudgetBar';
import ExpenseFeed from '../components/ExpenseFeed';
import { deleteExpense } from '../lib/api';
import toast from 'react-hot-toast';

// Custom tooltip for charts
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl px-3 py-2 border border-white/10 text-sm">
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-semibold" style={{ color: p.color || '#6366f1' }}>
          {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
};

const DonutTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  const cfg = getCategoryConfig(name);
  return (
    <div className="glass rounded-xl px-3 py-2 border border-white/10 text-sm">
      <p className="text-xs" style={{ color: cfg.text }}>{cfg.emoji} {name}</p>
      <p className="font-bold text-white">{formatCurrency(value)}</p>
    </div>
  );
};

export default function Dashboard() {
  const [expenses, setExpenses] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [expRes, budRes] = await Promise.all([getExpenses(), getBudgets()]);
      setExpenses(expRes.data.data || []);
      setBudgets(budRes.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id) => {
    try {
      await deleteExpense(id);
      setExpenses(prev => prev.filter(e => e.id !== id));
      toast.success('Expense deleted');
    } catch {
      toast.error('Failed to delete expense');
    }
  };

  // Computed stats
  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  const categoryData = groupByCategory(expenses);
  const dailyData = groupByDay(expenses);
  const topCategory = categoryData[0];
  const daysLeft = getDaysLeftInMonth();
  const today = new Date().getDate();
  const dailyAvg = today > 0 ? totalSpent / today : 0;
  const projected = dailyAvg * new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

  // Budget vs actual for line chart
  const budgetActualData = CATEGORIES
    .filter(cat => categoryData.find(c => c.name === cat) || budgets.find(b => b.category === cat && b.monthly_limit > 0))
    .map(cat => {
      const spent = categoryData.find(c => c.name === cat)?.value || 0;
      const budget = budgets.find(b => b.category === cat)?.monthly_limit || 0;
      return { name: cat.slice(0, 4), actual: spent, budget };
    })
    .filter(d => d.actual > 0 || d.budget > 0);

  // Budget alerts
  const overBudget = budgets.filter(b => b.status === 'danger');
  const nearBudget = budgets.filter(b => b.status === 'warning');

  const summaryCards = [
    {
      label: 'Total Spent',
      value: formatCurrency(totalSpent),
      icon: Wallet,
      color: '#6366f1',
      sub: getMonthName(),
    },
    {
      label: 'Top Category',
      value: topCategory ? `${getCategoryConfig(topCategory.name).emoji} ${topCategory.name}` : '—',
      icon: TrendingUp,
      color: topCategory ? getCategoryConfig(topCategory.name).color : '#64748b',
      sub: topCategory ? formatCurrency(topCategory.value) : 'No data',
    },
    {
      label: 'Days Left',
      value: daysLeft,
      icon: Calendar,
      color: '#10b981',
      sub: 'in this month',
    },
    {
      label: 'Projected',
      value: formatCurrency(projected),
      icon: projected > totalSpent * 1.2 ? TrendingUp : TrendingDown,
      color: projected > totalSpent * 1.5 ? '#ef4444' : '#f59e0b',
      sub: 'month-end estimate',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">Loading your finances...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">{getMonthName()} overview</p>
        </div>
        <Link
          to="/add"
          className="btn-primary px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2"
        >
          <Zap size={15} className="relative z-10" />
          <span className="relative z-10">Add Expense</span>
        </Link>
      </div>

      {/* Budget alerts */}
      {(overBudget.length > 0 || nearBudget.length > 0) && (
        <div className="space-y-2">
          {overBudget.map(b => (
            <div key={b.category} className="flex items-center gap-3 px-4 py-3 rounded-xl
              bg-red-500/10 border border-red-500/30 glow-danger">
              <span className="text-lg">{getCategoryConfig(b.category).emoji}</span>
              <p className="text-sm text-red-300 font-medium flex-1">
                🚨 <strong>{b.category}</strong> budget exceeded by {formatCurrency(b.spent - b.monthly_limit)}!
              </p>
            </div>
          ))}
          {nearBudget.map(b => (
            <div key={b.category} className="flex items-center gap-3 px-4 py-3 rounded-xl
              bg-amber-500/10 border border-amber-500/30 glow-warning">
              <span className="text-lg">{getCategoryConfig(b.category).emoji}</span>
              <p className="text-sm text-amber-300 font-medium flex-1">
                ⚠️ You've used <strong>{b.pct.toFixed(0)}%</strong> of your <strong>{b.category}</strong> budget this month.
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map(({ label, value, icon: Icon, color, sub }) => (
          <div key={label} className="glass rounded-2xl p-4 glass-hover space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</p>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: `${color}20` }}>
                <Icon size={15} style={{ color }} />
              </div>
            </div>
            <div>
              <p className="text-xl font-bold text-white">{value}</p>
              <p className="text-xs text-slate-500 mt-1">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Donut chart */}
        <div className="glass rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Spending by Category</h2>
          {categoryData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categoryData.map((entry, i) => (
                      <Cell
                        key={entry.name}
                        fill={getCategoryConfig(entry.name).color}
                        stroke="transparent"
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<DonutTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="flex-1 space-y-2">
                {categoryData.slice(0, 5).map(({ name, value }) => {
                  const cfg = getCategoryConfig(name);
                  return (
                    <div key={name} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                        <span className="text-xs text-slate-300 truncate">{name}</span>
                      </div>
                      <span className="text-xs font-semibold text-white flex-shrink-0">{formatCurrency(value)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
              No expenses this month
            </div>
          )}
        </div>

        {/* Bar chart — daily spending */}
        <div className="glass rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Daily Spending</h2>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="amount" fill="url(#barGradient)" radius={[4, 4, 0, 0]} />
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#7c3aed" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
              No data yet
            </div>
          )}
        </div>
      </div>

      {/* Budget vs Actual */}
      {budgetActualData.length > 0 && (
        <div className="glass rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Budget vs Actual</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={budgetActualData} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#64748b' }} />
              <Bar dataKey="budget" name="Budget" fill="rgba(99,102,241,0.25)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="actual" name="Actual" fill="#6366f1" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Budget progress bars */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">Budget Tracker</h2>
          <Link to="/budgets" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
            Manage <ArrowRight size={12} />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {budgets.filter(b => b.monthly_limit > 0).slice(0, 6).map(b => (
            <BudgetBar key={b.category} budget={b} />
          ))}
        </div>
      </div>

      {/* Recent expenses */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">Recent Expenses</h2>
          <Link to="/add" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
            Add new <ArrowRight size={12} />
          </Link>
        </div>
        <ExpenseFeed expenses={expenses.slice(0, 10)} onDelete={handleDelete} />
      </div>
    </div>
  );
}
