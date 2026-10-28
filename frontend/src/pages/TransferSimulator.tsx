import React, { useState, useEffect } from 'react';
import {
  Send,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Building2,
  ArrowRight,
  Shield,
  Layers,
  ArrowRightLeft,
  ChevronRight,
  Info,
  Clock,
  Sparkles
} from 'lucide-react';
import { api } from '../lib/api';
import { Account, Transaction, ScenarioMeta, DetectionAlert } from '../types/api';

interface TransferSimulatorProps {
  onNavigateTab?: (tab: string, context?: any) => void;
}

interface LiveSimulationStep {
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

export const TransferSimulator: React.FC<TransferSimulatorProps> = ({ onNavigateTab }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>('scenario_cross_bank_matrix');

  // Manual Transfer Form State
  const [sourceId, setSourceId] = useState<string>('');
  const [destinationId, setDestinationId] = useState<string>('');
  const [amountInr, setAmountInr] = useState<number>(250000);
  const [rail, setRail] = useState<string>('IMPS');
  const [memo, setMemo] = useState<string>('Consulting contract retainer');
  const [submitting, setSubmitting] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);

  // Real-Time Stepper State
  const [isScenarioRunning, setIsScenarioRunning] = useState(false);
  const [liveSteps, setLiveSteps] = useState<LiveSimulationStep[]>([]);
  const [activeStep, setActiveStep] = useState<number>(0);
  const [scenarioRunSummary, setScenarioRunSummary] = useState<{
    scenarioName: string;
    totalTxs: number;
    totalAlerts: number;
    rootAccountId?: string;
  } | null>(null);

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

