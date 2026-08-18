import { useState } from 'react';
import toast from 'react-hot-toast';
import { parseText, parseReceipt, createExpense } from '../lib/api';
import ChatInput from '../components/ChatInput';
import ConfirmationCard from '../components/ConfirmationCard';
import ReceiptUpload from '../components/ReceiptUpload';
import ExpenseFeed from '../components/ExpenseFeed';
import { deleteExpense, getExpenses } from '../lib/api';
import { useEffect } from 'react';
import { Sparkles } from 'lucide-react';

export default function AddExpense() {
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [saved, setSaved] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(true);

  useEffect(() => {
    getExpenses().then(r => setSaved(r.data.data || [])).finally(() => setLoadingSaved(false));
  }, []);

  const handleTextSubmit = async (text) => {
    setParsing(true);
    setShowReceipt(false);
    try {
      const res = await parseText(text);
      setParsed(res.data.data);
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      if (msg?.includes('API key') || msg?.includes('401') || msg?.includes('authentication') || msg?.includes('API_KEY')) {
        toast.error('❌ Groq API key invalid. Check backend/.env');
      } else {
        toast.error(`Failed to parse: ${msg}`);
      }
    } finally {
      setParsing(false);
    }
  };

  const handleReceiptFile = async (file) => {
    setShowReceipt(false);
    setParsing(true);
    try {
      const res = await parseReceipt(file);
      setParsed(res.data.data);
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      toast.error(`Receipt parse failed: ${msg}`);
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = async (data) => {
    try {
      const res = await createExpense(data);
      const { data: expense, alert } = res.data;

      // Show budget alert
      if (alert) {
        const opts = {
          duration: 6000,
          className: alert.level === 'danger' ? 'toast-danger' : 'toast-warning',
          icon: alert.level === 'danger' ? '🚨' : '⚠️',
        };
        toast(alert.message, opts);
      } else {
        toast.success('Expense saved! 🎉');
      }

      setSaved(prev => [expense, ...prev]);
      setParsed(null);
    } catch (err) {
      toast.error('Failed to save expense');
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteExpense(id);
      setSaved(prev => prev.filter(e => e.id !== id));
      toast.success('Deleted');
    } catch {
      toast.error('Delete failed');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold gradient-text">Add Expense</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Type naturally — AI will understand ✨
        </p>
      </div>

      {/* AI parsing status */}
      {parsing && (
        <div className="glass rounded-2xl p-6 border border-indigo-500/30 text-center space-y-3
          animate-fade-in shadow-[0_0_30px_rgba(99,102,241,0.15)]">
          <div className="flex items-center justify-center gap-2">
            <Sparkles size={18} className="text-indigo-400 animate-pulse" />
            <span className="text-sm font-medium text-indigo-300">Claude is parsing your expense...</span>
          </div>
          <div className="flex justify-center gap-1">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-indigo-400"
                style={{ animation: `bounce 1s ease-in-out ${i * 0.15}s infinite` }} />
            ))}
          </div>
        </div>
      )}

      {/* Receipt upload */}
      {showReceipt && !parsing && (
        <ReceiptUpload
          onFile={handleReceiptFile}
          onCancel={() => setShowReceipt(false)}
        />
      )}

      {/* Confirmation card */}
      {parsed && !parsing && (
        <ConfirmationCard
          parsed={parsed}
          onConfirm={handleConfirm}
          onCancel={() => setParsed(null)}
        />
      )}

      {/* Main input — always visible */}
      <ChatInput
        onSubmit={handleTextSubmit}
        loading={parsing}
        onReceiptClick={() => { setShowReceipt(s => !s); setParsed(null); }}
      />

      {/* Recent expenses feed */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">This Month</h2>
        {loadingSaved ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton h-16 rounded-2xl" />
            ))}
          </div>
        ) : (
          <ExpenseFeed expenses={saved} onDelete={handleDelete} />
        )}
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
