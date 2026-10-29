import React, { useState, useEffect } from 'react';
import { Sliders, Save, RotateCcw, CheckCircle2, ShieldCheck, Cpu } from 'lucide-react';
import { api } from '../lib/api';
import { AppSettings } from '../types/api';

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const fetchSettings = async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const updated = await api.updateSettings(settings);
      setSettings(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setSettings({
      detector_version: 'v2_candidate_matrix',
      pass_through_ratio_threshold: 0.85,
      pass_through_window_minutes: 60,
      velocity_burst_count: 5,
      velocity_burst_window_minutes: 30,
      fan_in_min_counterparties: 4,
      fan_out_min_counterparties: 3,
      retention_min_pct: 0.01,
      retention_max_pct: 0.15,
      risk_alert_threshold: 65.0,
      lookback_hours: 72,
      lookahead_hours: 72,
      max_hops: 12,
      max_nodes: 150
    });
  };

  if (!settings) {
    return (
      <div className="text-neutral-400 font-mono text-xs py-12 text-center uppercase">
        LOADING SYSTEM CONFIGURATION ARCHITECTURE...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      {/* Swiss Section Header */}
      <div className="border-b-2 border-neutral-900 dark:border-neutral-100 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-[11px] font-mono uppercase tracking-widest text-swiss-red font-bold">
              <span>SYSTEM & RULES</span>
              <span className="text-neutral-400">—</span>
              <span className="text-neutral-500">ENGINE CONFIGURATION</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-neutral-900 dark:text-neutral-100 mt-1">
              System & Thresholds.
            </h1>
            <p className="text-xs font-mono text-neutral-500 dark:text-neutral-400 mt-1">
              Configure explainable detector thresholds, time windows, and bounded traversal budgets.
            </p>
          </div>

          <button
            onClick={handleResetDefaults}
            className="border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-neutral-900 text-neutral-800 dark:text-neutral-200 font-mono font-bold px-3 py-2 text-xs uppercase tracking-wider flex items-center space-x-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-neutral-500" />
            <span>RESET DEFAULTS</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-4 border-2 border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>ENGINE CONFIGURATION PERSISTED. APPLIED TO ACTIVE DETECTOR ENSEMBLE.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8 font-mono">
        {/* Detection Engine Configuration */}
        <div className="bg-white dark:bg-[#151619] border border-neutral-200 dark:border-neutral-800 p-6 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b-2 border-neutral-900 dark:border-neutral-100">
            <div className="flex items-center space-x-2">
              <span className="w-1.5 h-1.5 bg-swiss-red inline-block" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-900 dark:text-white">
                Detection Algorithm Parameters
              </h2>
            </div>
            <span className="text-[9px] text-neutral-400 uppercase">RUN-TIME SCORING RULES</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div className="space-y-1.5">
              <label className="block text-[10px] uppercase tracking-wider font-bold text-neutral-700 dark:text-neutral-300">
                Active Detector Version
              </label>
              <select
                value={settings.detector_version}
                onChange={(e) => setSettings({ ...settings, detector_version: e.target.value })}
                className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-neutral-900 dark:text-neutral-100 font-bold focus:outline-none focus:border-neutral-900"
              >
                <option value="v2_candidate_matrix">v2_candidate_matrix (Explainable Multi-Signal Engine)</option>
                <option value="v1_baseline">v1_baseline (Traditional Velocity Baseline)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] uppercase tracking-wider font-bold text-neutral-700 dark:text-neutral-300">
                Composite Risk Alert Threshold (0-100)
              </label>
              <input
                type="number"
                step="1"
                min="10"
                max="100"
                value={settings.risk_alert_threshold}
                onChange={(e) => setSettings({ ...settings, risk_alert_threshold: Number(e.target.value) })}
                className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-neutral-900 dark:text-neutral-100 font-bold focus:outline-none focus:border-neutral-900"
              />
              <span className="text-[10px] text-neutral-500 block">Triggers investigation docket when breached</span>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] uppercase tracking-wider font-bold text-neutral-700 dark:text-neutral-300">
                Pass-Through Forwarding Ratio
              </label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="1.0"
                value={settings.pass_through_ratio_threshold}
                onChange={(e) => setSettings({ ...settings, pass_through_ratio_threshold: Number(e.target.value) })}
                className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-neutral-900 dark:text-neutral-100 font-bold focus:outline-none focus:border-neutral-900"
              />
              <span className="text-[10px] text-neutral-500 block">e.g. 0.85 = 85% outbound pass-through ratio</span>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] uppercase tracking-wider font-bold text-neutral-700 dark:text-neutral-300">
                Pass-Through Window (Minutes)
              </label>
              <input
                type="number"
                min="5"
                max="1440"
                value={settings.pass_through_window_minutes}
                onChange={(e) => setSettings({ ...settings, pass_through_window_minutes: Number(e.target.value) })}
                className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-neutral-900 dark:text-neutral-100 font-bold focus:outline-none focus:border-neutral-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] uppercase tracking-wider font-bold text-neutral-700 dark:text-neutral-300">
                Velocity Burst Transfer Count
              </label>
              <input
                type="number"
                min="2"
                max="50"
                value={settings.velocity_burst_count}
                onChange={(e) => setSettings({ ...settings, velocity_burst_count: Number(e.target.value) })}
                className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-neutral-900 dark:text-neutral-100 font-bold focus:outline-none focus:border-neutral-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] uppercase tracking-wider font-bold text-neutral-700 dark:text-neutral-300">
                Velocity Burst Window (Minutes)
              </label>
              <input
                type="number"
                min="5"
                max="180"
                value={settings.velocity_burst_window_minutes}
                onChange={(e) => setSettings({ ...settings, velocity_burst_window_minutes: Number(e.target.value) })}
                className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-neutral-900 dark:text-neutral-100 font-bold focus:outline-none focus:border-neutral-900"
              />
            </div>
          </div>
        </div>

        {/* Traversal Budgets Configuration */}
        <div className="bg-white dark:bg-[#151619] border border-neutral-200 dark:border-neutral-800 p-6 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b-2 border-neutral-900 dark:border-neutral-100">
            <div className="flex items-center space-x-2">
              <span className="w-1.5 h-1.5 bg-swiss-red inline-block" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-900 dark:text-white">
                Lineage Traversal Budgets
              </h2>
            </div>
            <span className="text-[9px] text-neutral-400 uppercase">DFS / BFS BOUNDARIES</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div className="space-y-1.5">
              <label className="block text-[10px] uppercase tracking-wider font-bold text-neutral-700 dark:text-neutral-300">
                Backward Lookback Window (Hours)
              </label>
              <input
                type="number"
                min="1"
                max="720"
                value={settings.lookback_hours}
                onChange={(e) => setSettings({ ...settings, lookback_hours: Number(e.target.value) })}
                className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-neutral-900 dark:text-neutral-100 font-bold focus:outline-none focus:border-neutral-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] uppercase tracking-wider font-bold text-neutral-700 dark:text-neutral-300">
                Forward Lookahead Window (Hours)
              </label>
              <input
                type="number"
                min="1"
                max="720"
                value={settings.lookahead_hours}
                onChange={(e) => setSettings({ ...settings, lookahead_hours: Number(e.target.value) })}
                className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-neutral-900 dark:text-neutral-100 font-bold focus:outline-none focus:border-neutral-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] uppercase tracking-wider font-bold text-neutral-700 dark:text-neutral-300">
                Maximum Hop Depth Budget
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={settings.max_hops}
                onChange={(e) => setSettings({ ...settings, max_hops: Number(e.target.value) })}
                className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-neutral-900 dark:text-neutral-100 font-bold focus:outline-none focus:border-neutral-900"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] uppercase tracking-wider font-bold text-neutral-700 dark:text-neutral-300">
                Maximum Discovered Nodes Budget
              </label>
              <input
                type="number"
                min="10"
                max="500"
                value={settings.max_nodes}
                onChange={(e) => setSettings({ ...settings, max_nodes: Number(e.target.value) })}
                className="w-full bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-neutral-900 dark:text-neutral-100 font-bold focus:outline-none focus:border-neutral-900"
              />
            </div>
          </div>
        </div>

        {/* Save Changes Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-swiss-red hover:bg-swiss-redHover text-white font-mono font-bold px-6 py-3 text-xs uppercase tracking-wider flex items-center space-x-2 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'SAVING CONFIGURATION...' : 'SAVE CONFIGURATION AUDIT'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