  const handlePostTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceId || !destinationId) return;

    setSubmitting(true);
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

      const alerts = await api.getAlerts({ limit: 10 });
      const matchingAlert = alerts.find(a => a.account_id === destinationId || a.account_id === sourceId);

      const manualStep: LiveSimulationStep = {
        step: 1,
        sourceRef: res.source_account_ref,
        sourceBank: res.source_bank_code,
        destRef: res.destination_account_ref,
        destBank: res.destination_bank_code,
        amountFormatted: `₹${(res.amount_minor / 100).toLocaleString()}`,
        rail: res.rail,
        memo: res.memo || 'Direct settlement',
        tokenAllocation: `e₹ Token #MM-${res.id.slice(0, 6)} (Manual Transfer)`,
        isMuleFlagged: !!matchingAlert,
        ruleCode: matchingAlert?.rules_triggered.join(' & ')
      };

      setLiveSteps([manualStep]);
      setActiveStep(1);
      setScenarioRunSummary({
        scenarioName: 'Manual Settlement Transfer',
        totalTxs: 1,
        totalAlerts: matchingAlert ? 1 : 0,
        rootAccountId: matchingAlert ? matchingAlert.account_id : undefined
      });

      const updatedAccs = await api.getAccounts({ limit: 100 });
      setAccounts(updatedAccs);
    } catch (err: any) {
      alert(`Transfer failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunScenario = async (scenarioIdToRun?: string) => {
    const scId = scenarioIdToRun || selectedScenario;
    if (!scId || isScenarioRunning) return;

    setIsScenarioRunning(true);
    setScenarioRunSummary(null);
    setLiveSteps([]);
    setActiveStep(0);

    try {
      // 1. Trigger backend scenario execution & ground-truth attribution
      const result = await api.runScenario(scId);

      // 2. Fetch all transactions and alerts for this scenario
      const [allTxs, alerts] = await Promise.all([
        api.getTransactions({ scenario_id: scId, limit: 30 }),
        api.getAlerts({ limit: 50 })
      ]);

      // 3. Sort chronologically from first hop to last hop
      const sortedTxs = [...allTxs].sort((a, b) => {
        const timeA = new Date(a.posted_at || a.initiated_at).getTime();
        const timeB = new Date(b.posted_at || b.initiated_at).getTime();
        return timeA - timeB;
      });

      const scMeta = scenarios.find(s => s.id === scId);

      // 4. Map transactions into rich real-time steps with e-Rupee token tracking
      const steps: LiveSimulationStep[] = sortedTxs.map((tx, idx) => {
        const matchingAlert = alerts.find(
          a => a.account_id === tx.destination_account_id || a.account_id === tx.source_account_id
        );
        const isOffRamp =
          tx.rail === 'CBDC_OFFRAMP' ||
          (tx.memo && (tx.memo.toLowerCase().includes('off-ramp') || tx.memo.toLowerCase().includes('cash out') || tx.memo.toLowerCase().includes('atm withdrawal')));

        return {
          step: idx + 1,
          sourceRef: tx.source_account_ref,
          sourceBank: tx.source_bank_code,
          destRef: tx.destination_account_ref,
          destBank: tx.destination_bank_code,
          amountFormatted: `₹${(tx.amount_minor / 100).toLocaleString()}`,
          rail: tx.rail,
          memo: tx.memo || 'Cross-bank movement',
          tokenAllocation: `e₹ Token #MM-${tx.id.slice(0, 6)} (${
            matchingAlert ? 'Transit Pass-Through' : isOffRamp ? 'Terminal Cash-Out' : idx === 0 ? 'Disbursal Funding' : 'Layering Allocation'
          })`,
          isMuleFlagged: !!matchingAlert,
          ruleCode: matchingAlert?.rules_triggered.join(' & '),
          isOffRamp: !!isOffRamp
        };
      });

      setLiveSteps(steps);

      if (steps.length > 0) {
        // Step 1 active immediately
        setActiveStep(1);

        // Subsequent steps with realistic ~1.2s delay per transfer
        for (let s = 2; s <= steps.length; s++) {
          await new Promise(r => setTimeout(r, 1200));
          setActiveStep(s);
        }
      }

      setScenarioRunSummary({
        scenarioName: scMeta?.name || scId,
        totalTxs: steps.length,
        totalAlerts: result.alerts_generated,
        rootAccountId: result.root_account_id
      });

      const updatedAccs = await api.getAccounts({ limit: 100 });
      setAccounts(updatedAccs);
    } catch (e: any) {
      alert(`Error running scenario: ${e.message}`);
    } finally {
      setIsScenarioRunning(false);
    }
  };

  const selectedSrcAcc = accounts.find(a => a.id === sourceId);
  const selectedDstAcc = accounts.find(a => a.id === destinationId);
  const activeScenarioMeta = scenarios.find(s => s.id === selectedScenario);

  const topScenarios = [
    { id: 'scenario_cross_bank_matrix', label: 'Cross-Bank Matrix (5 Hops)' },
    { id: 'scenario_simple_mule_chain', label: 'Simple 3-Hop Mule Chain' },
    { id: 'scenario_commission_retention', label: 'Commission Retention' },
    { id: 'scenario_split_flow', label: 'Rapid Split Flow' },
    { id: 'scenario_merge_flow', label: 'Funnel Merge Aggregation' },
    { id: 'scenario_fan_in_fan_out', label: 'Fan-In / Fan-Out' },
    { id: 'scenario_circular_cycle', label: 'Circular Loop' },
    { id: 'scenario_legit_payroll', label: 'Corporate Payroll (Clean)' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
              Transaction Engine
            </span>
            <span className="text-xs text-slate-400">• Multi-Institution Simulation</span>
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white mt-1">
            Transfer Simulator & Scenario Engine
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Step through 20 deterministic scenario typologies with real-time transfer pacing and programmable e-Rupee token tracking.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowManualForm(!showManualForm)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#0f172a] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500" />
            <span>{showManualForm ? 'Hide Manual Transfer' : 'Manual Transfer Form'}</span>
          </button>
        </div>
      </div>

      {/* Scenario Launcher Card */}
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-apple space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Select Scenario Typology (20 Deterministic Catalogues)
            </span>
            <div className="flex items-center space-x-2">
              <select
                value={selectedScenario}
                onChange={(e) => setSelectedScenario(e.target.value)}
                disabled={isScenarioRunning}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-md"
              >
                {scenarios.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.scenario_type})
                  </option>
                ))}
              </select>

              <button
                onClick={() => handleRunScenario()}
                disabled={isScenarioRunning}
                className="inline-flex items-center space-x-2 bg-[#1a73e8] hover:bg-blue-700 text-white font-medium px-5 py-2 rounded-lg text-xs transition-colors shadow-sm disabled:opacity-50 flex-shrink-0"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  {isScenarioRunning
                    ? `Simulating Hop ${activeStep}/${liveSteps.length || '...'}`
                    : 'Run Scenario'}
                </span>
              </button>
            </div>
          </div>

          {activeScenarioMeta && (
            <div className="lg:max-w-md bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-xs text-slate-600 dark:text-slate-400">
              <div className="font-medium text-slate-900 dark:text-white mb-0.5">
                {activeScenarioMeta.name}
              </div>
              <div className="text-[11px] leading-relaxed line-clamp-2">
                {activeScenarioMeta.description}
              </div>
            </div>
          )}
        </div>

        {/* Quick Scenario Buttons */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Quick Scenarios:
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {topScenarios.map(sc => (
              <button
                key={sc.id}
                onClick={() => {
                  setSelectedScenario(sc.id);
                  handleRunScenario(sc.id);
                }}
                disabled={isScenarioRunning}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                  selectedScenario === sc.id
                    ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                } disabled:opacity-50`}
              >
                {sc.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Manual Transfer Form (Expandable) */}
      {showManualForm && (
        <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-apple space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Submit Manual Settlement Transfer
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">Isolated Synthetic Ledger</span>
          </div>

          <form onSubmit={handlePostTransfer} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Source Account */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Source Account
                </label>
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.account_ref} • {acc.bank_code} ({acc.account_type}) - ₹{(acc.balance_minor / 100).toLocaleString()}
                    </option>
                  ))}
                </select>
                {selectedSrcAcc && (
                  <div className="mt-1 flex items-center space-x-2 text-[11px] text-slate-500">
                    <span>{selectedSrcAcc.bank_name || selectedSrcAcc.bank_code}</span>
                    <span>•</span>
                    <span className="font-mono">Balance: ₹{(selectedSrcAcc.balance_minor / 100).toLocaleString()}</span>
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
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.account_ref} • {acc.bank_code} ({acc.account_type}) - ₹{(acc.balance_minor / 100).toLocaleString()}
                    </option>
                  ))}
                </select>
                {selectedDstAcc && (
                  <div className="mt-1 flex items-center space-x-2 text-[11px] text-slate-500">
                    <span>{selectedDstAcc.bank_name || selectedDstAcc.bank_code}</span>
                    <span>•</span>
                    <span className="font-mono">Balance: ₹{(selectedDstAcc.balance_minor / 100).toLocaleString()}</span>
                    {selectedSrcAcc && selectedSrcAcc.bank_id !== selectedDstAcc.bank_id && (
                      <span className="text-blue-600 dark:text-blue-400 font-medium">• Cross-Bank Transfer</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Amount (INR)
                </label>
                <input
                  type="number"
                  min="1"
                  value={amountInr}
                  onChange={(e) => setAmountInr(Number(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Payment Rail
                </label>
                <select
                  value={rail}
                  onChange={(e) => setRail(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="IMPS">IMPS</option>
                  <option value="UPI">UPI</option>
                  <option value="NEFT">NEFT</option>
                  <option value="RTGS">RTGS</option>
                  <option value="CBDC_SIM">e₹ CBDC</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Memo
                </label>
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end">
              <button
                type="submit"
                disabled={submitting || sourceId === destinationId}
                className="bg-[#1a73e8] hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-md text-xs shadow-sm transition-colors flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{submitting ? 'Posting Transfer...' : 'Post Manual Transfer'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Real-Time Multi-Bank Transaction Stepper (Exact Visualizer from Overview & Demo) */}
      <div className="bg-white dark:bg-[#0f172a] border border-blue-300 dark:border-blue-900/80 rounded-xl p-5 shadow-apple space-y-4">
        {/* Stepper Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3.5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              {isScenarioRunning && (
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse inline-block" />
              )}
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {isScenarioRunning
                  ? `Executing Live ${activeScenarioMeta?.name || 'Scenario'} Simulation (Real-Time Transfer Stepper)`
                  : liveSteps.length > 0
                  ? `Simulation Complete: ${scenarioRunSummary?.scenarioName || 'Audited Network'}`
                  : 'Real-Time Multi-Bank Transaction Stepper'}
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {isScenarioRunning
                ? `Simulating ${liveSteps.length} sequential inter-bank transfers with RBI-compliant programmable e-Rupee token tracking (1.2s per transfer).`
                : liveSteps.length > 0
                ? `Successfully audited ${liveSteps.length} sequential transfers across synthetic banking network.`
                : 'Select any scenario from the catalog above and click Run Scenario to watch live sequential transfers.'}
            </p>
          </div>

          {liveSteps.length > 0 && (
            <div className="flex items-center space-x-3">
              <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                Transfer {activeStep} of {liveSteps.length}
              </span>
              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab('investigation', {
                    root_account_id: scenarioRunSummary?.rootAccountId
                  })}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium whitespace-nowrap"
                >
                  {isScenarioRunning ? 'Skip to Investigation ➔' : 'Investigate Reconstructed Lineage ➔'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Stepper Progress Bar */}
        {liveSteps.length > 0 && (
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-[#1a73e8] h-full transition-all duration-500"
              style={{
                width: `${(activeStep / Math.max(1, liveSteps.length)) * 100}%`
              }}
            />
          </div>
        )}

        {/* Stepper Card Grid Content */}
        {liveSteps.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 flex items-center justify-center mx-auto text-[#1a73e8]">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div className="max-w-md mx-auto text-xs text-slate-500 space-y-1.5">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                Ready to Simulate Cross-Bank Movements
              </p>
              <p className="leading-relaxed">
                Choose any scenario (such as Cross-Bank Matrix, Rapid Split Flow, or Commission Retention) and click <strong>Run Scenario</strong>. Each transfer will step sequentially in real time (~1.2s delay) with live e-Rupee token splitting and mule alerts.
              </p>
            </div>
            <button
              onClick={() => handleRunScenario('scenario_cross_bank_matrix')}
              className="inline-flex items-center space-x-2 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Launch Cross-Bank Matrix Showcase</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 pt-1">
            {liveSteps.map((tx) => {
              const isPast = activeStep > tx.step;
              const isCurrent = activeStep === tx.step;
              const isUpcoming = activeStep < tx.step;

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
                          Settled ✓
                        </span>
                      )}
                      {isUpcoming && (
                        <span className="text-[10px] text-slate-400">
                          Pending
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
                        {tx.ruleCode && <span className="font-normal font-mono truncate max-w-[100px]">({tx.ruleCode})</span>}
                      </div>
                    ) : tx.isOffRamp ? (
                      <div className="inline-flex items-center space-x-1 text-[10px] font-semibold text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-950/80 px-1.5 py-0.5 rounded border border-red-300">
                        <span>🎯 OFF-RAMP</span>
                      </div>
                    ) : (
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        Normal Settled
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Stepper Footer & Direct Investigation Action */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-1.5 text-[11px]">
            <Shield className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <span>🔒 RBI Data Privacy: Lineage audited strictly via programmable e-Rupee token metadata without customer PII leakage.</span>
          </div>

          {scenarioRunSummary && onNavigateTab && !isScenarioRunning && (
            <button
              onClick={() => onNavigateTab('investigation', {
                root_account_id: scenarioRunSummary.rootAccountId
              })}
              className="inline-flex items-center space-x-1.5 bg-[#1a73e8] hover:bg-blue-700 text-white font-medium px-4 py-1.5 rounded-lg text-xs shadow-sm transition-colors whitespace-nowrap self-start sm:self-auto"
            >
              <span>Investigate Reconstructed Lineage</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
