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
    <div className="space-y-8 animate-fadeIn">
      {/* Swiss Section Header */}
      <div className="border-b-2 border-neutral-900 dark:border-neutral-100 pb-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-[11px] font-mono uppercase tracking-widest text-swiss-red font-bold">
              <span>05 // EVALUATION & BENCHMARKS</span>
              <span className="text-neutral-400">—</span>
              <span className="text-neutral-500">GROUND TRUTH CALIBRATION</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-neutral-900 dark:text-neutral-100 mt-1">
              Scenario Lab & Evaluation.
            </h1>
            <p className="text-xs font-mono text-neutral-500 dark:text-neutral-400 mt-1 max-w-2xl">
              20 deterministic fixtures and empirical benchmark comparison (Baseline vs. Candidate Mule Matrix).
            </p>
          </div>

          <button
            onClick={handleRunEvaluation}
            disabled={isEvaluating}
            className="bg-swiss-red hover:bg-swiss-redHover text-white font-mono font-bold px-5 py-2.5 text-xs uppercase tracking-wider flex items-center space-x-2 transition-colors disabled:opacity-50"
          >
            <BarChart3 className="w-4 h-4" />
            <span>{isEvaluating ? 'EVALUATING BENCHMARKS...' : 'RUN COMPARATIVE BENCHMARK'}</span>
          </button>
        </div>
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

          {/* Confusion Matrices Side by Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="p-5 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/40 space-y-3 font-mono">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-neutral-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 dark:text-neutral-100">
                  Baseline (v1) Matrix
                </h3>
                <span className="text-[10px] text-neutral-500 uppercase">Single Rule Heuristic</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                  <div className="text-emerald-600 dark:text-emerald-400 font-black text-xl tabular-nums">
                    {evaluation.baseline_metrics.true_positives}
                  </div>
                  <div className="text-[9px] text-neutral-500 uppercase mt-0.5 font-bold tracking-wider">
                    TRUE POSITIVES
                  </div>
                </div>
                <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                  <div className="text-swiss-red font-black text-xl tabular-nums">
                    {evaluation.baseline_metrics.false_positives}
                  </div>
                  <div className="text-[9px] text-neutral-500 uppercase mt-0.5 font-bold tracking-wider">
                    FALSE POSITIVES
                  </div>
                </div>
                <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                  <div className="text-amber-600 dark:text-amber-400 font-black text-xl tabular-nums">
                    {evaluation.baseline_metrics.false_negatives}
                  </div>
                  <div className="text-[9px] text-neutral-500 uppercase mt-0.5 font-bold tracking-wider">
                    FALSE NEGATIVES
                  </div>
                </div>
                <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                  <div className="text-neutral-800 dark:text-neutral-200 font-black text-xl tabular-nums">
                    {evaluation.baseline_metrics.true_negatives}
                  </div>
                  <div className="text-[9px] text-neutral-500 uppercase mt-0.5 font-bold tracking-wider">
                    TRUE NEGATIVES
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 border-2 border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-900/40 space-y-3 font-mono">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-neutral-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 dark:text-white">
                  Candidate Matrix (v2)
                </h3>
                <span className="text-[10px] text-swiss-red font-bold uppercase tracking-wider">
                  OPTIMIZED ENSEMBLE
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                  <div className="text-emerald-600 dark:text-emerald-400 font-black text-xl tabular-nums">
                    {evaluation.candidate_metrics.true_positives}
                  </div>
                  <div className="text-[9px] text-neutral-500 uppercase mt-0.5 font-bold tracking-wider">
                    TRUE POSITIVES
                  </div>
                </div>
                <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                  <div className="text-emerald-600 dark:text-emerald-400 font-black text-xl tabular-nums">
                    {evaluation.candidate_metrics.false_positives}
                  </div>
                  <div className="text-[9px] text-neutral-500 uppercase mt-0.5 font-bold tracking-wider">
                    FALSE POSITIVES (LOW)
                  </div>
                </div>
                <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                  <div className="text-amber-600 dark:text-amber-400 font-black text-xl tabular-nums">
                    {evaluation.candidate_metrics.false_negatives}
                  </div>
                  <div className="text-[9px] text-neutral-500 uppercase mt-0.5 font-bold tracking-wider">
                    FALSE NEGATIVES
                  </div>
                </div>
                <div className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                  <div className="text-neutral-800 dark:text-neutral-200 font-black text-xl tabular-nums">
                    {evaluation.candidate_metrics.true_negatives}
                  </div>
                  <div className="text-[9px] text-neutral-500 uppercase mt-0.5 font-bold tracking-wider">
                    TRUE NEGATIVES
                  </div>
                </div>
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
              <span className="text-[10px] font-mono uppercase tracking-widest text-swiss-red font-bold">05.1 //</span>
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
  );
};

