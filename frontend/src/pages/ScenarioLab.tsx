import React, { useState, useEffect } from 'react';
import {
  FlaskConical,
  Play,
  RotateCcw,
  CheckCircle2,
  TrendingUp,
  BarChart3,
  ShieldAlert,
  ArrowRight,
  Layers,
  Info,
  Network,
  Lock,
  Cpu,
  RefreshCw
} from 'lucide-react';
import { api } from '../lib/api';
import { ScenarioMeta, EvaluationComparison } from '../types/api';

export const ScenarioLab: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'scenarios' | 'federated'>('scenarios');

  // Scenario & Evaluation state
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [runningScenarioId, setRunningScenarioId] = useState<string | null>(null);
  const [scenarioRunFeedback, setScenarioRunFeedback] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationComparison | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  // Federated Learning state
  const [fedStatus, setFedStatus] = useState<any>(null);
  const [fedPrivacy, setFedPrivacy] = useState<any>(null);
  const [fedHistory, setFedHistory] = useState<any[]>([]);
  const [comparisonResult, setComparisonResult] = useState<any>(null);
  const [isTrainingFed, setIsTrainingFed] = useState<boolean>(false);
  const [isComparing, setIsComparing] = useState<boolean>(false);

  const fetchScenarios = async () => {
    try {
      const list = await api.getScenarios();
      setScenarios(list);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchFederatedInfo = async () => {
    try {
      const [status, privacy] = await Promise.all([
        api.getFederatedStatus(),
        api.getFederatedPrivacy()
      ]);
      setFedStatus(status);
      setFedPrivacy(privacy);
    } catch (e) {
      console.error('Failed to fetch federated info:', e);
    }
  };

  useEffect(() => {
    fetchScenarios();
    fetchFederatedInfo();
  }, []);

  const handleRunScenario = async (id: string, seed: number) => {
    setRunningScenarioId(id);
    setScenarioRunFeedback(null);
    try {
      const res = await api.runScenario(id, seed);
      setScenarioRunFeedback(`Scenario ${id} executed successfully. Generated ${res.transactions_count} transactions and ${res.alerts_generated} explainable alerts.`);
    } catch (e: any) {
      setScenarioRunFeedback(`Error running scenario: ${e.message}`);
    } finally {
      setRunningScenarioId(null);
    }
  };

  const handleRunEvaluation = async () => {
    setIsEvaluating(true);
    try {
      const comp = await api.runEvaluation();
      setEvaluation(comp);
    } catch (e) {
      console.error(e);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleTrainFederated = async () => {
    setIsTrainingFed(true);
    try {
      const res = await api.trainFederated({ num_rounds: 5, epochs_per_client: 2, learning_rate: 0.02 });
      setFedHistory(res.rounds_history || []);
      await fetchFederatedInfo();
    } catch (e) {
      console.error('Federated training failed:', e);
    } finally {
      setIsTrainingFed(false);
    }
  };

  const handleCompareFederated = async () => {
    setIsComparing(true);
    try {
      const res = await api.compareFederated(5);
      setComparisonResult(res);
    } catch (e) {
      console.error('Comparison failed:', e);
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Swiss Section Header */}
      <div className="border-b-2 border-neutral-900 dark:border-neutral-100 pb-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-[11px] font-mono uppercase tracking-widest text-swiss-red font-bold">
              <span>EVALUATION & BENCHMARKS</span>
              <span className="text-neutral-400">—</span>
              <span className="text-neutral-500">GROUND TRUTH CALIBRATION & PRIVACY</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-neutral-900 dark:text-neutral-100 mt-1">
              Scenario Lab & Federated Benchmarks.
            </h1>
            <p className="text-xs font-mono text-neutral-500 dark:text-neutral-400 mt-1 max-w-2xl">
              Deterministic scenario evaluation, empirical baseline comparison, and multi-bank federated collaborative learning with differential privacy.
            </p>
          </div>

          {/* Sub-tab switcher */}
          <div className="flex items-center space-x-2 font-mono text-xs">
            <button
              onClick={() => setActiveTab('scenarios')}
              className={`px-4 py-2 uppercase font-bold tracking-wider border transition-colors ${
                activeTab === 'scenarios'
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-neutral-900 dark:border-white'
                  : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700'
              }`}
            >
              Scenario Lab (20)
            </button>
            <button
              onClick={() => setActiveTab('federated')}
              className={`px-4 py-2 uppercase font-bold tracking-wider border transition-colors flex items-center space-x-1.5 ${
                activeTab === 'federated'
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-neutral-900 dark:border-white'
                  : 'bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700'
              }`}
            >
              <Lock className="w-3.5 h-3.5 text-swiss-red" />
              <span>Federated Learning & Privacy</span>
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'scenarios' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-mono text-neutral-500">
              Run deterministic test fixtures or run an empirical comparative benchmark across all 20 scenario families.
            </p>
            <button
              onClick={handleRunEvaluation}
              disabled={isEvaluating}
              className="bg-swiss-red hover:bg-swiss-redHover text-white font-mono font-bold px-5 py-2.5 text-xs uppercase tracking-wider flex items-center space-x-2 transition-colors disabled:opacity-50"
            >
              <BarChart3 className="w-4 h-4" />
              <span>{isEvaluating ? 'EVALUATING BENCHMARKS...' : 'RUN COMPARATIVE BENCHMARK'}</span>
            </button>
          </div>

          {scenarioRunFeedback && (
            <div className="p-4 border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 text-xs font-mono flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 bg-swiss-red inline-block" />
                <span>{scenarioRunFeedback}</span>
              </div>
              <button
                onClick={() => setScenarioRunFeedback(null)}
                className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white font-bold ml-4"
              >
                ✕
              </button>
            </div>
          )}

          {/* Evaluation Results Section (If Run) */}
          {evaluation && (
            <div className="bg-white dark:bg-[#151619] border-2 border-neutral-900 dark:border-neutral-100 p-6 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b-2 border-neutral-900 dark:border-neutral-100 pb-4 gap-4">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-swiss-red font-bold">
                    EMPIRICAL BENCHMARK AUDIT
                  </span>
                  <h2 className="text-xl font-black uppercase tracking-tight text-neutral-900 dark:text-white mt-1">
                    Baseline (v1) vs. Candidate Matrix (v2)
                  </h2>
                  <p className="text-xs font-mono text-neutral-500 mt-0.5">
                    Evaluated against {evaluation.scenarios_evaluated} held-out deterministic scenario families.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-4xl font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                    +{evaluation.relative_f1_delta_pct}%
                  </span>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 font-bold">
                    RELATIVE F1 DELTA
                  </div>
                </div>
              </div>

              {/* Metric Comparison Table */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 font-mono space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">PRECISION</div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {(evaluation.candidate_metrics.precision * 100).toFixed(1)}%
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      BASE: {(evaluation.baseline_metrics.precision * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="p-4 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 font-mono space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">RECALL</div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {(evaluation.candidate_metrics.recall * 100).toFixed(1)}%
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      BASE: {(evaluation.baseline_metrics.recall * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="p-4 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 font-mono space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">FALSE POSITIVE RATE</div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-2xl font-black text-neutral-900 dark:text-white tabular-nums">
                      {(evaluation.candidate_metrics.false_positive_rate * 100).toFixed(1)}%
                    </span>
                    <span className="text-[11px] text-swiss-red">
                      BASE: {(evaluation.baseline_metrics.false_positive_rate * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="p-4 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 font-mono space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">EDGE RECOVERY</div>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-2xl font-black text-neutral-900 dark:text-white tabular-nums">
                      {(evaluation.candidate_metrics.lineage_edge_recovery * 100).toFixed(1)}%
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      BASE: {(evaluation.baseline_metrics.lineage_edge_recovery * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Scenario Catalogue List */}
          <div className="bg-white dark:bg-[#151619] border border-neutral-200 dark:border-neutral-800 p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b-2 border-neutral-900 dark:border-neutral-100 gap-2">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 bg-swiss-red inline-block" />
                  <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-900 dark:text-white font-mono">
                    Deterministic Scenario Catalogue ({scenarios.length})
                  </h2>
                </div>
                <p className="text-xs font-mono text-neutral-500 mt-0.5">
                  Seeded fixtures spanning 5 typology families and multi-hop topologies.
                </p>
              </div>
              <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">
                ISOLATED GROUND-TRUTH LABELS
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scenarios.map((sc, idx) => (
                <div
                  key={sc.id}
                  className="p-5 border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40 hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors flex flex-col justify-between space-y-4"
                >
                  <div>
                    <div className="flex items-center justify-between font-mono">
                      <div className="flex items-center space-x-2">
                        <span className="text-swiss-red font-black text-xs">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className="text-xs font-bold text-neutral-900 dark:text-white">
                          {sc.id}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold border border-neutral-300 dark:border-neutral-700 px-2 py-0.5 bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                        SEED: {sc.seed}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 mt-2 font-sans">
                      {sc.name}
                    </h3>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 leading-relaxed font-sans">
                      {sc.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between font-mono">
                    <span className="text-[9px] uppercase tracking-wider border border-neutral-300 dark:border-neutral-700 px-1.5 py-0.5 text-neutral-500">
                      {sc.scenario_type}
                    </span>
                    <button
                      onClick={() => handleRunScenario(sc.id, sc.seed)}
                      disabled={runningScenarioId === sc.id}
                      className="bg-white dark:bg-neutral-900 hover:bg-neutral-900 hover:text-white dark:hover:bg-neutral-100 dark:hover:text-neutral-900 text-neutral-900 dark:text-neutral-100 font-bold px-3 py-1.5 text-[10px] uppercase tracking-wider border border-neutral-900 dark:border-neutral-100 transition-colors flex items-center space-x-1.5 disabled:opacity-50"
                    >
                      <Play className="w-3 h-3 fill-current text-swiss-red" />
                      <span>{runningScenarioId === sc.id ? 'SEEDING...' : 'RUN SCENARIO'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Federated Learning & Privacy Tab */
        <div className="space-y-6">
          {/* Action Header Card */}
          <div className="bg-white dark:bg-[#151619] border border-neutral-200 dark:border-neutral-800 p-6 space-y-4 font-mono">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] text-swiss-red font-bold uppercase tracking-widest">
                  DECENTRALIZED COLLABORATIVE DETECTION
                </span>
                <h2 className="text-xl font-black uppercase text-neutral-900 dark:text-white mt-0.5">
                  Multi-Bank Federated Learning (FedAvg + DP)
                </h2>
                <p className="text-xs text-neutral-500 mt-1">
                  Trains shared neural detection models across simulated banks without centrally pooling raw transaction records.
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={handleTrainFederated}
                  disabled={isTrainingFed}
                  className="bg-swiss-red hover:bg-swiss-redHover text-white px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTrainingFed ? 'animate-spin' : ''}`} />
                  <span>{isTrainingFed ? 'Training 5 Rounds...' : 'Run 5 FedAvg Rounds'}</span>
                </button>
                <button
                  onClick={handleCompareFederated}
                  disabled={isComparing}
                  className="bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5 border border-neutral-900 dark:border-white transition-colors disabled:opacity-50"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>{isComparing ? 'Comparing...' : 'Compare Centralized vs Fed'}</span>
                </button>
              </div>
            </div>

            {/* Participating Bank Clients Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
              {fedStatus?.registered_banks?.map((b: any) => (
                <div key={b.bank_id} className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-800 text-xs">
                  <div className="text-[10px] text-neutral-400 uppercase font-bold">{b.bank_id}</div>
                  <div className="font-bold text-neutral-900 dark:text-white mt-0.5 truncate">{b.bank_name}</div>
                  <div className="text-[11px] text-neutral-500 mt-1">
                    <span className="font-bold text-neutral-900 dark:text-white">{b.training_samples}</span> local records
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Comparative Benchmark Section (Centralized vs Federated) */}
          {comparisonResult && (
            <div className="bg-white dark:bg-[#151619] border-2 border-neutral-900 dark:border-neutral-100 p-6 space-y-4 font-mono">
              <div className="flex items-center justify-between border-b pb-3 border-neutral-200 dark:border-neutral-800">
                <div>
                  <span className="text-[10px] text-swiss-red uppercase font-bold tracking-wider">
                    EMPIRICAL PRIVACY-UTILITY TRADE-OFF
                  </span>
                  <h3 className="text-lg font-black uppercase text-neutral-900 dark:text-white">
                    Centralized Pooled Training vs Federated Decentralized Training
                  </h3>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {comparisonResult.comparison_delta.utility_retention_pct}%
                  </span>
                  <div className="text-[10px] text-neutral-400 uppercase font-bold">UTILITY RETENTION</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Federated Result */}
                <div className="p-4 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-900 dark:text-purple-300 uppercase">
                      Federated (FedAvg + DP)
                    </span>
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 text-[10px] font-bold rounded">
                      PRIVACY PRESERVED
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center font-bold">
                    <div>
                      <div className="text-base text-neutral-900 dark:text-white">
                        {(comparisonResult.federated_results.metrics.f1 * 100).toFixed(1)}%
                      </div>
                      <div className="text-[9px] text-neutral-400 uppercase">F1 SCORE</div>
                    </div>
                    <div>
                      <div className="text-base text-neutral-900 dark:text-white">
                        {(comparisonResult.federated_results.metrics.precision * 100).toFixed(1)}%
                      </div>
                      <div className="text-[9px] text-neutral-400 uppercase">PRECISION</div>
                    </div>
                    <div>
                      <div className="text-base text-neutral-900 dark:text-white">
                        {(comparisonResult.federated_results.metrics.recall * 100).toFixed(1)}%
                      </div>
                      <div className="text-[9px] text-neutral-400 uppercase">RECALL</div>
                    </div>
                  </div>
                  <p className="text-[10px] text-neutral-500 pt-1 border-t border-purple-100 dark:border-purple-900">
                    {comparisonResult.federated_results.privacy_guarantee}
                  </p>
                </div>

                {/* Centralized Result */}
                <div className="p-4 bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-neutral-900 dark:text-white uppercase">
                      Centralized Pooled (Baseline)
                    </span>
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-bold rounded">
                      RAW POOLING REQUIRED
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center font-bold">
                    <div>
                      <div className="text-base text-neutral-900 dark:text-white">
                        {(comparisonResult.centralized_results.metrics.f1 * 100).toFixed(1)}%
                      </div>
                      <div className="text-[9px] text-neutral-400 uppercase">F1 SCORE</div>
                    </div>
                    <div>
                      <div className="text-base text-neutral-900 dark:text-white">
                        {(comparisonResult.centralized_results.metrics.precision * 100).toFixed(1)}%
                      </div>
                      <div className="text-[9px] text-neutral-400 uppercase">PRECISION</div>
                    </div>
                    <div>
                      <div className="text-base text-neutral-900 dark:text-white">
                        {(comparisonResult.centralized_results.metrics.recall * 100).toFixed(1)}%
                      </div>
                      <div className="text-[9px] text-neutral-400 uppercase">RECALL</div>
                    </div>
                  </div>
                  <p className="text-[10px] text-neutral-500 pt-1 border-t border-neutral-200 dark:border-neutral-800">
                    {comparisonResult.centralized_results.privacy_guarantee}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Convergence History Table */}
          {fedHistory.length > 0 && (
            <div className="bg-white dark:bg-[#151619] border border-neutral-200 dark:border-neutral-800 p-6 space-y-3 font-mono">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 dark:text-white">
                Round-by-Round FedAvg Convergence History
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-neutral-800 text-[10px] text-neutral-400 uppercase">
                      <th className="py-2">Round</th>
                      <th>Participating Banks</th>
                      <th>Training Samples</th>
                      <th>Avg Loss</th>
                      <th>Accuracy</th>
                      <th>Precision</th>
                      <th>Recall</th>
                      <th>F1 Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fedHistory.map((r: any) => (
                      <tr key={r.round} className="border-b border-neutral-100 dark:border-neutral-800/50">
                        <td className="py-2.5 font-bold text-swiss-red">Round {r.round}</td>
                        <td>{r.participating_banks.length} Banks</td>
                        <td>{r.total_training_samples}</td>
                        <td className="font-bold">{r.average_local_loss}</td>
                        <td>{(r.aggregate_metrics.accuracy * 100).toFixed(1)}%</td>
                        <td>{(r.aggregate_metrics.precision * 100).toFixed(1)}%</td>
                        <td>{(r.aggregate_metrics.recall * 100).toFixed(1)}%</td>
                        <td className="font-bold text-emerald-600 dark:text-emerald-400">
                          {(r.aggregate_metrics.f1 * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Privacy Specification & Threat Model Accordion/Card */}
          {fedPrivacy && (
            <div className="bg-white dark:bg-[#151619] border border-neutral-200 dark:border-neutral-800 p-6 space-y-4 font-mono text-xs">
              <div className="flex items-center space-x-2 border-b border-neutral-200 dark:border-neutral-800 pb-3">
                <Lock className="w-4 h-4 text-swiss-red" />
                <h3 className="font-bold uppercase tracking-wider text-neutral-900 dark:text-white">
                  Formal Privacy Boundaries & Isolation Specifications
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-800 space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">
                    Data Kept Strictly Local (Never Transmitted)
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-neutral-600 dark:text-neutral-400 text-[11px]">
                    {fedPrivacy.local_private_data?.map((item: string, i: number) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-800 space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400">
                    Transmitted Model Artifacts
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-neutral-600 dark:text-neutral-400 text-[11px]">
                    {fedPrivacy.transmitted_artifacts?.map((item: string, i: number) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-800 space-y-1.5">
                <span className="text-[10px] uppercase font-bold text-neutral-500">
                  Documented Threat Models & Mitigations
                </span>
                <ul className="list-disc list-inside space-y-1 text-neutral-600 dark:text-neutral-400 text-[11px]">
                  {fedPrivacy.remaining_threat_models?.map((item: string, i: number) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
