import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight, 
  Plus, 
  History, 
  Filter, 
  Save, 
  LayoutDashboard,
  Calendar,
  Building2,
  User,
  ChevronDown,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Types
type UnitType = 'Pasar' | 'Parkir' | 'Hippam';
type TransactionType = 'Pemasukan' | 'Pengeluaran';

interface Transaction {
  id: string;
  date: string;
  unit: UnitType;
  staff: string;
  amount: number;
  type: TransactionType;
  description: string;
  createdAt: number;
  synced?: boolean;
}

export default function App() {
  // State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [unitFilter, setUnitFilter] = useState<UnitType | 'All'>('All');
  const [monthFilter, setMonthFilter] = useState<string>(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    unit: 'Pasar' as UnitType,
    staff: '',
    amount: '',
    type: 'Pemasukan' as TransactionType,
    description: ''
  });

  const SCRIPT_URL = import.meta.env.VITE_GOOGLE_SCRIPT_URL || '';
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [isFetching, setIsFetching] = useState(false);

  // Fetch data from Google Sheets
  const fetchDataFromSheets = async () => {
    if (!SCRIPT_URL) return;
    setIsFetching(true);
    try {
      const response = await fetch(SCRIPT_URL);
      const data = await response.json();
      
      if (Array.isArray(data)) {
        const remoteTransactions = data
          .filter(item => item && typeof item === 'object')
          .map((item: any, index: number) => {
            // Robust parsing for various date formats
            let dateStr = String(item.date || '');
            if (dateStr.includes('T')) dateStr = dateStr.split('T')[0];
            
            // Robust parsing for numeric amounts (handle dots/commas)
            let rawAmount = item.amount;
            let parsedAmount = 0;
            if (typeof rawAmount === 'number') {
              parsedAmount = rawAmount;
            } else if (rawAmount) {
              const cleaned = String(rawAmount).replace(/\./g, '').replace(/,/g, '.');
              parsedAmount = parseFloat(cleaned) || 0;
            }

            return {
              id: item.id || `remote-${index}-${Date.now()}`,
              date: dateStr || new Date().toISOString().substring(0, 10),
              unit: (item.unit || 'Pasar') as UnitType,
              staff: item.staff || '',
              amount: parsedAmount,
              type: (item.type || 'Pemasukan') as TransactionType,
              description: item.description || '',
              createdAt: Date.now() - index,
              synced: true
            };
          });
        
        // Merge with local: priority to local unsynced
        setTransactions(prev => {
          const unsynced = prev.filter(t => !t.synced);
          const remoteIds = new Set(remoteTransactions.map(rt => rt.id));
          const uniqueUnsynced = unsynced.filter(t => !remoteIds.has(t.id));
          return [...uniqueUnsynced, ...remoteTransactions];
        });
      }
    } catch (error) {
      console.error("Gagal mengambil data:", error);
    } finally {
      setIsFetching(false);
    }
  };

  // Load data from localStorage and then Sheets
  useEffect(() => {
    const saved = localStorage.getItem('e_keuangan_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const migrated = parsed
            .filter(t => t && typeof t === 'object')
            .map(t => {
              const date = t.date || new Date().toISOString().substring(0, 10);
              const amount = typeof t.amount === 'number' ? t.amount : parseFloat(t.amount) || 0;
              return { ...t, date, amount, createdAt: t.createdAt || Date.now() };
            });
          setTransactions(migrated);
        }
      } catch (e) {
        console.error("Failed to parse data", e);
      }
    }
    
    // Auto fetch from sheets on mount
    fetchDataFromSheets();
  }, []);

  // Save data to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('e_keuangan_data', JSON.stringify(transactions));
    } catch (e) {
      console.error("Failed to save to localStorage:", e);
    }
  }, [transactions]);
  
  const syncToSheets = async (transactionId: string, data: Transaction) => {
    if (!SCRIPT_URL) return;
    
    setSyncStatus('syncing');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      // Mengirim data ke Google Script menggunakan POST + no-cors
      // Mode no-cors mengizinkan Content-Type: text/plain tanpa preflight CORS
      await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        cache: 'no-cache',
        headers: { 
          'Content-Type': 'text/plain' 
        },
        body: JSON.stringify(data),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      setSyncStatus('success');
      
      // Update status lokal
      setTransactions(prev => prev.map(t => t.id === transactionId ? { ...t, synced: true } : t));
      
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (error) {
      console.error("Gagal sinkronisasi:", error);
      clearTimeout(timeoutId);
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 5000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate
    const staffName = formData.staff.trim();
    const amountStr = String(formData.amount).trim();
    if (!staffName || !amountStr) return;

    const parsedAmount = parseFloat(amountStr);
    if (isNaN(parsedAmount)) return;

    const newTransactionId = Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
    const newTransaction: Transaction = {
      id: newTransactionId,
      date: new Date().toISOString().substring(0, 10),
      unit: formData.unit,
      staff: staffName,
      amount: parsedAmount,
      type: formData.type,
      description: formData.description.trim(),
      createdAt: Date.now(),
      synced: false
    };

    // 1. Close modal and reset form FIRST to avoid UI hang/white screen
    setIsFormOpen(false);
    setFormData({
      unit: 'Pasar',
      staff: '',
      amount: '',
      type: 'Pemasukan',
      description: ''
    });

    // 2. Update local state
    setTransactions(prev => [newTransaction, ...prev]);
    
    // 3. Sync to sheets after UI is ready
    setTimeout(() => {
      syncToSheets(newTransactionId, newTransaction).catch(err => {
        console.error("Delayed sync catch:", err);
      });
    }, 600);
  };

  // Calculations
  const calculations = useMemo(() => {
    if (!Array.isArray(transactions)) {
      return { totalIncome: 0, totalExpense: 0, balance: 0, weeklyBalance: 0, monthlyBalance: 0 };
    }

    const now = new Date();
    const todayStr = now.toISOString().substring(0, 10);
    const monthPrefix = monthFilter; // YYYY-MM
    
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastWeekStr = lastWeek.toISOString().substring(0, 10);

    let totalIncome = 0;
    let totalExpense = 0;
    let weeklyBalance = 0;
    let monthlyBalance = 0;

    transactions.forEach(t => {
      if (!t) return;
      const amount = Number(t.amount) || 0;
      const date = String(t.date || '');
      
      if (t.type === 'Pemasukan') {
        totalIncome += amount;
      } else if (t.type === 'Pengeluaran') {
        totalExpense += amount;
      }

      // Check dates safely
      if (date >= lastWeekStr) {
        weeklyBalance += (t.type === 'Pemasukan' ? amount : -amount);
      }
      
      if (date.startsWith(monthPrefix)) {
        monthlyBalance += (t.type === 'Pemasukan' ? amount : -amount);
      }
    });

    return {
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      weeklyBalance,
      monthlyBalance
    };
  }, [transactions, monthFilter]);

  // Filtered Transactions for List
  const filteredTransactions = useMemo(() => {
    if (!Array.isArray(transactions)) return [];
    return transactions
      .filter(t => {
        if (!t) return false;
        const matchesUnit = unitFilter === 'All' || t.unit === unitFilter;
        const matchesMonth = t.date && typeof t.date === 'string' && t.date.startsWith(monthFilter);
        return matchesUnit && matchesMonth;
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [transactions, unitFilter, monthFilter]);

  const formatCurrency = (amount: any) => {
    const num = Number(amount);
    if (isNaN(num)) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(num);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-600 p-2 rounded-lg">
              <BarChart3 className="text-white w-5 h-5" />
            </div>
            <h1 className="font-bold text-xl tracking-tight">E-Keuangan Unit</h1>
          </div>
          <button 
            onClick={() => setIsFormOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-full flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-emerald-200"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline font-medium">Input Data</span>
          </button>
          {SCRIPT_URL && (
            <button 
              onClick={fetchDataFromSheets}
              disabled={isFetching}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors"
              title="Refresh dari Google Sheets"
            >
              <History className={`w-5 h-5 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* URL Warning */}
        {!SCRIPT_URL && (
          <div className="mb-6 bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-800 text-sm flex items-center gap-3">
             <div className="bg-amber-200 p-1.5 rounded-full">
               <Save className="w-4 h-4" />
             </div>
             <div>
               <p className="font-bold">Google Sheets Belum Terhubung</p>
               <p className="text-amber-700/80">Masukkan URL Apps Script di menu **Secrets** (VITE_GOOGLE_SCRIPT_URL) agar data tersimpan di Google Sheets.</p>
             </div>
          </div>
        )}

        {/* Sync Status Toast */}
        <AnimatePresence>
          {syncStatus !== 'idle' && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 font-medium text-sm"
              style={{ 
                backgroundColor: syncStatus === 'syncing' ? '#1e293b' : syncStatus === 'success' ? '#10b981' : '#f43f5e',
                color: 'white'
              }}
            >
              {syncStatus === 'syncing' && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {syncStatus === 'success' && <Save className="w-4 h-4" />}
              {syncStatus === 'error' && <History className="w-4 h-4" />}
              {syncStatus === 'syncing' ? 'Menyimpan ke Google Sheets...' : syncStatus === 'success' ? 'Berhasil disimpan ke Google Sheets!' : 'Gagal sinkronisasi ke Sheets.'}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-500 text-sm font-medium">Saldo Akhir</span>
              <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                <Wallet className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold">{formatCurrency(calculations.balance)}</div>
            <div className="mt-2 flex items-center gap-1 text-xs font-medium">
              <span className={calculations.monthlyBalance >= 0 ? "text-emerald-600" : "text-rose-600"}>
                {formatCurrency(calculations.monthlyBalance)}
              </span>
              <span className="text-slate-400">Bulan ini</span>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-500 text-sm font-medium">Total Pemasukan</span>
              <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
                <ArrowUpRight className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600">{formatCurrency(calculations.totalIncome)}</div>
            <div className="mt-2 text-xs font-medium text-slate-400">Total akumulasi harian</div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-500 text-sm font-medium">Total Pengeluaran</span>
              <div className="bg-rose-50 p-2 rounded-lg text-rose-600">
                <ArrowDownRight className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-rose-600">{formatCurrency(calculations.totalExpense)}</div>
            <div className="mt-2 text-xs font-medium text-slate-400">Total belanja unit</div>
          </motion.div>
        </div>

        {/* Secondary Stats (Weekly/Monthly) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
           <div className="bg-slate-800 text-white p-4 rounded-xl flex items-center justify-between shadow-md">
             <div>
               <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Saldo Mingguan</p>
               <h3 className="text-lg font-bold">{formatCurrency(calculations.weeklyBalance)}</h3>
             </div>
             <Calendar className="text-slate-600 w-6 h-6" />
           </div>
           <div className="bg-emerald-800 text-white p-4 rounded-xl flex items-center justify-between shadow-md">
             <div>
               <p className="text-emerald-400 text-xs font-medium uppercase tracking-wider">Saldo Bulanan (Berjalan)</p>
               <h3 className="text-lg font-bold">{formatCurrency(calculations.monthlyBalance)}</h3>
             </div>
             <LayoutDashboard className="text-emerald-600 w-6 h-6" />
           </div>
        </div>

        {/* Filters & Content */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-slate-400" />
              <h2 className="font-semibold text-slate-700">Riwayat Setoran</h2>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {transactions.some(t => !t.synced) && (
                <button 
                  onClick={() => {
                    const unsynced = transactions.filter(t => !t.synced);
                    unsynced.forEach((t, i) => {
                      setTimeout(() => syncToSheets(t.id, t), i * 1000);
                    });
                  }}
                  className="px-3 py-2 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-200 transition-all flex items-center gap-2"
                >
                  <History className="w-3 h-3" /> Sync All ({transactions.filter(t => !t.synced).length})
                </button>
              )}
              <div className="relative group">
                <select 
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="appearance-none bg-white border border-slate-200 text-sm px-4 py-2 pr-10 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                >
                  {/* Generated last 12 months for dropdown */}
                  {Array.from({ length: 12 }).map((_, i) => {
                    const d = new Date();
                    d.setMonth(d.getMonth() - i);
                    const val = d.toISOString().substring(0, 7);
                    const label = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(d);
                    return <option key={val} value={val}>{label}</option>
                  })}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>

              <div className="flex p-1 bg-white border border-slate-200 rounded-lg">
                {(['All', 'Pasar', 'Parkir', 'Hippam'] as const).map(u => (
                  <button
                    key={u}
                    onClick={() => setUnitFilter(u)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${unitFilter === u ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-4">Tgl</th>
                  <th className="px-6 py-4">Unit</th>
                  <th className="px-6 py-4">Petugas</th>
                  <th className="px-6 py-4">Keterangan</th>
                  <th className="px-6 py-4">Sinkron</th>
                  <th className="px-6 py-4 text-right">Jumlah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.length > 0 ? (
                  filteredTransactions.map((t) => (
                    <motion.tr 
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      key={t.id} 
                      className="hover:bg-slate-50 transition-colors group"
                    >
                      <td className="px-6 py-4 text-sm text-slate-500">{t.date}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                          t.unit === 'Pasar' ? 'bg-amber-100 text-amber-700' :
                          t.unit === 'Parkir' ? 'bg-blue-100 text-blue-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>
                          {t.unit}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-700">{t.staff}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">{t.description || '-'}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {t.synced ? (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                              <Save className="w-3 h-3" /> SYNCED
                            </span>
                          ) : (
                            <button 
                              onClick={() => syncToSheets(t.id, t)}
                              disabled={syncStatus === 'syncing'}
                              className="flex items-center gap-1 text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-1 rounded hover:bg-rose-100 transition-colors border border-rose-100"
                              title="Gagal atau belum tersimpan ke Sheets. Klik untuk coba lagi."
                            >
                              {syncStatus === 'syncing' ? '...' : <><History className="w-3 h-3" /> GAGAL - RETRY</>}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className={`px-6 py-4 text-sm text-right font-bold ${t.type === 'Pemasukan' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {t.type === 'Pemasukan' ? '+' : '-'} {formatCurrency(t.amount)}
                      </td>
                    </motion.tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                      Tidak ada data untuk periode ini
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="max-w-5xl mx-auto px-4 py-8 mb-10 border-t border-slate-200">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-slate-400 text-xs">
          <p>© 2024 E-Keuangan Unit. Data tersimpan di HP Anda.</p>
          <div className="flex gap-4">
            <button 
              onClick={() => {
                if (window.confirm("Yakin ingin menghapus semua data di HP ini?")) {
                  localStorage.removeItem('e_keuangan_data');
                  window.location.reload();
                }
              }}
              className="hover:text-rose-500 transition-colors"
            >
              Reset Semua Data
            </button>
            <p>Version 1.2.0</p>
          </div>
        </div>
      </footer>

      {/* Input Modal */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFormOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-md p-8 relative shadow-2xl overflow-hidden"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-emerald-100 p-2 rounded-xl">
                  <Plus className="text-emerald-600 w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold">Entry Keuangan</h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Building2 className="w-4 h-4" /> Unit Pasar/Parkir/Hippam
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Pasar', 'Parkir', 'Hippam'] as UnitType[]).map(u => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setFormData({ ...formData, unit: u })}
                        className={`py-2 rounded-xl text-sm font-medium border transition-all ${
                          formData.unit === u 
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-200' 
                          : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Jenis Transaksi</label>
                    <select 
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as TransactionType })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all"
                    >
                      <option value="Pemasukan">Pemasukan</option>
                      <option value="Pengeluaran">Pengeluaran</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                       Jumlah (IDR)
                    </label>
                    <input 
                      type="number"
                      required
                      placeholder="0"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <User className="w-4 h-4" /> Nama Petugas Setor
                  </label>
                  <input 
                    type="text"
                    required
                    placeholder="Contoh: Budi Susanto"
                    value={formData.staff}
                    onChange={(e) => setFormData({ ...formData, staff: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    Keterangan
                  </label>
                  <textarea 
                    rows={2}
                    placeholder="Opsional: Misal Retribusi Parkir Timur"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="flex-1 px-6 py-3 rounded-2xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    Batal
                  </button>
                  <button 
                    type="submit"
                    disabled={syncStatus === 'syncing'}
                    className="flex-1 bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {syncStatus === 'syncing' ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        Simpan
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Sheets Guide */}
      <div className="fixed bottom-6 right-6 hidden lg:block">
        <div className="group relative">
           <div className="bg-slate-800 text-white p-3 rounded-full shadow-lg cursor-help hover:scale-110 transition-all">
             <Download className="w-6 h-6" />
           </div>
           <div className="absolute bottom-full right-0 mb-4 w-72 bg-white border border-slate-200 rounded-2xl p-4 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
             <h4 className="font-bold text-slate-800 mb-2">Simpan ke Google Sheets?</h4>
             <p className="text-xs text-slate-500 leading-relaxed mb-3">
               Aplikasi ini saat ini menyimpan data secara lokal. Untuk menyimpan ke Google Sheets, Anda dapat menghubungkan API Apps Script.
             </p>
             <div className="p-2 bg-slate-50 rounded-lg text-[10px] font-mono text-slate-600">
               // Hubungi Developer untuk deploy ke GAS
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
  /** 
  * KODE GOOGLE APPS SCRIPT (GAS) - VERSI FETCH (READ + WRITE):
  * ---------------------------------------------------------
  * 1. Buka spreadsheet Anda.
  * 2. Klik 'Extensions' -> 'Apps Script'.
  * 3. Hapus SEMUA kode lama, ganti dengan ini:
  *
  * function doGet(e) {
  *   try {
  *     var ss = SpreadsheetApp.getActiveSpreadsheet();
  *     var sheet = ss.getSheets()[0];
  *     var data = sheet.getDataRange().getValues();
  *     var jsonData = [];
  *     for (var i = 1; i < data.length; i++) {
  *       var row = data[i];
  *       if (!row[0] && !row[1]) continue; // Skip baris kosong
  *       jsonData.push({
  *         id: row[7] || "legacy-" + i, 
  *         date: row[0],
  *         unit: row[1],
  *         staff: row[2],
  *         amount: row[3],
  *         type: row[4],
  *         description: row[5]
  *       });
  *     }
  *     return ContentService.createTextOutput(JSON.stringify(jsonData.reverse().slice(0, 300)))
  *       .setMimeType(ContentService.MimeType.JSON);
  *   } catch (err) {
  *     return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
  *   }
  * }
  *
  * function doPost(e) {
  *   try {
  *     var ss = SpreadsheetApp.getActiveSpreadsheet();
  *     var sheet = ss.getSheets()[0];
  *     var data = JSON.parse(e.postData.contents);
  *     // Mapping: [Tanggal, Unit, Petugas, Jumlah, Tipe, Keterangan, Waktu Input, ID]
  *     sheet.appendRow([
  *       data.date, 
  *       data.unit, 
  *       data.staff, 
  *       data.amount, 
  *       data.type, 
  *       data.description, 
  *       new Date(),
  *       data.id
  *     ]);
  *     return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
  *   } catch (err) {
  *     return ContentService.createTextOutput(err.toString()).setMimeType(ContentService.MimeType.TEXT);
  *   }
  * }
  *
  * 4. PENTING: Klik 'Deploy' -> 'New Deployment'.
  * 5. Pilih 'Web App'.
  * 6. Execute as: 'Me'.
  * 7. Who has access: 'Anyone'.
  * 8. Jika muncul Authorize Access, klik 'Review Permissions' -> Akun Google -> 'Advanced' -> 'Go to...' -> 'Allow'.
  * 9. COPY URL Web App dan masukkan ke menu Secrets (VITE_GOOGLE_SCRIPT_URL).
  */

