import React from 'react';
import { Database, ShieldCheck } from 'lucide-react';

export const GlobalNotice: React.FC = () => {
  return (
    <aside aria-label="System Environment Header" className="bg-white dark:bg-[#0C0D0E] border-b border-black/10 dark:border-white/10 px-4 sm:px-6 lg:px-8 py-1.5 text-[11px] font-mono text-neutral-600 dark:text-neutral-400 flex flex-wrap items-center justify-between transition-colors">
      <div className="flex items-center space-x-2">
        <span className="w-1.5 h-1.5 bg-[#E30613] inline-block"></span>
        <span className="font-bold text-neutral-900 dark:text-white uppercase tracking-wider text-[10px]">
          SYNTHETIC FINANCIAL LEDGER
        </span>
        <span className="text-neutral-300 dark:text-neutral-700">|</span>
        <span className="text-neutral-500 dark:text-neutral-400 truncate max-w-xl">
          Simulated cross-bank network (8 institutions, 100 accounts). Zero real customer PII accessed.
        </span>
      </div>
      <div className="hidden md:flex items-center space-x-4 text-[10px] tracking-wider text-neutral-500 uppercase">
        <span className="flex items-center gap-1">
          <Database className="w-3 h-3 text-[#E30613]" />
          <span>LEDGER: DUAL-ENTRY</span>
        </span>
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-neutral-400" />
          <span>RULES: V2_CANDIDATE</span>
        </span>
      </div>
    </aside>
  );
};
