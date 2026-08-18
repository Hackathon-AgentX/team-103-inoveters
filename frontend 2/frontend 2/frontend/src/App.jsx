import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import AddExpense from './pages/AddExpense';
import Budgets from './pages/Budgets';
import Report from './pages/Report';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen mesh-bg">
        <Navbar />

        {/* Main content area — offset for sidebar on md+ */}
        <main className="md:ml-60 pb-24 md:pb-8 px-4 sm:px-6 py-6 max-w-5xl mx-auto md:mx-0 md:max-w-none">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/add" element={<AddExpense />} />
            <Route path="/budgets" element={<Budgets />} />
            <Route path="/report" element={<Report />} />
          </Routes>
        </main>
      </div>

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'rgba(20, 23, 38, 0.95)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#f0f2ff',
            borderRadius: '14px',
            backdropFilter: 'blur(16px)',
            fontSize: '14px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          },
          success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
    </BrowserRouter>
  );
}
