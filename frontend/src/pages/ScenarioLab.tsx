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
  Info
} from 'lucide-react';
import { api } from '../lib/api';
import { ScenarioMeta, EvaluationComparison } from '../types/api';

export const ScenarioLab: React.FC = () => {
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [runningScenarioId, setRunningScenarioId] = useState<string | null>(null);
  const [scenarioRunFeedback, setScenarioRunFeedback] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationComparison | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  const fetchScenarios = async () => {
    try {
      const list = await api.getScenarios();
      setScenarios(list);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchScenarios();
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 flex items-center justify-center text-[#1a73e8]">
              <FlaskConical className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
                Scenario Lab & Evaluation
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                20 seeded fixtures and empirical benchmark comparison (Baseline vs. Candidate Matrix)
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleRunEvaluation}
          disabled={isEvaluating}
          className="inline-flex items-center space-x-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white font-medium px-4 py-2 rounded-lg text-xs shadow-sm transition-colors disabled:opacity-50"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>{isEvaluating ? 'Evaluating Benchmark Seeds...' : 'Run Comparative Benchmark'}</span>
        </button>
      </div>

      {scenarioRunFeedback && (
        <div className="p-3.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-[#1a73e8] shrink-0" />
            <span>{scenarioRunFeedback}</span>
          </div>
          <button onClick={() => setScenarioRunFeedback(null)} className="text-blue-500 hover:text-blue-800 dark:hover:text-blue-100 text-sm font-semibold">✕</button>
        </div>
      )}

      {/* Evaluation Results Section (If Run) */}
      {evaluation && (
        <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-apple space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <span className="text-[11px] font-semibold text-[#1a73e8] uppercase tracking-wider">Empirical Benchmark Report</span>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                Baseline (v1) vs. Candidate Mule Matrix (v2)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Evaluated against {evaluation.scenarios_evaluated} held-out deterministic scenarios across multiple seeds
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400">
                +{evaluation.relative_f1_delta_pct}%
              </span>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Relative F1 Delta</div>
            </div>
          </div>

          {/* Metric Comparison Table */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Precision</div>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {(evaluation.candidate_metrics.precision * 100).toFixed(1)}%
                </span>
                <span className="text-xs font-mono text-slate-500">
                  Base: {(evaluation.baseline_metrics.precision * 100).toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Recall</div>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  {(evaluation.candidate_metrics.recall * 100).toFixed(1)}%
                </span>
                <span className="text-xs font-mono text-slate-500">
                  Base: {(evaluation.baseline_metrics.recall * 100).toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">False Positive Rate (FPR)</div>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-bold font-mono text-[#1a73e8]">
                  {(evaluation.candidate_metrics.false_positive_rate * 100).toFixed(1)}%
                </span>
                <span className="text-xs font-mono text-rose-500">
                  Base: {(evaluation.baseline_metrics.false_positive_rate * 100).toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Lineage Edge Recovery</div>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-bold font-mono text-indigo-600 dark:text-indigo-400">
                  {(evaluation.candidate_metrics.lineage_edge_recovery * 100).toFixed(1)}%
                </span>
                <span className="text-xs font-mono text-slate-500">
                  Base: {(evaluation.baseline_metrics.lineage_edge_recovery * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Confusion Matrices Side by Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Baseline (v1) Confusion Matrix
                </h4>
                <span className="text-[10px] text-slate-500">Single rule heuristic</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs font-mono">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="text-emerald-600 dark:text-emerald-400 font-bold text-base">{evaluation.baseline_metrics.true_positives}</div>
                  <div className="text-[10px] text-slate-500 uppercase mt-0.5">True Positives</div>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="text-rose-600 dark:text-rose-400 font-bold text-base">{evaluation.baseline_metrics.false_positives}</div>
                  <div className="text-[10px] text-slate-500 uppercase mt-0.5">False Positives</div>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="text-amber-600 dark:text-amber-400 font-bold text-base">{evaluation.baseline_metrics.false_negatives}</div>
                  <div className="text-[10px] text-slate-500 uppercase mt-0.5">False Negatives</div>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-700 dark:text-slate-300 font-bold text-base">{evaluation.baseline_metrics.true_negatives}</div>
                  <div className="text-[10px] text-slate-500 uppercase mt-0.5">True Negatives</div>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-blue-200 dark:border-blue-900/60 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-[#1a73e8] dark:text-blue-400">
                  Candidate Matrix (v2) Confusion Matrix
                </h4>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Optimized Ensemble</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs font-mono">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="text-emerald-600 dark:text-emerald-400 font-bold text-base">{evaluation.candidate_metrics.true_positives}</div>
                  <div className="text-[10px] text-slate-500 uppercase mt-0.5">True Positives</div>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="text-emerald-600 dark:text-emerald-400 font-bold text-base">{evaluation.candidate_metrics.false_positives}</div>
                  <div className="text-[10px] text-slate-500 uppercase mt-0.5">False Positives (Low)</div>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="text-amber-600 dark:text-amber-400 font-bold text-base">{evaluation.candidate_metrics.false_negatives}</div>
                  <div className="text-[10px] text-slate-500 uppercase mt-0.5">False Negatives</div>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-700 dark:text-slate-300 font-bold text-base">{evaluation.candidate_metrics.true_negatives}</div>
                  <div className="text-[10px] text-slate-500 uppercase mt-0.5">True Negatives</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scenario Catalogue List (20 Deterministic Fixtures) */}
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-apple">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Deterministic Scenario Catalogue ({scenarios.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Seeded fixtures spanning 5 typology families and multi-hop topologies
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
            Isolated ground-truth labels
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {scenarios.map((sc) => (
            <div
              key={sc.id}
              className="p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white">{sc.id}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono border border-slate-200 dark:border-slate-700">
                    Seed: {sc.seed}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-1.5">{sc.name}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{sc.description}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">{sc.scenario_type}</span>
                <button
                  onClick={() => handleRunScenario(sc.id, sc.seed)}
                  disabled={runningScenarioId === sc.id}
                  className="inline-flex items-center space-x-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium px-3 py-1.5 rounded-lg text-xs border border-slate-300 dark:border-slate-700 transition-colors disabled:opacity-50"
                >
                  <Play className="w-3 h-3 fill-current text-[#1a73e8]" />
                  <span>{runningScenarioId === sc.id ? 'Seeding...' : 'Run Scenario'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
