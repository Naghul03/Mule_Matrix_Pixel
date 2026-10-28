import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  RotateCcw,
  AlertCircle,
  FileText,
  Maximize2
} from 'lucide-react';
import cytoscape from 'cytoscape';
import { api } from '../lib/api';
import { InvestigationDetail, LineageNode, LineageEdge } from '../types/api';
import { useTheme } from '../context/ThemeContext';

interface InvestigationWorkspaceProps {
  initialContext?: { alert_id?: string; root_account_id?: string };
}

export const InvestigationWorkspace: React.FC<InvestigationWorkspaceProps> = ({ initialContext }) => {
  const { theme } = useTheme();
  const [investigation, setInvestigation] = useState<InvestigationDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'COMBINED' | 'BACKWARD' | 'FORWARD'>('COMBINED');
  
  const [selectedEntity, setSelectedEntity] = useState<LineageNode | LineageEdge | null>(null);
  const [activeTabPanel, setActiveTabPanel] = useState<'timeline' | 'hops' | 'paths'>('timeline');

  const graphContainerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const initWorkspace = async () => {
    setLoading(true);
    try {
      if (initialContext?.root_account_id) {
        const inv = await api.createInvestigation({
          root_account_id: initialContext.root_account_id,
          alert_id: initialContext.alert_id,
          lookback_hours: 72,
          lookahead_hours: 72
        });
        setInvestigation(inv);
      } else {
        const alerts = await api.getAlerts({ limit: 1 });
        if (alerts.length > 0) {
          const inv = await api.createInvestigation({
            root_account_id: alerts[0].account_id,
            alert_id: alerts[0].id,
            lookback_hours: 72,
            lookahead_hours: 72
          });
          setInvestigation(inv);
        } else {
          await api.runScenario('scenario_cross_bank_matrix', 101);
          const newAlerts = await api.getAlerts({ limit: 1 });
          if (newAlerts.length > 0) {
            const inv = await api.createInvestigation({
              root_account_id: newAlerts[0].account_id,
              alert_id: newAlerts[0].id,
              lookback_hours: 72,
              lookahead_hours: 72
            });
            setInvestigation(inv);
          }
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initWorkspace();
  }, [initialContext]);

  const handleRetrace = async () => {
    if (!investigation) return;
    setLoading(true);
    try {
      const updated = await api.retraceInvestigation(investigation.id, {
        lookback_hours: 72,
        lookahead_hours: 72,
        max_hops: 12
      });
      setInvestigation(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Cytoscape rendering
  useEffect(() => {
    if (!graphContainerRef.current || !investigation) return;

    let visibleNodes = investigation.nodes;
    let visibleEdges = investigation.edges;

    if (viewMode === 'BACKWARD') {
      visibleNodes = visibleNodes.filter(n => n.direction === 'ROOT' || n.direction === 'BACKWARD' || n.direction === 'BOTH');
      visibleEdges = visibleEdges.filter(e => e.direction === 'BACKWARD');
    } else if (viewMode === 'FORWARD') {
      visibleNodes = visibleNodes.filter(n => n.direction === 'ROOT' || n.direction === 'FORWARD' || n.direction === 'BOTH');
      visibleEdges = visibleEdges.filter(e => e.direction === 'FORWARD');
    }

    const isDark = theme === 'dark';
    const elements: cytoscape.ElementDefinition[] = [];

    visibleNodes.forEach(node => {
      let bgColor = isDark ? '#1e293b' : '#f8fafc';
      let borderColor = isDark ? '#475569' : '#cbd5e1';
      let size = 42;

      if (node.direction === 'ROOT') {
        bgColor = '#dc2626';
        borderColor = '#ef4444';
        size = 50;
      } else if (node.is_off_ramp) {
        bgColor = '#b91c1c';
        borderColor = '#f87171';
        size = 46;
      } else if (node.is_origin) {
        bgColor = '#16a34a';
        borderColor = '#4ade80';
        size = 44;
      } else if (node.direction === 'BACKWARD') {
        bgColor = '#0d9488';
        borderColor = '#2dd4bf';
      } else if (node.direction === 'FORWARD') {
        bgColor = '#2563eb';
        borderColor = '#60a5fa';
      }

      elements.push({
        group: 'nodes',
        data: {
          id: node.account_id,
          label: `${node.account_ref}\n${node.bank_code}`,
          raw: node,
          color: bgColor,
          borderColor,
          size
        }
      });
    });

    visibleEdges.forEach(edge => {
      elements.push({
        group: 'edges',
        data: {
          id: edge.id,
          source: edge.source_account_id,
          target: edge.destination_account_id,
          amount_formatted: `₹${(edge.amount_minor / 100).toLocaleString()}`,
          raw: edge
        }
      });
    });

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const cy = cytoscape({
      container: graphContainerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            'border-width': 2,
            'border-color': 'data(borderColor)',
            'label': 'data(label)',
            'color': '#ffffff',
            'font-size': '10px',
            'font-family': 'Inter, sans-serif',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'width': 'data(size)',
            'height': 'data(size)'
          } as any
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#f59e0b',
            'width': 54,
            'height': 54
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': isDark ? '#475569' : '#cbd5e1',
            'target-arrow-color': isDark ? '#475569' : '#cbd5e1',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(amount_formatted)',
            'font-size': '9px',
            'font-family': 'Inter, sans-serif',
            'color': isDark ? '#cbd5e1' : '#334155',
            'font-weight': '600',
            'text-background-opacity': 0.9,
            'text-background-color': isDark ? '#0f172a' : '#ffffff',
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle'
          }
        },
        {
          selector: 'edge:selected',
          style: {
            'line-color': '#f59e0b',
            'target-arrow-color': '#f59e0b',
            'width': 3
          }
        }
      ],
      layout: {
        name: 'breadthfirst',
        directed: true,
        roots: [investigation.root_account_id],
        padding: 40,
        spacingFactor: 1.25
      }
    });

    cy.on('tap', 'node', (evt) => {
      setSelectedEntity(evt.target.data('raw'));
    });
    cy.on('tap', 'edge', (evt) => {
      setSelectedEntity(evt.target.data('raw'));
    });

    cyRef.current = cy;
  }, [investigation, viewMode, theme]);

  const handleExport = (format: 'html' | 'json') => {
    if (!investigation) return;
    window.open(api.getExportUrl(investigation.id, format), '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header Case Dossier */}
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-apple space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-900">
                CASE #{investigation?.id.slice(0, 8) || 'ACTIVE'}
              </span>
              <span className="text-xs text-slate-500">Target Account:</span>
              <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                {investigation?.root_account_ref} ({investigation?.root_bank_code})
              </span>
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white mt-1">
              Lineage Reconstruction Workspace
            </h2>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleExport('html')}
              className="flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs transition-colors shadow-subtle"
            >
              <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Export HTML</span>
            </button>
            <button
              onClick={() => handleExport('json')}
              className="flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs transition-colors shadow-subtle"
            >
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>Export JSON</span>
            </button>
            <button
              onClick={handleRetrace}
              disabled={loading}
              className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium px-3.5 py-1.5 rounded-md text-xs shadow-sm transition-colors disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Re-run Trace</span>
            </button>
          </div>
        </div>

        {/* Metric Cards Row */}
        {investigation?.summary_metrics_json && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
            <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase font-medium">Nodes Discovered</span>
              <span className="font-mono text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
                {investigation.summary_metrics_json.accounts_discovered}
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase font-medium">Banks Crossed</span>
              <span className="font-mono text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
                {investigation.summary_metrics_json.banks_crossed}
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase font-medium">Traversed Movements</span>
              <span className="font-mono text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
                {investigation.summary_metrics_json.transactions_traversed}
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase font-medium">Max Depth</span>
              <span className="font-mono text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
                {investigation.summary_metrics_json.max_hop_depth} hops
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase font-medium">Off-Ramps Found</span>
              <span className="font-mono text-lg font-semibold text-red-600 dark:text-red-400 tabular-nums">
                {investigation.summary_metrics_json.off_ramps_found}
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase font-medium">Avg Confidence</span>
              <span className="font-mono text-lg font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {Math.round(investigation.summary_metrics_json.avg_confidence * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Machine-Readable Stop Reason Strip */}
        {investigation?.stop_reason && (
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <span>
                <strong>Traversal Stop Reason:</strong> <code className="font-mono text-amber-700 dark:text-amber-300">{investigation.stop_reason}</code>
                {investigation.stop_reason === 'OFF_RAMP_REACHED' && ' — Reached terminal cash/ATM off-ramp.'}
                {investigation.stop_reason === 'NO_ELIGIBLE_INCOMING_OR_OUTGOING_TRANSACTIONS' && ' — Halted cleanly at boundary; no further eligible settled movements observed.'}
              </span>
            </div>
            <span className="text-[10px] uppercase font-medium text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60">
              Audit Complete
            </span>
          </div>
        )}
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Graph Canvas (3 Cols) */}
        <div className="lg:col-span-3 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col h-[520px] relative shadow-apple">
          {/* Segmented Filter Control */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 z-10">
            <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-md">
              <button
                onClick={() => setViewMode('COMBINED')}
                className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                  viewMode === 'COMBINED' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Combined Lineage
              </button>
              <button
                onClick={() => setViewMode('BACKWARD')}
                className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                  viewMode === 'BACKWARD' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Backward (Origins)
              </button>
              <button
                onClick={() => setViewMode('FORWARD')}
                className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                  viewMode === 'FORWARD' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Forward (Off-Ramps)
              </button>
            </div>

            <button
              onClick={() => cyRef.current?.fit()}
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs flex items-center space-x-1"
              title="Fit to Canvas"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Fit</span>
            </button>
          </div>

          {/* Graph DOM */}
          <div ref={graphContainerRef} className="w-full flex-1 rounded-lg bg-slate-50 dark:bg-[#090d16] mt-3" />

          {/* Node Legend */}
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center space-x-4">
              <span className="flex items-center space-x-1 text-red-600 dark:text-red-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-red-600 inline-block"></span>
                <span>Root Trigger</span>
              </span>
              <span className="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
                <span>Origin Candidate</span>
              </span>
              <span className="flex items-center space-x-1 text-teal-600 dark:text-teal-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-teal-600 inline-block"></span>
                <span>Upstream Transit</span>
              </span>
              <span className="flex items-center space-x-1 text-blue-600 dark:text-blue-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-blue-600 inline-block"></span>
                <span>Downstream Split</span>
              </span>
              <span className="flex items-center space-x-1 text-red-700 dark:text-red-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-red-700 inline-block"></span>
                <span>Terminal Off-Ramp</span>
              </span>
            </div>
            <span>Breadth-First Traversal</span>
          </div>
        </div>

        {/* Selected Entity Inspector (1 Col) */}
        <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-4 h-[520px] overflow-y-auto shadow-apple text-xs space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white pb-2.5 border-b border-slate-200 dark:border-slate-800">
            Node / Movement Inspector
          </h3>

          {selectedEntity ? (
            'account_ref' in selectedEntity ? (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-medium">Account Reference</span>
                  <div className="font-mono text-sm font-semibold text-slate-900 dark:text-white mt-0.5">{selectedEntity.account_ref}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {selectedEntity.bank_name} ({selectedEntity.bank_code})
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 font-medium">Lineage Role</span>
                  <div className="mt-1">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                      selectedEntity.is_off_ramp ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400' :
                      selectedEntity.is_origin ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' :
                      selectedEntity.direction === 'ROOT' ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400' :
                      'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}>
                      {selectedEntity.direction} {selectedEntity.is_off_ramp ? '• OFF-RAMP' : ''} {selectedEntity.is_origin ? '• ORIGIN' : ''}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 font-medium">Hop Depth</span>
                  <div className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                    {selectedEntity.hop_depth} hops from trigger
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 font-medium">Attributed Value</span>
                  <div className="font-mono text-base font-semibold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                    ₹{(selectedEntity.amount_attributed_minor / 100).toLocaleString()}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 font-medium">Evidence & Uncertainty</span>
                  <div className="mt-0.5 text-slate-800 dark:text-slate-200">{selectedEntity.evidence_type}</div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Uncertainty: <span className="font-mono text-slate-800 dark:text-slate-200">{(selectedEntity.uncertainty * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-medium">Movement Amount</span>
                  <div className="font-mono text-base font-semibold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                    ₹{(selectedEntity.amount_minor / 100).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Via {selectedEntity.rail} • Hop #{selectedEntity.hop_depth}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 font-medium">Endpoints</span>
                  <div className="font-mono text-slate-700 dark:text-slate-300 mt-1 space-y-1">
                    <div>From: {selectedEntity.source_account_ref} ({selectedEntity.source_bank_code})</div>
                    <div>To: {selectedEntity.destination_account_ref} ({selectedEntity.destination_bank_code})</div>
                  </div>
                  {selectedEntity.is_cross_bank && (
                    <span className="mt-1.5 inline-block text-[10px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded">
                      Inter-Bank Transfer
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-slate-500 font-medium">Allocation & Confidence</span>
                  <div className="mt-0.5 text-slate-800 dark:text-slate-200 font-medium">{selectedEntity.allocation_method}</div>
                  <div className="mt-1 font-mono text-emerald-600 dark:text-emerald-400">
                    Confidence: {(selectedEntity.confidence * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="py-24 text-center text-slate-400 text-xs">
              Select any graph node or edge to inspect attribution, institutions, and uncertainty.
            </div>
          )}
        </div>
      </div>

      {/* Timeline & Hop Evidence Bottom Table */}
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-apple">
        <div className="flex items-center space-x-4 border-b border-slate-200 dark:border-slate-800 pb-3">
          <button
            onClick={() => setActiveTabPanel('timeline')}
            className={`text-xs font-semibold transition-all ${
              activeTabPanel === 'timeline' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 pb-2' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Chronological Timeline ({investigation?.timeline.length || 0})
          </button>
          <button
            onClick={() => setActiveTabPanel('hops')}
            className={`text-xs font-semibold transition-all ${
              activeTabPanel === 'hops' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 pb-2' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Hop Evidence Rows ({investigation?.edges.length || 0})
          </button>
          <button
            onClick={() => setActiveTabPanel('paths')}
            className={`text-xs font-semibold transition-all ${
              activeTabPanel === 'paths' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 pb-2' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Candidate Paths ({investigation?.candidate_paths.length || 0})
          </button>
        </div>

        {activeTabPanel === 'timeline' && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="pb-2 font-medium">Timestamp (UTC)</th>
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 font-medium">Destination</th>
                  <th className="pb-2 font-medium">Rail</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Allocation Method</th>
                  <th className="pb-2 font-medium">Confidence</th>
                  <th className="pb-2 font-medium">Memo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {investigation?.timeline.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20">
                    <td className="py-2.5 text-slate-500">{item.timestamp}</td>
                    <td className="py-2.5 text-slate-800 dark:text-slate-200">{item.source_account_ref} ({item.source_bank_code})</td>
                    <td className="py-2.5 text-slate-800 dark:text-slate-200">{item.destination_account_ref} ({item.destination_bank_code})</td>
                    <td className="py-2.5 text-slate-500 font-sans">{item.rail}</td>
                    <td className="py-2.5 font-semibold text-slate-900 dark:text-white tabular-nums">₹{(item.amount_minor / 100).toLocaleString()}</td>
                    <td className="py-2.5 text-slate-500 font-sans">{item.allocation_method}</td>
                    <td className="py-2.5 text-emerald-600 dark:text-emerald-400 font-semibold">{Math.round(item.confidence * 100)}%</td>
                    <td className="py-2.5 text-slate-500 font-sans italic">{item.memo || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTabPanel === 'hops' && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="pb-2 font-medium">Hop</th>
                  <th className="pb-2 font-medium">Direction</th>
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 font-medium">Destination</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Cross-Bank</th>
                  <th className="pb-2 font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {investigation?.edges.map((e, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20">
                    <td className="py-2.5 text-slate-500">Hop {e.hop_depth}</td>
                    <td className="py-2.5 font-sans">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                        {e.direction}
                      </span>
                    </td>
                    <td className="py-2.5">{e.source_account_ref} ({e.source_bank_code})</td>
                    <td className="py-2.5">{e.destination_account_ref} ({e.destination_bank_code})</td>
                    <td className="py-2.5 font-semibold text-slate-900 dark:text-white tabular-nums">₹{(e.amount_minor / 100).toLocaleString()}</td>
                    <td className="py-2.5 font-sans">
                      {e.is_cross_bank ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium">YES</span>
                      ) : (
                        <span className="text-slate-400">NO</span>
                      )}
                    </td>
                    <td className="py-2.5 text-emerald-600 dark:text-emerald-400 font-semibold">{Math.round(e.confidence * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTabPanel === 'paths' && (
          <div className="mt-4 space-y-2 font-mono text-xs">
            {investigation?.candidate_paths.map((p, idx) => (
              <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center space-x-2">
                <span className="text-slate-400 font-sans text-[11px] font-medium">Path #{idx + 1}:</span>
                <span className="text-slate-800 dark:text-slate-200 font-semibold">{p.join('  ⟶  ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
