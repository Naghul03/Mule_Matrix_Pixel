import React, { useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  ArrowUpRight,
  Play,
  RotateCcw,
  Activity,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { api } from '../lib/api';
import { DetectionAlert, Transaction } from '../types/api';

interface DemoTransferStep {
  step: number;
  sourceRef: string;
  sourceBank: string;
  destRef: string;
  destBank: string;
  amountFormatted: string;
  rail: string;
  memo: string;
  tokenAllocation: string;
  isMuleFlagged: boolean;
  ruleCode?: string;
  isOffRamp?: boolean;
}

const DEMO_TRANSFERS: DemoTransferStep[] = [
  {
    step: 1,
    sourceRef: 'ACC-0001-HDFX',
    sourceBank: 'HDFX',
    destRef: 'ACC-0002-ICIX',
    destBank: 'ICIX',
    amountFormatted: '₹2,50,000.00',
    rail: 'IMPS',
    memo: 'Urgent contract investment',
    tokenAllocation: '100% Principal Minted (e₹-MM-9012)',
    isMuleFlagged: false
  },
  {
    step: 2,
    sourceRef: 'ACC-0002-ICIX',
    sourceBank: 'ICIX',
    destRef: 'ACC-0003-SBNX',
    destBank: 'SBNX',
    amountFormatted: '₹2,35,000.00',
    rail: 'UPI',
    memo: 'Payment settlement ref 883',
    tokenAllocation: '94% Forwarded (Skims 1.7% commission)',
    isMuleFlagged: true,
    ruleCode: 'PASS_THROUGH_VELOCITY & SMALL_RETENTION'
  },
  {
    step: 3,
    sourceRef: 'ACC-0003-SBNX',
    sourceBank: 'SBNX',
    destRef: 'ACC-0004-AXSX',
    destBank: 'AXSX',
    amountFormatted: '₹1,20,000.00',
    rail: 'IMPS',
    memo: 'Disbursal tranche A',
    tokenAllocation: '48% Split Allocation (e₹-MM-9012-A)',
    isMuleFlagged: true,
    ruleCode: 'RAPID_DISPERSAL'
  },
  {
    step: 4,
    sourceRef: 'ACC-0003-SBNX',
    sourceBank: 'SBNX',
    destRef: 'ACC-0005-KOTX',
    destBank: 'KOTX',
    amountFormatted: '₹1,10,000.00',
    rail: 'NEFT',
    memo: 'Disbursal tranche B',
    tokenAllocation: '44% Split Allocation (e₹-MM-9012-B)',
    isMuleFlagged: true,
    ruleCode: 'RAPID_DISPERSAL'
  },
  {
    step: 5,
    sourceRef: 'ACC-0004-AXSX',
    sourceBank: 'AXSX',
    destRef: 'ACC-0008-PAYX',
    destBank: 'PAYX',
    amountFormatted: '₹1,18,000.00',
    rail: 'CBDC_OFFRAMP',
    memo: 'ATM Cash Out terminal PAYX-901',
    tokenAllocation: 'Terminal Cash-Out Extraction',
    isMuleFlagged: false,
    isOffRamp: true,
    ruleCode: 'OFF_RAMP_REACHED'
  }
];

interface OverviewProps {
  onNavigateTab: (tab: string, context?: any) => void;
}

export const Overview: React.FC<OverviewProps> = ({ onNavigateTab }) => {
  const [stats, setStats] = useState({
    transactions: 0,
    alerts: 0,
    investigations: 0,
    banks: 8,
    accounts: 100,
    offRamps: 0
  });
  const [recentAlerts, setRecentAlerts] = useState<DetectionAlert[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [liveEvents, setLiveEvents] = useState<Array<{ type: string; timestamp: string; payload: any }>>([]);
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [activeDemoStep, setActiveDemoStep] = useState<number>(0);

  const fetchOverviewData = async () => {
    try {
      const [health, alerts, txs] = await Promise.all([
        api.getHealth(),
        api.getAlerts({ limit: 5 }),
        api.getTransactions({ limit: 8 })
      ]);

      setStats({
        transactions: health.metrics.transactions,
        alerts: health.metrics.alerts,
        investigations: Math.min(health.metrics.alerts, 4),
        banks: health.metrics.banks || 8,
        accounts: health.metrics.accounts || 100,
        offRamps: Math.floor(health.metrics.transactions * 0.15)
      });
      setRecentAlerts(alerts);
      setRecentTransactions(txs);
    } catch (err) {
      console.error('Failed to load overview data', err);
    }
  };

  useEffect(() => {
    fetchOverviewData();

    const eventSource = new EventSource(api.getEventsStreamUrl());
    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        setLiveEvents((prev) => [parsed, ...prev.slice(0, 24)]);
        if (parsed.type === 'TRANSFER_POSTED') {
          setStats((s) => ({ ...s, transactions: s.transactions + 1 }));
        } else if (parsed.type === 'ALERT_CREATED') {
          setStats((s) => ({ ...s, alerts: s.alerts + 1 }));
        }
      } catch {
        // ignore
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const handleLaunchDemo = async () => {
    if (isDemoRunning) return;
    setIsDemoRunning(true);
    setActiveDemoStep(1);

    try {
      // 1. Kick off database seed and detection processing
      await api.runScenario('scenario_cross_bank_matrix', 101);
      await fetchOverviewData();

      // 2. Step through each transaction in real time (~1.2s per hop)
      for (let s = 2; s <= 5; s++) {
        await new Promise(r => setTimeout(r, 1200));
        setActiveDemoStep(s);
      }

      // 3. Dwell then navigate
      await new Promise(r => setTimeout(r, 1200));
      onNavigateTab('investigation');
    } catch (e) {
      console.error(e);
    } finally {
      setIsDemoRunning(false);
      setActiveDemoStep(0);
    }
  };

  return (
    <div className="space-y-8">
      {/* 01 / HERO SECTION — Asymmetric Swiss International Typographic Layout */}
      <section className="border-b-2 border-neutral-900 dark:border-neutral-700 pb-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center space-x-2 text-[10px] font-mono tracking-widest uppercase text-neutral-500">
              <span className="w-2 h-2 bg-[#E30613] inline-block" />
              <span className="font-bold text-neutral-900 dark:text-white">OPERATIONAL OVERVIEW</span>
              <span>•</span>
              <span>SYNTHETIC INTER-BANK SURVEILLANCE</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black uppercase tracking-tight text-neutral-900 dark:text-white leading-[0.95]">
              Form folgt Raster. <br />
              <span className="text-neutral-500 dark:text-neutral-400">Cross-Bank Mule Intelligence.</span>
            </h1>

            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 max-w-2xl font-normal leading-relaxed pt-1">
              Surveillance console for detecting multi-bank pass-through velocity, inspecting deterministic alert evidence, and reconstructing multi-hop transaction lineage with zero-PII programmable e-Rupee tokens.
            </p>
          </div>

          {/* Action Button Controls (Brutalist Swiss Rectangles) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleLaunchDemo}
              disabled={isDemoRunning}
              className="flex items-center space-x-2 bg-[#E30613] hover:bg-[#C20510] text-white font-bold uppercase tracking-wider px-5 py-2.5 text-xs transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isDemoRunning ? `Simulating ${activeDemoStep}/5...` : 'Run Demo'}</span>
            </button>
            <button
              onClick={() => onNavigateTab('simulator')}
              className="flex items-center space-x-1.5 bg-white dark:bg-[#151619] text-neutral-900 dark:text-white border border-neutral-300 dark:border-neutral-700 hover:border-neutral-900 dark:hover:border-neutral-400 font-bold uppercase tracking-wider px-4 py-2.5 text-xs transition-colors"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-neutral-500" />
              <span>Simulator</span>
            </button>
            <button
              onClick={() => onNavigateTab('scenarios')}
              className="flex items-center space-x-1.5 bg-white dark:bg-[#151619] text-neutral-900 dark:text-white border border-neutral-300 dark:border-neutral-700 hover:border-neutral-900 dark:hover:border-neutral-400 font-bold uppercase tracking-wider px-4 py-2.5 text-xs transition-colors"
            >
              <span>Scenario Lab</span>
            </button>
          </div>
        </div>
      </section>

      {/* Real-Time Live Multi-Bank Simulation Dispatcher (Shows when Run Demo is clicked) */}
      {isDemoRunning && (
        <section className="bg-white dark:bg-[#151619] border-2 border-neutral-900 dark:border-neutral-700 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 bg-[#E30613] animate-pulse inline-block" />
                <h3 className="text-sm font-black uppercase tracking-wider text-neutral-900 dark:text-white">
                  Executing Live Cross-Bank Simulation (Real-Time Stepper)
                </h3>
              </div>
              <p className="text-xs text-neutral-500 font-mono mt-0.5">
                Simulating 5 sequential inter-bank transfers with RBI-compliant programmable e-Rupee token tracking (~1.2s per hop).
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-xs font-mono font-bold text-[#E30613]">
                TRANSFER {activeDemoStep} OF 5
              </span>
              <button
                onClick={() => onNavigateTab('investigation')}
                className="text-xs font-bold text-neutral-900 dark:text-white hover:text-[#E30613] underline font-mono uppercase"
              >
                Skip to Investigation ➔
              </button>
            </div>
          </div>

          {/* Stepper Progress Bar */}
          <div className="w-full bg-neutral-100 dark:bg-neutral-800 h-1 overflow-hidden">
            <div
              className="bg-[#E30613] h-full transition-all duration-500"
              style={{ width: `${(activeDemoStep / 5) * 100}%` }}
            />
          </div>

          {/* Step Cards List (5 Modular Columns) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
            {DEMO_TRANSFERS.map((tx) => {
              const isPast = activeDemoStep > tx.step;
              const isCurrent = activeDemoStep === tx.step;

              return (
                <div
                  key={tx.step}
                  className={`p-3 border text-xs flex flex-col justify-between transition-all ${
                    isCurrent
                      ? 'bg-neutral-50 dark:bg-neutral-900 border-[#E30613] shadow-sm'
                      : isPast
                      ? 'bg-white dark:bg-[#151619] border-neutral-300 dark:border-neutral-700'
                      : 'bg-neutral-50/50 dark:bg-neutral-900/30 border-neutral-200 dark:border-neutral-800 opacity-40'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold text-neutral-500">
                        HOP 0{tx.step}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] font-bold text-[#E30613] animate-pulse uppercase">
                          Active...
                        </span>
                      )}
                      {isPast && (
                        <span className="text-[10px] font-bold text-emerald-600 uppercase">
                          Settled ✓
                        </span>
                      )}
                    </div>

                    <div className="font-mono font-bold text-neutral-900 dark:text-white text-[11px] leading-tight">
                      <div>{tx.sourceRef} <span className="text-neutral-400">({tx.sourceBank})</span></div>
                      <div className="text-neutral-400 text-[10px]">➔ {tx.destRef} ({tx.destBank})</div>
                    </div>

                    <div className="font-mono font-bold text-sm text-neutral-900 dark:text-white tabular-nums">
                      {tx.amountFormatted}
                    </div>
                    <div className="text-[10px] text-neutral-500 font-mono">rail: {tx.rail}</div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-neutral-200 dark:border-neutral-800 space-y-1">
                    <div className="text-[10px] font-mono text-neutral-500 truncate" title={tx.tokenAllocation}>
                      {tx.tokenAllocation}
                    </div>

                    {tx.isMuleFlagged ? (
                      <div className="inline-flex items-center space-x-1 text-[9px] font-bold text-white bg-[#E30613] px-1.5 py-0.5">
                        <span>🚨 MULE FLAGGED</span>
                      </div>
                    ) : tx.isOffRamp ? (
                      <div className="inline-flex items-center space-x-1 text-[9px] font-bold text-neutral-900 dark:text-white bg-neutral-200 dark:bg-neutral-800 px-1.5 py-0.5">
                        <span>🎯 OFF-RAMP</span>
                      </div>
                    ) : (
                      <div className="text-[10px] text-neutral-400 font-mono">Origin Disbursal</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 02 / STRUCTURED KPI GRID — Numbered Swiss Modular Cells */}
      <section className="bg-white dark:bg-[#151619] border-2 border-neutral-900 dark:border-neutral-700">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-y md:divide-y-0 divide-neutral-200 dark:divide-neutral-800">
          {/* Cell 01 */}
          <div className="p-5 space-y-1">
            <div className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tabular-nums font-mono">
              {stats.transactions}
            </div>
            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
              Transactions
            </div>
            <div className="text-[9px] font-mono text-neutral-400">Ledger entries</div>
          </div>

          {/* Cell 02 */}
          <div className="p-5 space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-2xl sm:text-3xl font-black text-[#E30613] tabular-nums font-mono">
                {stats.alerts}
              </div>
              {stats.alerts > 0 && <span className="w-1.5 h-1.5 bg-[#E30613] inline-block" />}
            </div>
            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
              Active Alerts
            </div>
            <div className="text-[9px] font-mono text-neutral-400">Explainable signals</div>
          </div>

          {/* Cell 03 */}
          <div className="p-5 space-y-1">
            <div className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tabular-nums font-mono">
              {recentAlerts.length}
            </div>
            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
              Suspected Mules
            </div>
            <div className="text-[9px] font-mono text-neutral-400">High-risk transit</div>
          </div>

          {/* Cell 04 */}
          <div className="p-5 space-y-1">
            <div className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tabular-nums font-mono">
              {stats.banks}
            </div>
            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
              Member Banks
            </div>
            <div className="text-[9px] font-mono text-neutral-400">HDFX, ICIX, SBNX...</div>
          </div>

          {/* Cell 05 */}
          <div className="p-5 space-y-1">
            <div className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tabular-nums font-mono">
              {stats.accounts}
            </div>
            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
              Active Accounts
            </div>
            <div className="text-[9px] font-mono text-neutral-400">Surveilled entities</div>
          </div>

          {/* Cell 06 */}
          <div className="p-5 space-y-1">
            <div className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tabular-nums font-mono">
              {stats.investigations}
            </div>
            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
              Lineage Cases
            </div>
            <div className="text-[9px] font-mono text-neutral-400">Bounded BFS traces</div>
          </div>
        </div>
      </section>

      {/* OPERATIONAL DATA — Balanced 2-Column Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Detection Alerts */}
        <div className="bg-white dark:bg-[#151619] border border-neutral-300 dark:border-neutral-700 p-5">
          <div className="flex items-center justify-between pb-3.5 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <span className="text-[10px] font-mono font-bold text-[#E30613] uppercase tracking-wider block">
                DETECTIONS
              </span>
              <h3 className="text-sm font-black uppercase text-neutral-900 dark:text-white mt-0.5">
                  Recent Suspicious Mule Alerts
                </h3>
              </div>
              <button
                onClick={() => onNavigateTab('alerts')}
                className="text-xs font-bold text-neutral-900 dark:text-white hover:text-[#E30613] font-mono uppercase tracking-wider flex items-center gap-1"
              >
                <span>View all ({stats.alerts})</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[#E30613]" />
              </button>
            </div>

            <div className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
              {recentAlerts.length === 0 ? (
                <div className="py-8 text-center text-neutral-400 font-mono text-xs">
                  No active alerts recorded. Run a scenario in the Simulator to observe detection.
                </div>
              ) : (
                recentAlerts.map((alert) => (
                  <div key={alert.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 px-2 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-neutral-900 dark:text-white">
                          {alert.account_ref}
                        </span>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-700">
                          {alert.bank_code}
                        </span>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 ${
                          alert.severity === 'CRITICAL' ? 'bg-[#E30613] text-white' :
                          alert.severity === 'HIGH' ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900' :
                          'bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200'
                        }`}>
                          SCORE: {alert.risk_score} • {alert.severity}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500 font-mono">
                        <span className="text-[10px] uppercase font-bold text-neutral-400">Rules:</span>
                        {alert.rules_triggered.map((r) => (
                          <span key={r} className="text-[10px] bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 px-1.5 py-0.2 border border-neutral-200 dark:border-neutral-700">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => onNavigateTab('investigation', { alert_id: alert.id, root_account_id: alert.account_id })}
                      className="self-start sm:self-auto text-xs font-mono font-bold text-neutral-900 dark:text-white hover:bg-[#E30613] hover:text-white px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 transition-colors uppercase tracking-wider"
                    >
                      Investigate ➔
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Settled Ledger Movements */}
          <div className="bg-white dark:bg-[#151619] border border-neutral-300 dark:border-neutral-700 p-5">
            <div className="flex items-center justify-between pb-3.5 border-b border-neutral-200 dark:border-neutral-800">
              <div>
                <span className="text-[10px] font-mono font-bold text-neutral-500 uppercase tracking-wider block">
                  SETTLEMENTS
                </span>
                <h3 className="text-sm font-black uppercase text-neutral-900 dark:text-white mt-0.5">
                  Recent Multi-Bank Transactions
                </h3>
              </div>
              <button
                onClick={() => onNavigateTab('simulator')}
                className="text-xs font-bold text-neutral-900 dark:text-white hover:text-[#E30613] font-mono uppercase tracking-wider flex items-center gap-1"
              >
                <span>Simulate ➔</span>
              </button>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="text-neutral-500 uppercase text-[10px] border-b-2 border-neutral-900 dark:border-neutral-700">
                    <th className="pb-2 font-bold">Source</th>
                    <th className="pb-2 font-bold">Destination</th>
                    <th className="pb-2 font-bold">Rail</th>
                    <th className="pb-2 font-bold">Amount (INR)</th>
                    <th className="pb-2 font-bold">Scope</th>
                    <th className="pb-2 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {recentTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/40">
                      <td className="py-2.5 text-neutral-900 dark:text-neutral-100 font-bold">
                        {tx.source_account_ref} <span className="text-[10px] text-neutral-400">({tx.source_bank_code})</span>
                      </td>
                      <td className="py-2.5 text-neutral-900 dark:text-neutral-100 font-bold">
                        {tx.destination_account_ref} <span className="text-[10px] text-neutral-400">({tx.destination_bank_code})</span>
                      </td>
                      <td className="py-2.5 text-neutral-600 dark:text-neutral-400">{tx.rail}</td>
                      <td className="py-2.5 font-bold text-neutral-900 dark:text-white tabular-nums">
                        ₹{(tx.amount_minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5">
                        {tx.is_cross_bank ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 uppercase">
                            Inter-Bank
                          </span>
                        ) : (
                          <span className="text-[10px] text-neutral-400">Internal</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <span className="text-[10px] font-bold text-emerald-600 uppercase">
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
      </section>
    </div>
  );
};
