import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Building,
  Wallet,
  Zap,
  Layers
} from 'lucide-react';
import cytoscape from 'cytoscape';
import { api } from '../lib/api';
import { Account, Bank, Transaction, ScenarioMeta } from '../types/api';
import { useTheme } from '../context/ThemeContext';

export const TransferSimulator: React.FC = () => {
  const { theme } = useTheme();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>('scenario_cross_bank_matrix');

  // Form State
  const [sourceId, setSourceId] = useState<string>('');
  const [destinationId, setDestinationId] = useState<string>('');
  const [amountInr, setAmountInr] = useState<number>(250000);
  const [rail, setRail] = useState<string>('IMPS');
  const [memo, setMemo] = useState<string>('Consulting contract retainer');
  
  // Feedback
  const [submitting, setSubmitting] = useState(false);
  const [lastTxResult, setLastTxResult] = useState<Transaction | null>(null);
  const [recentSignals, setRecentSignals] = useState<string[]>([]);
  const [eventLogs, setEventLogs] = useState<string[]>([]);
  const [isScenarioRunning, setIsScenarioRunning] = useState(false);

  const miniGraphRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const loadInitialData = async () => {
    try {
      const [accs, scs] = await Promise.all([
        api.getAccounts({ limit: 100 }),
        api.getScenarios()
      ]);
      setAccounts(accs);
      setScenarios(scs);

      if (accs.length >= 2) {
        setSourceId(accs[0].id);
        setDestinationId(accs[1].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Initialize Cytoscape mini-graph
  useEffect(() => {
    if (!miniGraphRef.current) return;

    const isDark = theme === 'dark';
    const cy = cytoscape({
      container: miniGraphRef.current,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': isDark ? '#1e293b' : '#f8fafc',
            'border-width': 1.5,
            'border-color': isDark ? '#3b82f6' : '#2563eb',
            'label': 'data(label)',
            'color': isDark ? '#f8fafc' : '#0f172a',
            'font-size': '10px',
            'font-family': 'Inter, sans-serif',
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'width': 26,
            'height': 26
          }
        },
        {
          selector: 'node.suspected',
          style: {
            'background-color': '#e11d48',
            'border-color': '#f43f5e',
            'color': '#e11d48',
            'width': 30,
            'height': 30
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'line-color': isDark ? '#475569' : '#94a3b8',
            'target-arrow-color': isDark ? '#475569' : '#94a3b8',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '9px',
            'color': isDark ? '#94a3b8' : '#64748b',
            'text-background-opacity': 0.8,
            'text-background-color': isDark ? '#0f172a' : '#ffffff',
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle'
          }
        },
        {
          selector: 'edge.active-tx',
          style: {
            'width': 2,
            'line-color': '#2563eb',
            'target-arrow-color': '#2563eb'
          }
        }
      ],
      layout: {
        name: 'concentric',
        concentric: () => 1,
        levelWidth: () => 1,
        padding: 24
      }
    });

    cyRef.current = cy;
    return () => {
      cy.destroy();
    };
  }, [theme]);

  const updateMiniGraph = (srcId: string, dstId: string, amt: number, wasFlagged: boolean) => {
    if (!cyRef.current) return;
    const cy = cyRef.current;

    const srcAcc = accounts.find(a => a.id === srcId);
    const dstAcc = accounts.find(a => a.id === dstId);
    if (!srcAcc || !dstAcc) return;

    if (!cy.getElementById(srcId).length) {
      cy.add({
        group: 'nodes',
        data: { id: srcId, label: `${srcAcc.account_ref} (${srcAcc.bank_code})` }
      });
    }
    if (!cy.getElementById(dstId).length) {
      cy.add({
        group: 'nodes',
        data: { id: dstId, label: `${dstAcc.account_ref} (${dstAcc.bank_code})` }
      });
    }

    const edgeId = `edge-${Date.now()}`;
    cy.add({
      group: 'edges',
      data: {
        id: edgeId,
        source: srcId,
        target: dstId,
        label: `₹${(amt / 100).toLocaleString()}`
      },
      classes: 'active-tx'
    });

    if (wasFlagged) {
      cy.getElementById(dstId).addClass('suspected');
    }

    cy.layout({ name: 'concentric', padding: 24 }).run();
  };

  const handlePostTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceId || !destinationId) return;

    setSubmitting(true);
    setRecentSignals([]);
    try {
      const amountMinor = Math.round(amountInr * 100);
      const idempotencyKey = `manual-${Date.now()}`;
      
      const res = await api.postTransaction({
        source_account_id: sourceId,
        destination_account_id: destinationId,
        amount_minor: amountMinor,
        rail,
        memo,
        idempotency_key: idempotencyKey
      });

      setLastTxResult(res);

      const alerts = await api.getAlerts({ limit: 5 });
      const matchingAlert = alerts.find(a => a.account_id === destinationId || a.account_id === sourceId);
      const wasFlagged = !!matchingAlert;

      if (matchingAlert) {
        setRecentSignals(matchingAlert.rules_triggered);
        setEventLogs(prev => [
          `[ALERT] Account ${matchingAlert.account_ref} triggered signals (${matchingAlert.rules_triggered.join(', ')}) with risk score ${matchingAlert.risk_score}`,
          `[POSTED] ${res.id.slice(0, 8)}: ₹${amountInr.toLocaleString()} via ${rail} (${res.source_bank_code} → ${res.destination_bank_code})`,
          ...prev
        ]);
      } else {
        setEventLogs(prev => [
          `[POSTED] ${res.id.slice(0, 8)}: ₹${amountInr.toLocaleString()} via ${rail} (${res.source_bank_code} → ${res.destination_bank_code}) - Normal settled flow`,
          ...prev
        ]);
      }

      updateMiniGraph(sourceId, destinationId, amountMinor, wasFlagged);

      const updatedAccs = await api.getAccounts({ limit: 100 });
      setAccounts(updatedAccs);
    } catch (err: any) {
      setEventLogs(prev => [`[ERROR] ${err.message}`, ...prev]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunScenario = async () => {
    if (!selectedScenario) return;
    setIsScenarioRunning(true);
    try {
      const result = await api.runScenario(selectedScenario);
      setEventLogs(prev => [
        `[SCENARIO COMPLETE] ${selectedScenario}: ${result.transactions_count} transactions posted, ${result.alerts_generated} explainable alerts generated.`,
        ...prev
      ]);
      const updatedAccs = await api.getAccounts({ limit: 100 });
      setAccounts(updatedAccs);
    } catch (e: any) {
      setEventLogs(prev => [`[SCENARIO ERROR] ${e.message}`, ...prev]);
    } finally {
      setIsScenarioRunning(false);
    }
  };

  const selectedSrcAcc = accounts.find(a => a.id === sourceId);
  const selectedDstAcc = accounts.find(a => a.id === destinationId);

  return (
    <div className="space-y-6">
      {/* Page Title & Replay Scenario Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white flex items-center space-x-2">
            <span>Transfer Simulator</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Submit manual transactions or replay deterministic test scenarios across synthetic banking rails.
          </p>
        </div>

        {/* Replay Controls */}
        <div className="flex items-center space-x-2 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 p-1.5 rounded-lg shadow-sm">
          <select
            value={selectedScenario}
            onChange={(e) => setSelectedScenario(e.target.value)}
            className="bg-transparent text-xs text-slate-800 dark:text-slate-200 border-0 focus:outline-none pr-3 py-1 font-medium"
          >
            {scenarios.map(s => (
              <option key={s.id} value={s.id} className="bg-white dark:bg-slate-900">{s.name}</option>
            ))}
          </select>

          <button
            onClick={handleRunScenario}
            disabled={isScenarioRunning}
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded-md text-xs transition-colors shadow-sm disabled:opacity-50"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>{isScenarioRunning ? 'Running...' : 'Run Scenario'}</span>
          </button>
        </div>
      </div>

      {/* Two-Pane Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Pane: Transfer Form & Log (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-apple">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
              Submit Simulated Transfer
            </h3>

            <form onSubmit={handlePostTransfer} className="space-y-4">
              {/* Source Account */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Source Account
                </label>
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.account_ref} • {acc.bank_code} ({acc.account_type}) - Balance: ₹{(acc.balance_minor / 100).toLocaleString()}
                    </option>
                  ))}
                </select>
                {selectedSrcAcc && (
                  <div className="mt-1 flex items-center space-x-3 text-[11px] text-slate-500">
                    <span>Institution: {selectedSrcAcc.bank_name || selectedSrcAcc.bank_code}</span>
                    <span>•</span>
                    <span>Available: ₹{(selectedSrcAcc.balance_minor / 100).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Destination Account */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Destination Account
                </label>
                <select
                  value={destinationId}
                  onChange={(e) => setDestinationId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.account_ref} • {acc.bank_code} ({acc.account_type}) - Balance: ₹{(acc.balance_minor / 100).toLocaleString()}
                    </option>
                  ))}
                </select>
                {selectedDstAcc && (
                  <div className="mt-1 flex items-center space-x-3 text-[11px] text-slate-500">
                    <span>Institution: {selectedDstAcc.bank_name || selectedDstAcc.bank_code}</span>
                    <span>•</span>
                    <span>Available: ₹{(selectedDstAcc.balance_minor / 100).toLocaleString()}</span>
                    {selectedSrcAcc && selectedSrcAcc.bank_id !== selectedDstAcc.bank_id && (
                      <span className="text-blue-600 dark:text-blue-400 font-medium">• Cross-Bank Transfer</span>
                    )}
                  </div>
                )}
              </div>

              {/* Amount & Rail */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Amount (INR)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={amountInr}
                    onChange={(e) => setAmountInr(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-medium"
                  />
                  <div className="text-[10px] text-slate-400 mt-1">
                    Minor integer units: {amountInr * 100} paise
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Payment Rail
                  </label>
                  <select
                    value={rail}
                    onChange={(e) => setRail(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="IMPS">IMPS (Immediate Payment Service)</option>
                    <option value="UPI">UPI (Unified Payments Interface)</option>
                    <option value="NEFT">NEFT (National Electronic Fund)</option>
                    <option value="RTGS">RTGS (Real Time Gross Settlement)</option>
                    <option value="CBDC_SIM">e₹ Synthetic CBDC</option>
                  </select>
                </div>
              </div>

              {/* Memo */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Memo
                </label>
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={submitting || sourceId === destinationId}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-md text-xs shadow-sm transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{submitting ? 'Posting Transfer to Ledger...' : 'Post Transfer'}</span>
              </button>

              {sourceId === destinationId && (
                <div className="text-[11px] text-red-600 dark:text-red-400">
                  Self-transfers are not permitted.
                </div>
              )}
            </form>

            {/* Post-Submit Result Banner */}
            {lastTxResult && (
              <div className="mt-4 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Transaction Settled
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">
                    ID: {lastTxResult.id}
                  </span>
                </div>

                {recentSignals.length > 0 ? (
                  <div className="p-2 rounded bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 text-xs">
                    <strong>Detection Signal Fired:</strong> {recentSignals.join(', ')}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500">
                    Transaction evaluated by rules engine. No anomaly threshold exceeded.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Event Log Terminal */}
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-apple">
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Simulation Activity Stream
            </h4>
            <div className="bg-slate-50 dark:bg-slate-950 rounded-lg p-3 h-40 overflow-y-auto font-mono text-[11px] text-slate-600 dark:text-slate-300 space-y-1 border border-slate-200/60 dark:border-slate-800/80">
              {eventLogs.length === 0 ? (
                <div className="text-slate-400">No events logged yet. Submit a transfer to begin.</div>
              ) : (
                eventLogs.map((log, i) => (
                  <div key={i} className="border-b border-slate-200/40 dark:border-slate-900 pb-0.5">{log}</div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Pane: Mini Graph Canvas (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col space-y-3">
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex-1 flex flex-col shadow-apple">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Interactive Graph Visualizer
              </h3>
              <span className="text-[10px] text-slate-400 font-medium">Cytoscape Engine</span>
            </div>

            <div
              ref={miniGraphRef}
              className="mt-3 flex-1 min-h-[360px] w-full bg-slate-50 dark:bg-[#090d16] rounded-lg border border-slate-200 dark:border-slate-800"
            />

            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-3">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-600 inline-block"></span> Normal Node</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-600 inline-block"></span> Flagged Mule</span>
              </div>
              <span>Real-Time Graph</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
