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
    setIsDemoRunning(true);
    try {
      await api.runScenario('scenario_cross_bank_matrix', 101);
      await fetchOverviewData();
      onNavigateTab('investigation');
    } catch (e) {
      console.error(e);
    } finally {
      setIsDemoRunning(false);
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
              <span>{isDemoRunning ? 'Running Scenario...' : 'Run Judge Demo'}</span>
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
