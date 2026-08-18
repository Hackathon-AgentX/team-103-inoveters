import { useState } from 'react';
import toast from 'react-hot-toast';
import { generateReport } from '../lib/api';
import { FileBarChart2, Download, Sparkles, Calendar } from 'lucide-react';
import { getCurrentYearMonth, formatCurrency, getCategoryConfig } from '../lib/utils';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useRef } from 'react';

export default function Report() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const reportRef = useRef(null);
  const { month, year, name: monthName } = getCurrentYearMonth();

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await generateReport(month, year);
      setReport(res.data.data);
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      if (msg?.includes('API') || msg?.includes('401')) {
        toast.error('❌ Groq API key missing. Check backend/.env');
      } else {
        toast.error(`Failed to generate report: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    try {
      toast.loading('Generating PDF...');
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: '#0a0c14',
        scale: 2,
      });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeight);
      pdf.save(`SpendWise_Report_${report.month}_${report.year}.pdf`);
      toast.dismiss();
      toast.success('PDF downloaded!');
    } catch (err) {
      toast.dismiss();
      toast.error('PDF generation failed');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Monthly Report</h1>
          <p className="text-slate-400 text-sm mt-0.5">AI-generated spending insights</p>
        </div>
        {report && (
          <button
            onClick={handleDownloadPDF}
            className="btn-secondary px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
          >
            <Download size={15} />
            Download PDF
          </button>
        )}
      </div>

      {/* Generate button */}
      {!report && !loading && (
        <div className="glass rounded-3xl p-10 text-center space-y-6 border border-white/[0.06]
          shadow-[0_0_60px_rgba(99,102,241,0.08)]">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500/20 to-violet-600/20
            flex items-center justify-center mx-auto border border-indigo-500/20
            shadow-[0_0_30px_rgba(99,102,241,0.2)] animate-float">
            <FileBarChart2 size={36} className="text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Generate {monthName} Report</h2>
            <p className="text-slate-400 text-sm mt-2 max-w-md mx-auto">
              Claude will analyze your spending patterns, highlight overruns,
              and give you personalized savings tips.
            </p>
          </div>
          <button
            onClick={handleGenerate}
            className="btn-primary px-8 py-3.5 rounded-2xl font-semibold flex items-center gap-3 mx-auto"
          >
            <Sparkles size={18} className="relative z-10" />
            <span className="relative z-10">Generate Report</span>
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="glass rounded-3xl p-12 text-center space-y-4 border border-indigo-500/20
          animate-fade-in shadow-[0_0_30px_rgba(99,102,241,0.15)]">
          <div className="flex justify-center">
            <div className="w-12 h-12 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
          </div>
          <p className="text-indigo-300 font-medium">Claude is analyzing your finances...</p>
          <p className="text-slate-500 text-sm">This may take a few seconds</p>
        </div>
      )}

      {/* Report card */}
      {report && !loading && (
        <div ref={reportRef} className="space-y-5 animate-slide-up">
          {/* Report header */}
          <div className="glass rounded-3xl p-6 border border-indigo-500/20
            shadow-[0_0_40px_rgba(99,102,241,0.12)]">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-600/20
                flex items-center justify-center border border-indigo-500/20">
                <FileBarChart2 size={22} className="text-indigo-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  {report.month} {report.year} — Expense Report
                </h2>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <Sparkles size={10} className="text-indigo-400" />
                  Generated by Claude AI
                </p>
              </div>
            </div>

            {/* Key stats row */}
            {report.stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {[
                  { label: 'Total Spent', value: formatCurrency(report.stats.totalSpent) },
                  { label: 'Daily Avg', value: formatCurrency(report.stats.dailyAvg) },
                  { label: 'Projected', value: formatCurrency(report.stats.projected) },
                  { label: 'vs Last Month', value: report.stats.prevTotal > 0
                    ? `${((report.stats.totalSpent / report.stats.prevTotal - 1) * 100).toFixed(0)}%`
                    : 'N/A',
                    color: report.stats.totalSpent > report.stats.prevTotal ? '#ef4444' : '#10b981'
                  },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white/[0.04] rounded-xl p-3 text-center">
                    <p className="text-lg font-bold" style={{ color: color || 'white' }}>{value}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Category breakdown */}
            {report.stats?.categoryTotals && (
              <div className="space-y-2 mb-5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Category Breakdown</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(report.stats.categoryTotals)
                    .sort(([,a], [,b]) => b - a)
                    .map(([cat, amt]) => {
                      const cfg = getCategoryConfig(cat);
                      const budget = report.stats.budgetMap[cat] || 0;
                      const pct = budget > 0 ? (amt / budget) * 100 : 0;
                      return (
                        <div key={cat} className="flex items-center gap-2 p-2 rounded-xl"
                          style={{ background: cfg.bg }}>
                          <span className="text-base">{cfg.emoji}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold truncate" style={{ color: cfg.text }}>{cat}</p>
                            <p className="text-xs text-white font-bold">{formatCurrency(amt)}</p>
                          </div>
                          {budget > 0 && (
                            <span className="text-xs" style={{ color: pct > 100 ? '#ef4444' : pct > 80 ? '#f59e0b' : '#10b981' }}>
                              {pct.toFixed(0)}%
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* AI report text */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-xs">
                  🤖
                </div>
                <p className="text-xs font-semibold text-indigo-300">Claude's Analysis</p>
              </div>
              <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                {report.report}
              </div>
            </div>
          </div>

          {/* Regenerate */}
          <div className="text-center">
            <button
              onClick={() => { setReport(null); }}
              className="btn-secondary px-6 py-2.5 rounded-xl text-sm font-medium"
            >
              ↩ Regenerate Report
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
