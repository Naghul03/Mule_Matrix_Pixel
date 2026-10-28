import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  ArrowRightLeft,
  Building2,
  Users,
  GitFork,
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

      // 3. Brief dwell before navigating to investigation
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
    <div className="space-y-6">
      {/* Top Header Card - Clean Google Cloud / Apple Style */}
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-apple">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                Operations Overview
              </span>
              <span className="text-xs text-slate-400">• Multi-Bank Tracking</span>
            </div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Fraud Operations & Lineage Intelligence
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 max-w-2xl leading-normal">
              Monitor multi-bank pass-through velocity, inspect deterministic alert evidence, and reconstruct multi-hop transaction lineage across synthetic financial networks.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleLaunchDemo}
              disabled={isDemoRunning}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-xs transition-colors shadow-sm disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isDemoRunning ? `Simulating Hop ${activeDemoStep}/5...` : 'Run Demo'}</span>
            </button>
            <button
              onClick={() => onNavigateTab('simulator')}
              className="flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs transition-colors"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500" />
              <span>Transfer Simulator</span>
            </button>
            <button
              onClick={() => onNavigateTab('scenarios')}
              className="flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs transition-colors"
            >
              <span>Scenario Lab</span>
            </button>
          </div>
        </div>
      </div>

      {/* Real-Time Live Multi-Bank Simulation Dispatcher (Shows when Run Demo is clicked) */}
      {isDemoRunning && (
        <div className="bg-white dark:bg-[#0f172a] border border-blue-300 dark:border-blue-900/80 rounded-xl p-5 shadow-apple space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse inline-block" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Executing Live Cross-Bank Simulation (Real-Time Transfer Stepper)
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Simulating 5 sequential inter-bank transfers with RBI-compliant programmable e-Rupee token tracking.
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                Transfer {activeDemoStep} of 5
              </span>
              <button
                onClick={() => onNavigateTab('investigation')}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                Skip to Investigation ➔
              </button>
            </div>
          </div>

          {/* Stepper Progress Bar */}
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-[#1a73e8] h-full transition-all duration-500"
              style={{ width: `${(activeDemoStep / 5) * 100}%` }}
            />
          </div>

          {/* Step Cards List */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-1">
            {DEMO_TRANSFERS.map((tx) => {
              const isPast = activeDemoStep > tx.step;
              const isCurrent = activeDemoStep === tx.step;

              return (
                <div
                  key={tx.step}
                  className={`p-3.5 rounded-lg border text-xs flex flex-col justify-between transition-all ${
                    isCurrent
                      ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-400 dark:border-blue-700 shadow-sm ring-1 ring-blue-400/40'
                      : isPast
                      ? 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 opacity-90'
                      : 'bg-white dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 opacity-40'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-semibold text-slate-500">
                        HOP {tx.step}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium animate-pulse">
                          Active...
                        </span>
                      )}
                      {isPast && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                          Settled
                        </span>
                      )}
                    </div>

                    <div className="font-mono font-medium text-slate-900 dark:text-white text-[11px] leading-tight">
                      <div>{tx.sourceRef} <span className="text-slate-400">({tx.sourceBank})</span></div>
                      <div className="text-slate-400 text-[10px]">➔ {tx.destRef} ({tx.destBank})</div>
                    </div>

                    <div className="font-mono font-bold text-sm text-slate-900 dark:text-white tabular-nums">
                      {tx.amountFormatted}
                    </div>
                    <div className="text-[10px] text-slate-500">via {tx.rail}</div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-1">
                    <div className="text-[10px] font-mono text-slate-500 truncate" title={tx.tokenAllocation}>
                      {tx.tokenAllocation}
                    </div>

                    {tx.isMuleFlagged ? (
                      <div className="inline-flex items-center space-x-1 text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-900">
                        <span>🚨 MULE FLAGGED</span>
                      </div>
                    ) : tx.isOffRamp ? (
                      <div className="inline-flex items-center space-x-1 text-[10px] font-semibold text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-950/80 px-1.5 py-0.5 rounded border border-red-300">
                        <span>🎯 OFF-RAMP</span>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400">Initial Funding</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2 flex items-center justify-between text-xs text-slate-500 border-t border-slate-200 dark:border-slate-800">
            <span>🔒 RBI Data Privacy: Lineage audited strictly via programmable e-Rupee token metadata.</span>
            {activeDemoStep === 5 && (
              <span className="font-medium text-blue-600 dark:text-blue-400 animate-pulse">
                Transitioning to Investigation Workspace...
              </span>
            )}
          </div>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-apple">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Transactions</div>
          <div className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums font-mono">
            {stats.transactions}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Immutable ledger</div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-apple">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Active Alerts</div>
          <div className="text-2xl font-semibold text-amber-600 dark:text-amber-400 mt-1 tabular-nums font-mono">
            {stats.alerts}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Observable signals</div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-apple">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Suspected Mules</div>
          <div className="text-2xl font-semibold text-rose-600 dark:text-rose-400 mt-1 tabular-nums font-mono">
            {recentAlerts.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">High-risk transit</div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-apple">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Synthetic Banks</div>
          <div className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums font-mono">
            {stats.banks}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">HDFX, ICIX, SBNX...</div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-apple">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Active Accounts</div>
          <div className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums font-mono">
            {stats.accounts}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Scalable to 10k+</div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-apple">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Lineage Cases</div>
          <div className="text-2xl font-semibold text-blue-600 dark:text-blue-400 mt-1 tabular-nums font-mono">
            {stats.investigations}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Bounded BFS traces</div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Alerts */}
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-apple">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Recent Detection Alerts
                </h3>
                <p className="text-xs text-slate-500">Every alert records explainable rules and observed thresholds</p>
              </div>
              <button
                onClick={() => onNavigateTab('alerts')}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>View all</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800/80">
              {recentAlerts.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No active alerts recorded. Run a scenario in the Simulator to observe detection.
                </div>
              ) : (
                recentAlerts.map((alert) => (
                  <div key={alert.id} className="py-3 flex items-center justify-between hover:bg-slate-50/70 dark:hover:bg-slate-800/30 px-2 rounded-lg transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {alert.account_ref}
                        </span>
                        <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          {alert.bank_code}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          alert.severity === 'CRITICAL' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60' :
                          alert.severity === 'HIGH' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60' :
                          'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60'
                        }`}>
                          Risk Score: {alert.risk_score} • {alert.severity}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span>Signals:</span>
                        {alert.rules_triggered.map((r) => (
                          <span key={r} className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => onNavigateTab('investigation', { alert_id: alert.id, root_account_id: alert.account_id })}
                      className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/40 px-3 py-1.5 rounded-md border border-blue-200 dark:border-blue-900 transition-colors"
                    >
                      Investigate
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Settled Movements Table */}
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-apple">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Recent Ledger Movements
                </h3>
                <p className="text-xs text-slate-500">Settled multi-bank transactions</p>
              </div>
              <button
                onClick={() => onNavigateTab('simulator')}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>Simulate transfer</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <th className="pb-2 font-medium">Source</th>
                    <th className="pb-2 font-medium">Destination</th>
                    <th className="pb-2 font-medium">Rail</th>
                    <th className="pb-2 font-medium">Amount (INR)</th>
                    <th className="pb-2 font-medium">Cross-Bank</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {recentTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      <td className="py-2.5 font-mono text-slate-800 dark:text-slate-200">
                        {tx.source_account_ref} <span className="text-[10px] text-slate-400">({tx.source_bank_code})</span>
                      </td>
                      <td className="py-2.5 font-mono text-slate-800 dark:text-slate-200">
                        {tx.destination_account_ref} <span className="text-[10px] text-slate-400">({tx.destination_bank_code})</span>
                      </td>
                      <td className="py-2.5 text-slate-500 dark:text-slate-400">{tx.rail}</td>
                      <td className="py-2.5 font-mono font-medium text-slate-900 dark:text-white tabular-nums">
                        ₹{(tx.amount_minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5">
                        {tx.is_cross_bank ? (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                            Inter-Bank
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Internal</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Live Event Feed (1 Col) */}
        <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-apple flex flex-col h-[640px]">
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Live Event Stream</h3>
            </div>
            <span className="text-[10px] font-mono text-slate-400">SSE Connection</span>
          </div>

          <div className="mt-3 flex-1 overflow-y-auto space-y-2 pr-1">
            {liveEvents.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                Awaiting real-time simulation events...
              </div>
            ) : (
              liveEvents.map((evt, idx) => (
                <div key={idx} className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 text-xs space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {evt.type}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-slate-700 dark:text-slate-300 text-[11px] font-mono break-all">
                    {evt.type === 'TRANSFER_POSTED' && (
                      <span>
                        ₹{(evt.payload.amount_minor / 100).toLocaleString()} • {evt.payload.source_bank_code} → {evt.payload.destination_bank_code}
                      </span>
                    )}
                    {evt.type === 'ALERT_CREATED' && (
                      <span className="text-amber-700 dark:text-amber-400 font-medium">
                        Alert on {evt.payload.account_ref} ({evt.payload.severity}) - Score: {evt.payload.risk_score}
                      </span>
                    )}
                    {evt.type === 'TRACE_UPDATED' && (
                      <span className="text-purple-700 dark:text-purple-400">
                        Lineage updated: {evt.payload.accounts_discovered} nodes ({evt.payload.stop_reason})
                      </span>
                    )}
                    {evt.type === 'SIMULATION_STEP' && (
                      <span>
                        Scenario {evt.payload.scenario_id}: +{evt.payload.transactions_posted} txs
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
