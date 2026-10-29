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
  Info
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
        setActiveStep(1);

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
    { id: 'scenario_cross_bank_matrix', index: '01', label: 'Cross-Bank Matrix (5 Hops)' },
    { id: 'scenario_simple_mule_chain', index: '02', label: 'Simple 3-Hop Mule Chain' },
    { id: 'scenario_commission_retention', index: '03', label: 'Commission Retention' },
    { id: 'scenario_split_flow', index: '04', label: 'Rapid Split Flow' },
    { id: 'scenario_merge_flow', index: '05', label: 'Funnel Merge Aggregation' },
    { id: 'scenario_fan_in_fan_out', index: '06', label: 'Fan-In / Fan-Out' },
    { id: 'scenario_circular_cycle', index: '07', label: 'Circular Loop' },
    { id: 'scenario_legit_payroll', index: '08', label: 'Corporate Payroll (Clean)' }
  ];

  return (
    <div className="space-y-8">
      {/* 01 / HEADER — Swiss International Typographic Header */}
      <section className="border-b-2 border-neutral-900 dark:border-neutral-700 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-[10px] font-mono tracking-widest uppercase text-neutral-500">
              <span className="w-2 h-2 bg-[#E30613] inline-block" />
              <span className="font-bold text-neutral-900 dark:text-white">02 // SIMULATION ENGINE</span>
              <span>•</span>
              <span>20 DETERMINISTIC SCENARIO TYPOLOGIES</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight text-neutral-900 dark:text-white leading-[0.95]">
              Inter-Bank Transfer Simulator.
            </h1>

            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 font-normal max-w-2xl">
              Dispatch structured multi-hop fund movements across synthetic member banks, monitor real-time token splits, and observe deterministic rule triggers.
            </p>
          </div>

          <div>
            <button
              onClick={() => setShowManualForm(!showManualForm)}
              className="inline-flex items-center space-x-1.5 px-4 py-2 border-2 border-neutral-900 dark:border-neutral-700 text-xs font-mono font-bold uppercase tracking-wider text-neutral-900 dark:text-white bg-white dark:bg-[#151619] hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-[#E30613]" />
              <span>{showManualForm ? 'Hide Manual Form' : 'Manual Settlement Form'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* 02 / SCENARIO SELECTOR — Swiss Modular Grid */}
      <section className="bg-white dark:bg-[#151619] border-2 border-neutral-900 dark:border-neutral-700 p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-5 border-b border-neutral-200 dark:border-neutral-800">
          <div className="space-y-1.5 flex-1 max-w-xl">
            <span className="text-[10px] font-mono font-bold text-neutral-500 uppercase tracking-widest block">
              CATALOG SELECTION // 20 SCENARIOS
            </span>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <select
                value={selectedScenario}
                onChange={(e) => setSelectedScenario(e.target.value)}
                disabled={isScenarioRunning}
                className="bg-neutral-50 dark:bg-neutral-900 border-2 border-neutral-900 dark:border-neutral-700 px-3 py-2 text-xs font-mono font-bold text-neutral-900 dark:text-white focus:outline-none focus:border-[#E30613] w-full"
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
                className="inline-flex items-center justify-center space-x-2 bg-[#E30613] hover:bg-[#C20510] text-white font-bold uppercase tracking-wider px-6 py-2.5 text-xs transition-colors disabled:opacity-50 flex-shrink-0"
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
            <div className="lg:max-w-md bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-300 dark:border-neutral-700 p-3.5 text-xs font-mono text-neutral-600 dark:text-neutral-400">
              <div className="font-bold text-neutral-900 dark:text-white uppercase mb-1">
                {activeScenarioMeta.name}
              </div>
              <div className="text-[11px] font-sans leading-relaxed line-clamp-2">
                {activeScenarioMeta.description}
              </div>
            </div>
          )}
        </div>

        {/* Quick Typology Buttons (Modular numbered chips) */}
        <div>
          <span className="text-[10px] font-mono font-bold text-neutral-400 uppercase tracking-widest block mb-2">
            RAPID DISPATCH TYPOLOGIES:
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {topScenarios.map(sc => (
              <button
                key={sc.id}
                onClick={() => {
                  setSelectedScenario(sc.id);
                  handleRunScenario(sc.id);
                }}
                disabled={isScenarioRunning}
                className={`p-2 border text-left transition-all ${
                  selectedScenario === sc.id
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-neutral-900 dark:border-white'
                    : 'bg-white dark:bg-[#151619] border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-neutral-900 dark:hover:border-neutral-400'
                } disabled:opacity-50`}
              >
                <div className="text-[9px] font-mono text-[#E30613] font-bold">
                  {sc.index}
                </div>
                <div className="text-[11px] font-bold uppercase tracking-tight truncate mt-0.5">
                  {sc.label}
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 03 / MANUAL FORM (Expandable Swiss Grid) */}
      {showManualForm && (
        <section className="bg-white dark:bg-[#151619] border-2 border-neutral-900 dark:border-neutral-700 p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
            <div>
              <span className="text-[10px] font-mono font-bold text-[#E30613] uppercase tracking-wider block">
                DIRECT SETTLEMENT // LEDGER INJECTION
              </span>
              <h3 className="text-sm font-black uppercase text-neutral-900 dark:text-white mt-0.5">
                Submit Isolated Transfer
              </h3>
            </div>
            <span className="text-[10px] font-mono text-neutral-400 uppercase">Dual-Entry Ledger</span>
          </div>

          <form onSubmit={handlePostTransfer} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Source Account */}
              <div>
                <label className="block text-[11px] font-mono font-bold uppercase text-neutral-700 dark:text-neutral-300 mb-1">
                  Source Account
                </label>
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-900 border-2 border-neutral-900 dark:border-neutral-700 px-3 py-2 text-xs font-mono font-bold text-neutral-900 dark:text-white focus:outline-none"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.account_ref} • {acc.bank_code} ({acc.account_type}) - ₹{(acc.balance_minor / 100).toLocaleString()}
                    </option>
                  ))}
                </select>
                {selectedSrcAcc && (
                  <div className="mt-1 flex items-center space-x-2 text-[10px] font-mono text-neutral-500">
                    <span>{selectedSrcAcc.bank_name || selectedSrcAcc.bank_code}</span>
                    <span>•</span>
                    <span>Balance: ₹{(selectedSrcAcc.balance_minor / 100).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Destination Account */}
              <div>
                <label className="block text-[11px] font-mono font-bold uppercase text-neutral-700 dark:text-neutral-300 mb-1">
                  Destination Account
                </label>
                <select
                  value={destinationId}
                  onChange={(e) => setDestinationId(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-900 border-2 border-neutral-900 dark:border-neutral-700 px-3 py-2 text-xs font-mono font-bold text-neutral-900 dark:text-white focus:outline-none"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.account_ref} • {acc.bank_code} ({acc.account_type}) - ₹{(acc.balance_minor / 100).toLocaleString()}
                    </option>
                  ))}
                </select>
                {selectedDstAcc && (
                  <div className="mt-1 flex items-center space-x-2 text-[10px] font-mono text-neutral-500">
                    <span>{selectedDstAcc.bank_name || selectedDstAcc.bank_code}</span>
                    <span>•</span>
                    <span>Balance: ₹{(selectedDstAcc.balance_minor / 100).toLocaleString()}</span>
                    {selectedSrcAcc && selectedSrcAcc.bank_id !== selectedDstAcc.bank_id && (
                      <span className="text-[#E30613] font-bold uppercase">• Cross-Bank</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-mono font-bold uppercase text-neutral-700 dark:text-neutral-300 mb-1">
                  Amount (INR)
                </label>
                <input
                  type="number"
                  min="1"
                  value={amountInr}
                  onChange={(e) => setAmountInr(Number(e.target.value))}
                  className="w-full bg-neutral-50 dark:bg-neutral-900 border-2 border-neutral-900 dark:border-neutral-700 px-3 py-2 text-xs font-mono font-bold text-neutral-900 dark:text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold uppercase text-neutral-700 dark:text-neutral-300 mb-1">
                  Payment Rail
                </label>
                <select
                  value={rail}
                  onChange={(e) => setRail(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-900 border-2 border-neutral-900 dark:border-neutral-700 px-3 py-2 text-xs font-mono font-bold text-neutral-900 dark:text-white focus:outline-none"
                >
                  <option value="IMPS">IMPS (Immediate)</option>
                  <option value="UPI">UPI (Fast Rail)</option>
                  <option value="NEFT">NEFT (Batch)</option>
                  <option value="RTGS">RTGS (High Value)</option>
                  <option value="CBDC_SIM">e₹ CBDC (Tokenized)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold uppercase text-neutral-700 dark:text-neutral-300 mb-1">
                  Memo
                </label>
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-neutral-900 border-2 border-neutral-900 dark:border-neutral-700 px-3 py-2 text-xs font-mono text-neutral-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="submit"
                disabled={submitting || sourceId === destinationId}
                className="bg-[#E30613] hover:bg-[#C20510] text-white font-bold uppercase tracking-wider px-5 py-2.5 text-xs transition-colors flex items-center space-x-2 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{submitting ? 'Posting...' : 'Post Manual Transfer'}</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* 04 / REAL-TIME TRANSACTION STEPPER — Swiss International Multi-Bank Visualizer */}
      <section className="bg-white dark:bg-[#151619] border-2 border-neutral-900 dark:border-neutral-700 p-6 space-y-4">
        {/* Stepper Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3.5 border-b border-neutral-200 dark:border-neutral-800">
          <div>
            <div className="flex items-center space-x-2">
              {isScenarioRunning && (
                <span className="w-2.5 h-2.5 bg-[#E30613] animate-pulse inline-block" />
              )}
              <h3 className="text-sm font-black uppercase tracking-wider text-neutral-900 dark:text-white">
                {isScenarioRunning
                  ? `Executing Live ${activeScenarioMeta?.name || 'Scenario'} Simulation`
                  : liveSteps.length > 0
                  ? `Simulation Complete: ${scenarioRunSummary?.scenarioName || 'Audited Network'}`
                  : 'Real-Time Multi-Bank Transaction Stepper'}
              </h3>
            </div>
            <p className="text-xs text-neutral-500 font-mono mt-0.5">
              {isScenarioRunning
                ? `Simulating ${liveSteps.length} sequential inter-bank transfers with RBI-compliant programmable e-Rupee token tracking (~1.2s delay).`
                : liveSteps.length > 0
                ? `Successfully audited ${liveSteps.length} sequential transfers across synthetic banking network.`
                : 'Select any scenario from the catalog above and click Run Scenario to watch live sequential transfers.'}
            </p>
          </div>

          {liveSteps.length > 0 && (
            <div className="flex items-center space-x-3">
              <span className="text-xs font-mono font-bold text-[#E30613]">
                TRANSFER {activeStep} OF {liveSteps.length}
              </span>
              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab('investigation', {
                    root_account_id: scenarioRunSummary?.rootAccountId
                  })}
                  className="text-xs font-bold text-neutral-900 dark:text-white hover:text-[#E30613] underline font-mono uppercase whitespace-nowrap"
                >
                  {isScenarioRunning ? 'Skip to Investigation ➔' : 'Investigate Reconstructed Lineage ➔'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Stepper Progress Bar */}
        {liveSteps.length > 0 && (
          <div className="w-full bg-neutral-100 dark:bg-neutral-800 h-1 overflow-hidden">
            <div
              className="bg-[#E30613] h-full transition-all duration-500"
              style={{
                width: `${(activeStep / Math.max(1, liveSteps.length)) * 100}%`
              }}
            />
          </div>
        )}

        {/* Stepper Card Grid Content */}
        {liveSteps.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-10 h-10 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 flex items-center justify-center mx-auto text-neutral-900 dark:text-white font-mono font-bold">
              ⇄
            </div>
            <div className="max-w-md mx-auto text-xs text-neutral-500 font-mono space-y-1.5">
              <p className="font-bold text-neutral-900 dark:text-white uppercase">
                Ready to Simulate Cross-Bank Movements
              </p>
              <p className="leading-relaxed">
                Choose any scenario (such as Cross-Bank Matrix, Rapid Split Flow, or Commission Retention) and click <strong>Run Scenario</strong>. Each transfer will step sequentially in real time with live e-Rupee token splitting and mule alerts.
              </p>
            </div>
            <button
              onClick={() => handleRunScenario('scenario_cross_bank_matrix')}
              className="inline-flex items-center space-x-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-bold uppercase tracking-wider px-4 py-2 text-xs transition-colors"
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
                  className={`p-3.5 border text-xs flex flex-col justify-between transition-all ${
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
                      {isUpcoming && (
                        <span className="text-[10px] text-neutral-400 font-mono">
                          Pending
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
                        {tx.ruleCode && <span className="font-normal font-mono truncate max-w-[100px]">({tx.ruleCode})</span>}
                      </div>
                    ) : tx.isOffRamp ? (
                      <div className="inline-flex items-center space-x-1 text-[9px] font-bold text-neutral-900 dark:text-white bg-neutral-200 dark:bg-neutral-800 px-1.5 py-0.5">
                        <span>🎯 OFF-RAMP</span>
                      </div>
                    ) : (
                      <div className="text-[10px] text-emerald-600 font-mono font-bold uppercase">
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
        <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-neutral-500 font-mono border-t border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center space-x-1.5 text-[10px] uppercase">
            <Shield className="w-3.5 h-3.5 text-[#E30613] flex-shrink-0" />
            <span>🔒 RBI Data Privacy: Lineage audited strictly via programmable e-Rupee token metadata without customer PII leakage.</span>
          </div>

          {scenarioRunSummary && onNavigateTab && !isScenarioRunning && (
            <button
              onClick={() => onNavigateTab('investigation', {
                root_account_id: scenarioRunSummary.rootAccountId
              })}
              className="inline-flex items-center space-x-1.5 bg-[#E30613] hover:bg-[#C20510] text-white font-bold uppercase tracking-wider px-4 py-2 text-xs transition-colors self-start sm:self-auto"
            >
              <span>Investigate Reconstructed Lineage</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </section>
    </div>
  );
};
