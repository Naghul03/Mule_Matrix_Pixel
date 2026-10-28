import React from 'react';
import { ShieldCheck, Database } from 'lucide-react';

export const GlobalNotice: React.FC = () => {
  return (
    <aside aria-label="Simulation Environment Banner" className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800/80 px-4 py-1.5 text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center justify-between transition-colors">
      <div className="flex items-center space-x-2">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
        <span className="font-semibold text-slate-800 dark:text-slate-200">Synthetic Environment</span>
        <span className="text-slate-300 dark:text-slate-700">|</span>
        <span className="text-slate-600 dark:text-slate-400">All banks, payment rails, accounts, and transactions are simulated. No live financial data is accessed.</span>
      </div>
      <div className="hidden sm:flex items-center space-x-4 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5"><Database className="w-3 h-3 text-slate-400 dark:text-slate-500" /> Multi-Bank Synthetic Ledger</span>
        <span className="flex items-center gap-1.5"><ShieldCheck className="w-3 h-3 text-slate-400 dark:text-slate-500" /> Deterministic Rules Active</span>
      </div>
    </aside>
  );
};
