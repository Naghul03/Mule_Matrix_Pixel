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

  if (!settings) return <div className="text-slate-400 text-xs py-8">Loading configuration settings...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 flex items-center justify-center text-[#1a73e8]">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
              Detection & Traversal Settings
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configure explainable detector thresholds, time windows, and bounded traversal budgets
            </p>
          </div>
        </div>

        <button
          onClick={handleResetDefaults}
          className="inline-flex items-center space-x-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 transition-colors shadow-sm"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
          <span>Reset Defaults</span>
        </button>
      </div>

      {saveSuccess && (
        <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Engine configuration successfully saved and applied to runtime detection.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Detection Engine Configuration */}
        <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-apple space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <ShieldCheck className="w-4 h-4 text-[#1a73e8]" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Detection Algorithm Parameters</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Active Detector Version</label>
              <select
                value={settings.detector_version}
                onChange={(e) => setSettings({ ...settings, detector_version: e.target.value })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              >
                <option value="v2_candidate_matrix">v2_candidate_matrix (Explainable Multi-Signal Engine)</option>
                <option value="v1_baseline">v1_baseline (Traditional Velocity Baseline)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Composite Risk Alert Threshold</label>
              <input
                type="number"
                step="1"
                min="10"
                max="100"
                value={settings.risk_alert_threshold}
                onChange={(e) => setSettings({ ...settings, risk_alert_threshold: Number(e.target.value) })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              />
              <span className="text-[11px] text-slate-500">Alert raised if composite score exceeds this threshold (0-100)</span>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Pass-Through Forwarding Ratio</label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="1.0"
                value={settings.pass_through_ratio_threshold}
                onChange={(e) => setSettings({ ...settings, pass_through_ratio_threshold: Number(e.target.value) })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              />
              <span className="text-[11px] text-slate-500">e.g. 0.85 = 85% outbound pass-through ratio</span>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Pass-Through Window (Minutes)</label>
              <input
                type="number"
                min="5"
                max="1440"
                value={settings.pass_through_window_minutes}
                onChange={(e) => setSettings({ ...settings, pass_through_window_minutes: Number(e.target.value) })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Velocity Burst Transfer Count</label>
              <input
                type="number"
                min="2"
                max="50"
                value={settings.velocity_burst_count}
                onChange={(e) => setSettings({ ...settings, velocity_burst_count: Number(e.target.value) })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Velocity Burst Window (Minutes)</label>
              <input
                type="number"
                min="5"
                max="180"
                value={settings.velocity_burst_window_minutes}
                onChange={(e) => setSettings({ ...settings, velocity_burst_window_minutes: Number(e.target.value) })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              />
            </div>
          </div>
        </div>

        {/* Traversal Budgets Configuration */}
        <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-apple space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <Cpu className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Lineage Traversal Budgets</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Backward Lookback Window (Hours)</label>
              <input
                type="number"
                min="1"
                max="720"
                value={settings.lookback_hours}
                onChange={(e) => setSettings({ ...settings, lookback_hours: Number(e.target.value) })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Forward Lookahead Window (Hours)</label>
              <input
                type="number"
                min="1"
                max="720"
                value={settings.lookahead_hours}
                onChange={(e) => setSettings({ ...settings, lookahead_hours: Number(e.target.value) })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Maximum Hop Depth Budget</label>
              <input
                type="number"
                min="1"
                max="50"
                value={settings.max_hops}
                onChange={(e) => setSettings({ ...settings, max_hops: Number(e.target.value) })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Maximum Discovered Nodes Budget</label>
              <input
                type="number"
                min="10"
                max="500"
                value={settings.max_nodes}
                onChange={(e) => setSettings({ ...settings, max_nodes: Number(e.target.value) })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
              />
            </div>
          </div>
        </div>

        {/* Save Changes Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center space-x-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white font-medium px-6 py-2.5 rounded-lg text-xs shadow-sm transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Configuration Changes'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
