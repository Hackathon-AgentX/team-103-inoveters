import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, Target, FileBarChart2 } from 'lucide-react';

const LINKS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/add', label: 'Add Expense', icon: PlusCircle },
  { to: '/budgets', label: 'Budgets', icon: Target },
  { to: '/report', label: 'Report', icon: FileBarChart2 },
];

export default function Navbar() {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 min-h-screen glass border-r border-white/[0.06] p-4 fixed left-0 top-0 z-40">
        {/* Logo */}
        <div className="flex items-center gap-3 px-3 py-4 mb-6">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-lg shadow-[0_0_20px_rgba(99,102,241,0.4)]">
            💸
          </div>
          <div>
            <h1 className="text-base font-bold gradient-text">SpendWise</h1>
            <p className="text-xs text-slate-500">AI Expense Tracker</p>
          </div>
        </div>

        {/* Nav links */}
        <nav className="space-y-1 flex-1">
          {LINKS.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                ${isActive
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-[0_0_12px_rgba(99,102,241,0.2)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 text-xs text-slate-600">
          Powered by Claude AI
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass border-t border-white/[0.06]
        flex items-center justify-around px-4 py-2 pb-safe">
        {LINKS.map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-1.5 px-3 rounded-xl transition-all duration-200
              ${isActive ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`
            }
          >
            <Icon size={20} />
            <span className="text-[10px] font-medium">{label.split(' ')[0]}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
