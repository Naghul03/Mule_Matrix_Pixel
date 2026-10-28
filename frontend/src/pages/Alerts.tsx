import React, { useState, useEffect } from 'react';
import {
  BellRing,
  ShieldAlert,
  CheckCircle,
  XCircle,
  GitFork,
  Eye,
  Building
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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white flex items-center space-x-2">
            <span>Alerts & Account Risk</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit observable risk signals with threshold records and investigator review actions.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-3 text-xs">
          <div className="flex items-center space-x-1.5 text-slate-600 dark:text-slate-300">
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-slate-800 dark:text-slate-200 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">OPEN</option>
              <option value="REVIEWED">REVIEWED</option>
              <option value="DISMISSED">DISMISSED</option>
              <option value="ESCALATED">ESCALATED</option>
            </select>
          </div>

          <div className="flex items-center space-x-1.5 text-slate-600 dark:text-slate-300">
            <span>Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-slate-800 dark:text-slate-200 focus:outline-none"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Alerts Table (7 Cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-apple">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Flagged Accounts ({alerts.length})
            </h3>
            <span className="text-[11px] text-slate-400">Select row to inspect auditable evidence</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="pb-2.5 font-medium">Account</th>
                  <th className="pb-2.5 font-medium">Bank</th>
                  <th className="pb-2.5 font-medium">Risk Score</th>
                  <th className="pb-2.5 font-medium">Severity</th>
                  <th className="pb-2.5 font-medium">Signals</th>
                  <th className="pb-2.5 font-medium">Status</th>
                  <th className="pb-2.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {alerts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No alerts match the active filters.
                    </td>
                  </tr>
                ) : (
                  alerts.map((alert) => (
                    <tr
                      key={alert.id}
                      onClick={() => handleSelectAlert(alert.id)}
                      className={`cursor-pointer transition-colors ${
                        selectedAlert?.id === alert.id ? 'bg-blue-50/70 dark:bg-blue-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                      }`}
                    >
                      <td className="py-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                        {alert.account_ref}
                      </td>
                      <td className="py-3">
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                          {alert.bank_code}
                        </span>
                      </td>
                      <td className="py-3 font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                        {alert.risk_score}
                      </td>
                      <td className="py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          alert.severity === 'CRITICAL' ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900/60' :
                          alert.severity === 'HIGH' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60' :
                          'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60'
                        }`}>
                          {alert.severity}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-1 flex-wrap">
                          {alert.rules_triggered.slice(0, 2).map((r) => (
                            <span key={r} className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1 py-0.5 rounded">
                              {r}
                            </span>
                          ))}
                          {alert.rules_triggered.length > 2 && (
                            <span className="text-[10px] text-slate-400">+{alert.rules_triggered.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                          alert.status === 'OPEN' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' :
                          alert.status === 'ESCALATED' ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300' :
                          'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {alert.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectAlert(alert.id);
                          }}
                          className="text-slate-400 hover:text-blue-600 p-1"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Evidence & Review Actions Drawer (5 Cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-apple space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white pb-3 border-b border-slate-200 dark:border-slate-800">
            Evidence Dossier
          </h3>

          {selectedAlert ? (
            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-medium">Account Reference</span>
                  <div className="font-mono text-sm font-semibold text-slate-900 dark:text-white mt-0.5">{selectedAlert.account_ref}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Institution: <span className="font-medium text-slate-700 dark:text-slate-300">{selectedAlert.bank_code}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">{selectedAlert.risk_score}</div>
                  <div className="text-[10px] uppercase font-medium text-slate-500">Risk Score</div>
                </div>
              </div>

              {/* Observable Rules */}
              <div>
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Observable Signals ({selectedAlert.evidence.length})
                </h4>
                <div className="space-y-2">
                  {selectedAlert.evidence.map((ev) => (
                    <div key={ev.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-medium text-blue-600 dark:text-blue-400 text-[11px]">{ev.rule_code}</span>
                        <span className="text-[10px] text-slate-400">Signal Evidence</span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 text-xs leading-relaxed">{ev.explanation}</p>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-500">
                        <span>Observed: {ev.observed_value}</span>
                        <span>Threshold: {ev.threshold}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Review Actions */}
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Review Status
                </h4>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleUpdateStatus('REVIEWED')}
                    disabled={actionLoading}
                    className="flex-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium py-1.5 rounded-md text-xs border border-slate-200 dark:border-slate-700 transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50"
                  >
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Mark Reviewed</span>
                  </button>

                  <button
                    onClick={() => handleUpdateStatus('DISMISSED')}
                    disabled={actionLoading}
                    className="flex-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium py-1.5 rounded-md text-xs border border-slate-200 dark:border-slate-700 transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5 text-slate-400" />
                    <span>Dismiss</span>
                  </button>
                </div>

                <button
                  onClick={handleEscalateInvestigation}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-md text-xs shadow-sm transition-colors flex items-center justify-center space-x-1.5"
                >
                  <GitFork className="w-3.5 h-3.5" />
                  <span>Escalate to Lineage Investigation</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="py-24 text-center text-slate-400 text-xs">
              Select an alert from the table to inspect auditable evidence.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
