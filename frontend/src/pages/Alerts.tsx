import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle,
  XCircle,
  GitFork,
  Eye,
  Filter,
  ArrowRight,
  AlertTriangle
} from 'lucide-react';
import { api } from '../lib/api';
import { DetectionAlert, DetectionAlertDetail } from '../types/api';

interface AlertsProps {
  onNavigateTab: (tab: string, context?: any) => void;
}

export const Alerts: React.FC<AlertsProps> = ({ onNavigateTab }) => {
  const [alerts, setAlerts] = useState<DetectionAlert[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [selectedAlert, setSelectedAlert] = useState<DetectionAlertDetail | null>(null);
  const [dismissReason, setDismissReason] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const fetchAlerts = async () => {
    try {
      const data = await api.getAlerts({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        severity: severityFilter === 'ALL' ? undefined : severityFilter,
        limit: 100
      });
      setAlerts(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [statusFilter, severityFilter]);

  const handleSelectAlert = async (id: string) => {
    try {
      const detail = await api.getAlertDetail(id);
      setSelectedAlert(detail);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateStatus = async (status: string) => {
    if (!selectedAlert) return;
    setActionLoading(true);
    try {
      await api.updateAlertStatus(selectedAlert.id, status, dismissReason);
      await fetchAlerts();
      const updated = await api.getAlertDetail(selectedAlert.id);
      setSelectedAlert(updated);
      setDismissReason('');
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEscalateInvestigation = () => {
    if (!selectedAlert) return;
    onNavigateTab('investigation', {
      alert_id: selectedAlert.id,
      root_account_id: selectedAlert.account_id
    });
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Swiss Section Header */}
      <div className="border-b-2 border-neutral-900 dark:border-neutral-100 pb-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-[11px] font-mono uppercase tracking-widest text-swiss-red font-bold">
              <span>03 // DETECTIONS & RISK</span>
              <span className="text-neutral-400">—</span>
              <span className="text-neutral-500">AUDIT DOSSIER</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-neutral-900 dark:text-neutral-100 mt-1">
              Suspected Mule Detections.
            </h1>
            <p className="text-xs font-mono text-neutral-500 dark:text-neutral-400 mt-1 max-w-2xl">
              Deterministic threshold breaches, rapid velocity spikes, and network centrality deviations audited against synthetic ground truth.
            </p>
          </div>

          {/* Swiss Filter Grid */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs font-mono">
              <span className="text-neutral-500 text-[10px] tracking-wider uppercase mr-2 font-bold">STATUS:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent text-neutral-900 dark:text-neutral-100 font-bold focus:outline-none cursor-pointer uppercase text-xs"
              >
                <option value="ALL">ALL STATUSES</option>
                <option value="OPEN">OPEN</option>
                <option value="REVIEWED">REVIEWED</option>
                <option value="DISMISSED">DISMISSED</option>
                <option value="ESCALATED">ESCALATED</option>
              </select>
            </div>

            <div className="flex items-center border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs font-mono">
              <span className="text-neutral-500 text-[10px] tracking-wider uppercase mr-2 font-bold">SEVERITY:</span>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="bg-transparent text-neutral-900 dark:text-neutral-100 font-bold focus:outline-none cursor-pointer uppercase text-xs"
              >
                <option value="ALL">ALL SEVERITIES</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Flagged Accounts Table (7 Cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-[#151619] border border-neutral-200 dark:border-neutral-800 p-6">
          <div className="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800 mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-2.5 h-2.5 bg-swiss-red"></div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-900 dark:text-white font-mono">
                Flagged Accounts ({alerts.length})
              </h2>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
              CLICK ROW TO INSPECT DOSSIER
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b-2 border-neutral-900 dark:border-neutral-100 text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  <th className="pb-2.5 font-bold">ACCOUNT</th>
                  <th className="pb-2.5 font-bold">INSTITUTION</th>
                  <th className="pb-2.5 font-bold">SCORE</th>
                  <th className="pb-2.5 font-bold">SEVERITY</th>
                  <th className="pb-2.5 font-bold">SIGNALS</th>
                  <th className="pb-2.5 font-bold">STATUS</th>
                  <th className="pb-2.5 font-bold text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {alerts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-neutral-400 font-mono text-xs">
                      NO ACTIVE ALERTS MATCH SPECIFIED FILTER PARAMETERS.
                    </td>
                  </tr>
                ) : (
                  alerts.map((alert) => {
                    const isSelected = selectedAlert?.id === alert.id;
                    return (
                      <tr
                        key={alert.id}
                        onClick={() => handleSelectAlert(alert.id)}
                        className={`cursor-pointer transition-colors group ${
                          isSelected
                            ? 'bg-neutral-100 dark:bg-neutral-800/80 border-l-4 border-swiss-red'
                            : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/30'
                        }`}
                      >
                        <td className="py-3 px-2 font-bold text-neutral-900 dark:text-neutral-100">
                          {alert.account_ref}
                        </td>
                        <td className="py-3 px-2">
                          <span className="border border-neutral-300 dark:border-neutral-700 px-1.5 py-0.5 text-[10px] font-bold bg-neutral-50 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300">
                            {alert.bank_code}
                          </span>
                        </td>
                        <td className="py-3 px-2 font-black tabular-nums text-neutral-900 dark:text-white">
                          {alert.risk_score.toFixed(1)}
                        </td>
                        <td className="py-3 px-2">
                          {alert.severity === 'CRITICAL' ? (
                            <span className="bg-swiss-red text-white text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wider">
                              CRITICAL
                            </span>
                          ) : alert.severity === 'HIGH' ? (
                            <span className="border border-amber-600 text-amber-700 dark:text-amber-400 text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wider">
                              HIGH
                            </span>
                          ) : (
                            <span className="border border-neutral-400 text-neutral-600 dark:text-neutral-400 text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wider">
                              {alert.severity}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex gap-1 flex-wrap">
                            {alert.rules_triggered.slice(0, 2).map((r) => (
                              <span
                                key={r}
                                className="text-[9px] border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1 py-0.5 text-neutral-600 dark:text-neutral-300"
                              >
                                {r}
                              </span>
                            ))}
                            {alert.rules_triggered.length > 2 && (
                              <span className="text-[9px] text-neutral-400 self-center">
                                +{alert.rules_triggered.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <span
                            className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 border ${
                              alert.status === 'OPEN'
                                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                                : alert.status === 'ESCALATED'
                                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 border-neutral-900'
                                : 'border-neutral-300 text-neutral-500'
                            }`}
                          >
                            {alert.status}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectAlert(alert.id);
                            }}
                            className="p-1 hover:text-swiss-red text-neutral-400 transition-colors"
                            title="Inspect Dossier"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Evidence & Review Actions Drawer (5 Cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-[#151619] border border-neutral-200 dark:border-neutral-800 p-6 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b-2 border-neutral-900 dark:border-neutral-100">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-swiss-red font-bold">03.1 //</span>
              <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-900 dark:text-white font-mono">
                Evidence Dossier
              </h2>
            </div>
            {selectedAlert && (
              <span className="text-[10px] font-mono text-neutral-400 uppercase">
                ALERT ID: {selectedAlert.id.slice(0, 8)}
              </span>
            )}
          </div>

          {selectedAlert ? (
            <div className="space-y-6 text-xs font-mono">
              {/* Account Key Card */}
              <div className="p-4 border-2 border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-900 flex items-start justify-between">
                <div>
                  <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">
                    TARGET ACCOUNT
                  </span>
                  <div className="text-lg font-black text-neutral-900 dark:text-white mt-1">
                    {selectedAlert.account_ref}
                  </div>
                  <div className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-1 flex items-center gap-2">
                    <span>INSTITUTION:</span>
                    <span className="font-bold text-neutral-900 dark:text-neutral-100 border border-neutral-300 dark:border-neutral-700 px-1 bg-white dark:bg-neutral-800">
                      {selectedAlert.bank_code}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-3xl font-black text-swiss-red tabular-nums">
                    {selectedAlert.risk_score.toFixed(1)}
                  </div>
                  <div className="text-[9px] uppercase tracking-widest font-bold text-neutral-500">
                    AGGREGATE RISK
                  </div>
                </div>
              </div>

              {/* Observable Rules Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                    AUDITED EVIDENCE ({selectedAlert.evidence.length})
                  </span>
                  <span className="text-[9px] text-neutral-400 uppercase">STRICT CRITERIA</span>
                </div>

                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {selectedAlert.evidence.map((ev, idx) => (
                    <div
                      key={ev.id || idx}
                      className="p-3 border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-swiss-red text-[10px] tracking-wide uppercase">
                          {ev.rule_code}
                        </span>
                        <span className="text-[9px] text-neutral-400 font-mono">RULE BREACH</span>
                      </div>
                      <p className="text-neutral-800 dark:text-neutral-200 text-xs font-sans leading-relaxed">
                        {ev.explanation}
                      </p>
                      <div className="flex items-center justify-between pt-1 border-t border-neutral-200 dark:border-neutral-800 text-[10px] text-neutral-500">
                        <span>OBSERVED: <strong className="text-neutral-900 dark:text-neutral-100">{ev.observed_value}</strong></span>
                        <span>THRESHOLD: <strong className="text-neutral-900 dark:text-neutral-100">{ev.threshold}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Review Actions Panel */}
              <div className="p-4 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/40 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                  INVESTIGATIVE DISPOSITION
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleUpdateStatus('REVIEWED')}
                    disabled={actionLoading}
                    className="border border-neutral-900 dark:border-neutral-100 hover:bg-neutral-900 hover:text-white dark:hover:bg-neutral-100 dark:hover:text-neutral-900 text-neutral-900 dark:text-neutral-100 font-bold py-2 text-[10px] uppercase tracking-wider transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50"
                  >
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>MARK REVIEWED</span>
                  </button>

                  <button
                    onClick={() => handleUpdateStatus('DISMISSED')}
                    disabled={actionLoading}
                    className="border border-neutral-300 dark:border-neutral-700 hover:border-neutral-900 hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-bold py-2 text-[10px] uppercase tracking-wider transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5 text-neutral-400" />
                    <span>DISMISS</span>
                  </button>
                </div>

                <button
                  onClick={handleEscalateInvestigation}
                  className="w-full bg-swiss-red hover:bg-swiss-redHover text-white font-bold py-3 text-xs uppercase tracking-wider transition-colors flex items-center justify-center space-x-2"
                >
                  <GitFork className="w-4 h-4" />
                  <span>ESCALATE TO LINEAGE INVESTIGATION</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="py-24 text-center text-neutral-400 font-mono text-xs">
              SELECT AN ALERT ENTRY FROM THE TABLE TO INSPECT AUDITABLE EVIDENCE.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

