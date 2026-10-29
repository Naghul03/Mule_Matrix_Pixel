import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Download,
  RotateCcw,
  FileText,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  SkipBack,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Info,
  HelpCircle
} from 'lucide-react';
import cytoscape from 'cytoscape';
import { api } from '../lib/api';
import { InvestigationDetail, LineageNode, LineageEdge, LineagePath } from '../types/api';
import { useTheme } from '../context/ThemeContext';

interface InvestigationWorkspaceProps {
  initialContext?: { alert_id?: string; root_account_id?: string };
}

const STOP_REASON_MAP: Record<string, string> = {
  OFF_RAMP_REACHED: "Traversal terminated at a recognized terminal exit (ATM cash withdrawal or external off-ramp rail).",
  NO_ELIGIBLE_INCOMING_OR_OUTGOING_TRANSACTIONS: "Trace concluded; no further settled inter-bank transfers observed within the boundary.",
  LOOKBACK_OR_LOOKAHEAD_WINDOW_EXCEEDED: "Traversal halted at the temporal horizon (configured lookback/lookahead boundary).",
  MAX_HOPS_REACHED: "Traversal reached the maximum hop depth limit.",
  MAX_NODES_OR_EDGES_REACHED: "Traversal node/edge budget exhausted to protect against high-degree graph explosion.",
  MISSING_OR_CONFLICTING_DATA: "Trace halted due to unresolved synthetic entity or missing ledger records.",
  AMBIGUOUS_AMOUNT_ATTRIBUTION: "Attribution confidence fell below threshold due to extensive co-mingled flows."
};

export const InvestigationWorkspace: React.FC<InvestigationWorkspaceProps> = ({ initialContext }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [investigation, setInvestigation] = useState<InvestigationDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Interactive Filters
  const [viewMode, setViewMode] = useState<'COMBINED' | 'BACKWARD' | 'FORWARD'>('COMBINED');
  const [attributionFilter, setAttributionFilter] = useState<'ALL' | 'ATTRIBUTED_ONLY' | 'CANDIDATE_ONLY' | 'INCLUDE_EXCLUDED'>('ALL');
  const [maxHopFilter, setMaxHopFilter] = useState<number>(12);
  const [minAmountFilter, setMinAmountFilter] = useState<number>(0);
  
  const [selectedEntity, setSelectedEntity] = useState<LineageNode | LineageEdge | null>(null);
  const [activeTabPanel, setActiveTabPanel] = useState<'timeline' | 'hops' | 'paths'>('paths');
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  const graphContainerRef = useRef<HTMLDivElement>(null);
  const graphCardRef = useRef<HTMLDivElement>(null);
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
          setInvestigation(null);
        }
      }
    } catch (e) {
      console.error(e);
      setInvestigation(null);
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
        max_hops: maxHopFilter
      });
      setInvestigation(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Sort edges chronologically
  const sortedEdges = useMemo(() => {
    if (!investigation?.edges) return [];
    return [...investigation.edges].sort((a, b) => {
      const tA = a.posted_at ? new Date(a.posted_at).getTime() : 0;
      const tB = b.posted_at ? new Date(b.posted_at).getTime() : 0;
      if (tA !== tB) return tA - tB;
      return a.hop_depth - b.hop_depth;
    });
  }, [investigation]);

  const totalHops = Math.max(1, sortedEdges.length);
  const [currentHop, setCurrentHop] = useState<number>(totalHops);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  useEffect(() => {
    setCurrentHop(totalHops);
  }, [totalHops]);

  // Sequential Playback Timer
  useEffect(() => {
    if (!isPlaying) return;
    if (currentHop >= totalHops) {
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      setCurrentHop(prev => Math.min(totalHops, prev + 1));
    }, 1400);
    return () => clearTimeout(timer);
  }, [isPlaying, currentHop, totalHops]);

  // Cytoscape rendering with distinct styling for Attributed vs Candidate edges
  useEffect(() => {
    if (!graphContainerRef.current) return;
    if (!investigation) {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
      return;
    }

    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    // Filter edges by current hop, viewMode, attributionFilter, maxHopFilter, and minAmountFilter
    let activeEdges = sortedEdges.slice(0, currentHop);

    if (viewMode === 'BACKWARD') {
      activeEdges = activeEdges.filter(e => e.direction === 'BACKWARD');
    } else if (viewMode === 'FORWARD') {
      activeEdges = activeEdges.filter(e => e.direction === 'FORWARD');
    }

    if (attributionFilter === 'ATTRIBUTED_ONLY') {
      activeEdges = activeEdges.filter(e => e.edge_type === 'ATTRIBUTED');
    } else if (attributionFilter === 'CANDIDATE_ONLY') {
      activeEdges = activeEdges.filter(e => e.edge_type === 'CANDIDATE');
    } else if (attributionFilter !== 'INCLUDE_EXCLUDED') {
      activeEdges = activeEdges.filter(e => e.edge_type !== 'EXCLUDED');
    }

    if (maxHopFilter > 0) {
      activeEdges = activeEdges.filter(e => e.hop_depth <= maxHopFilter);
    }
    if (minAmountFilter > 0) {
      activeEdges = activeEdges.filter(e => e.amount_minor >= minAmountFilter * 100);
    }

    const activeAccountIds = new Set<string>([investigation.root_account_id]);
    activeEdges.forEach(e => {
      activeAccountIds.add(e.source_account_id);
      activeAccountIds.add(e.destination_account_id);
    });

    const visibleNodes = investigation.nodes.filter(n => activeAccountIds.has(n.account_id));

    const elements: cytoscape.ElementDefinition[] = [];

    // Nodes
    visibleNodes.forEach(node => {
      let bgColor = isDark ? '#1C1D21' : '#FFFFFF';
      let borderColor = isDark ? '#4A4D57' : '#111111';
      let textColor = isDark ? '#FFFFFF' : '#111111';
      let size = 46;

      if (node.direction === 'ROOT') {
        bgColor = '#E30613'; // Crimson
        borderColor = '#FFFFFF';
        textColor = '#FFFFFF';
        size = 54;
      } else if (node.is_off_ramp) {
        bgColor = '#8B0000';
        borderColor = '#E30613';
        textColor = '#FFFFFF';
        size = 50;
      } else if (node.is_origin) {
        bgColor = '#0F766E';
        borderColor = '#14B8A6';
        textColor = '#FFFFFF';
        size = 50;
      } else if (node.direction === 'BACKWARD') {
        bgColor = isDark ? '#1E293B' : '#F1F5F9';
        borderColor = '#0284C7';
        textColor = isDark ? '#FFFFFF' : '#0F172A';
      } else if (node.direction === 'FORWARD') {
        bgColor = isDark ? '#1E293B' : '#F1F5F9';
        borderColor = '#475569';
        textColor = isDark ? '#FFFFFF' : '#0F172A';
      }

      elements.push({
        group: 'nodes',
        data: {
          id: node.account_id,
          label: `${node.account_ref}\n${node.bank_code}`,
          raw: node,
          color: bgColor,
          borderColor,
          textColor,
          size
        }
      });
    });

    // Edges (Attributed vs Candidate styling)
    activeEdges.forEach((edge, idx) => {
      const isLatest = idx === activeEdges.length - 1;
      const isAttributed = edge.edge_type === 'ATTRIBUTED' || (!edge.edge_type && edge.confidence > 0.5);
      const isCandidate = edge.edge_type === 'CANDIDATE';
      const isExcluded = edge.edge_type === 'EXCLUDED';

      let lineColor = isDark ? '#475569' : '#94A3B8';
      let lineStyle: 'solid' | 'dashed' | 'dotted' = 'solid';
      let width = 2.0;
      let label = `₹${(edge.amount_minor / 100).toLocaleString()}`;

      if (isAttributed) {
        lineColor = isDark ? '#EF4444' : '#DC2626'; // Vivid crimson solid
        lineStyle = 'solid';
        width = 3.5;
        if (edge.attributed_amount_minor && edge.attributed_amount_minor !== edge.amount_minor) {
          label = `₹${(edge.amount_minor / 100).toLocaleString()} (Attr: ₹${(edge.attributed_amount_minor / 100).toLocaleString()})`;
        } else {
          label = `₹${(edge.amount_minor / 100).toLocaleString()} [Attr]`;
        }
      } else if (isCandidate) {
        lineColor = isDark ? '#64748B' : '#94A3B8'; // Muted slate dashed
        lineStyle = 'dashed';
        width = 2.0;
        label = `₹${(edge.amount_minor / 100).toLocaleString()} [Candidate]`;
      } else if (isExcluded) {
        lineColor = '#9CA3AF';
        lineStyle = 'dotted';
        width = 1.5;
        label = `Excluded`;
      }

      elements.push({
        group: 'edges',
        data: {
          id: edge.id,
          source: edge.source_account_id,
          target: edge.destination_account_id,
          amount_formatted: label,
          lineColor,
          lineStyle,
          width,
          raw: edge,
          isLatest
        }
      });
    });

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
            'color': 'data(textColor)',
            'font-size': '10px',
            'font-family': 'Inter, sans-serif',
            'font-weight': 'bold',
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
            'border-width': 4,
            'border-color': '#E30613',
            'width': 58,
            'height': 58
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 'data(width)',
            'line-color': 'data(lineColor)',
            'line-style': 'data(lineStyle)' as any,
            'target-arrow-color': 'data(lineColor)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(amount_formatted)',
            'font-size': '9px',
            'font-family': 'JetBrains Mono, monospace',
            'color': isDark ? '#FFFFFF' : '#111111',
            'font-weight': '700',
            'text-background-opacity': 0.9,
            'text-background-color': isDark ? '#151619' : '#FFFFFF',
            'text-background-padding': '2px',
            'text-border-color': 'data(lineColor)',
            'text-border-width': 1,
            'text-border-opacity': 0.8
          } as any
        },
        {
          selector: 'edge[?isLatest]',
          style: {
            'width': 4.0
          } as any
        },
        {
          selector: 'edge:selected',
          style: {
            'line-color': '#E30613',
            'target-arrow-color': '#E30613',
            'width': 4.0
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

    cy.on('tap', 'node', evt => {
      setSelectedEntity(evt.target.data('raw'));
    });
    cy.on('tap', 'edge', evt => {
      setSelectedEntity(evt.target.data('raw'));
    });

    cyRef.current = cy;
    setTimeout(() => {
      cy.fit(undefined, 30);
    }, 100);

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [investigation, viewMode, attributionFilter, maxHopFilter, minAmountFilter, theme, currentHop, sortedEdges, isDark]);

  const handleExport = (format: 'html' | 'json') => {
    if (!investigation) return;
    window.open(api.getExportUrl(investigation.id, format), '_blank');
  };

  const activeMovement = sortedEdges[currentHop - 1];

  // Distinguish attributed paths vs candidate paths
  const attributedPaths: LineagePath[] = useMemo(() => {
    if (!investigation) return [];
    if (investigation.attributed_paths && investigation.attributed_paths.length > 0) {
      return investigation.attributed_paths;
    }
    // Fallback if candidate_paths contains objects with path_type
    if (investigation.candidate_paths && typeof investigation.candidate_paths[0] === 'object') {
      return (investigation.candidate_paths as any[]).filter(p => p.path_type === 'ATTRIBUTED');
    }
    return [];
  }, [investigation]);

  const candidatePaths: any[] = useMemo(() => {
    if (!investigation) return [];
    if (investigation.candidate_paths && typeof investigation.candidate_paths[0] === 'object') {
      return (investigation.candidate_paths as any[]).filter(p => p.path_type === 'CANDIDATE');
    }
    return investigation.candidate_paths || [];
  }, [investigation]);

  if (loading && !investigation) {
    return (
      <div className="py-24 flex flex-col items-center justify-center space-y-3 font-mono">
        <RotateCcw className="w-8 h-8 animate-spin text-[#0284C7]" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
          Reconstructing Multi-Bank Lineage & Fund Attribution...
        </h3>
        <p className="text-xs text-neutral-500">Executing bounded bidirectional FIFO graph traversal</p>
      </div>
    );
  }

  if (!investigation) {
    return (
      <div className="bg-white dark:bg-[#111215] border border-neutral-200 dark:border-neutral-800 p-8 rounded-md text-center space-y-4 max-w-xl mx-auto my-12">
        <Info className="w-10 h-10 text-neutral-400 mx-auto" />
        <h2 className="text-base font-black uppercase font-mono text-neutral-900 dark:text-white">
          No Active Investigation Selected
        </h2>
        <p className="text-xs text-neutral-500 font-mono">
          Launch an investigation by selecting a flagged alert from the Alerts table, clicking on an account in Network Explorer, or running a demo scenario in Scenario Lab.
        </p>
        <div className="pt-2">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[#E30613] text-white font-mono font-bold text-xs uppercase tracking-wider rounded"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Dossier Header */}
      <div className="border-b-2 border-neutral-900 dark:border-neutral-100 pb-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-[11px] font-mono uppercase tracking-widest text-[#E30613] font-bold">
              <span>FORENSIC LINEAGE</span>
              <span className="text-neutral-400">—</span>
              <span className="text-neutral-500">EXPLAINABLE MULTI-BANK RECONSTRUCTION</span>
            </div>
            <h1 className="text-2xl md:text-4xl font-black uppercase tracking-tight text-neutral-900 dark:text-neutral-100 mt-1">
              Investigation Workspace.
            </h1>
            <div className="flex items-center space-x-3 text-xs font-mono text-neutral-500 dark:text-neutral-400 mt-1">
              <span>DOSSIER: <strong className="text-neutral-900 dark:text-neutral-100">#{investigation.id.slice(0, 8)}</strong></span>
              <span>•</span>
              <span>TRIGGER ACCOUNT: <strong className="text-[#E30613] font-bold">{investigation.root_account_ref}</strong> ({investigation.root_bank_code})</span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleExport('html')}
              className="border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-neutral-900 text-neutral-800 dark:text-neutral-200 font-mono font-bold px-3 py-1.5 text-xs uppercase tracking-wider flex items-center space-x-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#E30613]" />
              <span>EXPORT HTML</span>
            </button>
            <button
              onClick={() => handleExport('json')}
              className="border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:border-neutral-900 text-neutral-800 dark:text-neutral-200 font-mono font-bold px-3 py-1.5 text-xs uppercase tracking-wider flex items-center space-x-1.5 transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-neutral-500" />
              <span>EXPORT JSON</span>
            </button>
            <button
              onClick={handleRetrace}
              disabled={loading}
              className="bg-[#E30613] hover:bg-[#C00510] text-white font-mono font-bold px-4 py-1.5 text-xs uppercase tracking-wider flex items-center space-x-2 transition-colors disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>RE-RUN TRACE</span>
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        {investigation.summary_metrics_json && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
            <div className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151619] p-3 rounded">
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">ACCOUNTS</span>
              <span className="text-xl font-black font-mono text-neutral-900 dark:text-white tabular-nums mt-0.5 block">
                {investigation.summary_metrics_json.accounts_discovered}
              </span>
            </div>
            <div className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151619] p-3 rounded">
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">BANKS CROSSED</span>
              <span className="text-xl font-black font-mono text-neutral-900 dark:text-white tabular-nums mt-0.5 block">
                {investigation.summary_metrics_json.banks_crossed}
              </span>
            </div>
            <div className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151619] p-3 rounded">
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">MOVEMENTS</span>
              <span className="text-xl font-black font-mono text-neutral-900 dark:text-white tabular-nums mt-0.5 block">
                {investigation.summary_metrics_json.transactions_traversed}
              </span>
            </div>
            <div className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151619] p-3 rounded">
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">MAX DEPTH</span>
              <span className="text-xl font-black font-mono text-neutral-900 dark:text-white tabular-nums mt-0.5 block">
                {investigation.summary_metrics_json.max_hop_depth} <span className="text-xs font-normal text-neutral-400">HOPS</span>
              </span>
            </div>
            <div className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151619] p-3 rounded">
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">OFF-RAMPS</span>
              <span className="text-xl font-black font-mono text-[#E30613] tabular-nums mt-0.5 block">
                {investigation.summary_metrics_json.off_ramps_found}
              </span>
            </div>
            <div className="border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#151619] p-3 rounded">
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">CONFIDENCE</span>
              <span className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5 block">
                {Math.round(investigation.summary_metrics_json.avg_confidence * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Trace Stop Reason Banner */}
        <div className="mt-4 p-3 border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900/60 rounded flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 bg-[#E30613] inline-block flex-shrink-0" />
            <div className="text-neutral-700 dark:text-neutral-300">
              <strong className="text-neutral-900 dark:text-white uppercase mr-1">STOP REASON [{investigation.stop_reason}]:</strong>
              <span>{STOP_REASON_MAP[investigation.stop_reason] || investigation.stop_reason}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-[10px] text-neutral-500 whitespace-nowrap">
            <span className="border border-neutral-300 dark:border-neutral-700 px-2 py-0.5 uppercase">
              STATUS: {investigation.status}
            </span>
          </div>
        </div>
      </div>

      {/* Main Graph Canvas + Side Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Graph Canvas Column (8 Cols) */}
        <div
          ref={graphCardRef}
          className={`${
            isFullScreen
              ? 'fixed inset-0 z-50 bg-[#FAFAFA] dark:bg-[#0C0D0E] p-6 flex flex-col w-screen h-screen m-0'
              : 'lg:col-span-8 bg-white dark:bg-[#151619] border border-neutral-200 dark:border-neutral-800 p-4 rounded-md flex flex-col h-[640px] relative'
          }`}
        >
          {/* Controls & Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-neutral-200 dark:border-neutral-800 text-xs font-mono z-10">
            {/* Direction Filter */}
            <div className="flex border border-neutral-300 dark:border-neutral-700 rounded overflow-hidden">
              <button
                onClick={() => setViewMode('COMBINED')}
                className={`px-2.5 py-1 uppercase font-bold transition-colors ${
                  viewMode === 'COMBINED'
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                    : 'bg-transparent text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                Combined
              </button>
              <button
                onClick={() => setViewMode('BACKWARD')}
                className={`px-2.5 py-1 uppercase font-bold border-l border-neutral-300 dark:border-neutral-700 transition-colors ${
                  viewMode === 'BACKWARD'
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                    : 'bg-transparent text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                Backward (Origin)
              </button>
              <button
                onClick={() => setViewMode('FORWARD')}
                className={`px-2.5 py-1 uppercase font-bold border-l border-neutral-300 dark:border-neutral-700 transition-colors ${
                  viewMode === 'FORWARD'
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                    : 'bg-transparent text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                Forward (Exit)
              </button>
            </div>

            {/* Attribution Mode Filter */}
            <div className="flex items-center space-x-1">
              <select
                value={attributionFilter}
                onChange={e => setAttributionFilter(e.target.value as any)}
                className="py-1 px-2 border border-neutral-300 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-900 text-xs font-mono font-bold"
              >
                <option value="ALL">All Active Edges</option>
                <option value="ATTRIBUTED_ONLY">Attributed Flow Only (Solid)</option>
                <option value="CANDIDATE_ONLY">Candidate Routes Only (Dashed)</option>
                <option value="INCLUDE_EXCLUDED">Include Excluded (Dotted)</option>
              </select>
            </div>

            {/* Hop Playback Controls */}
            <div className="flex items-center space-x-1 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-0.5 rounded text-xs font-mono">
              <button
                onClick={() => {
                  setCurrentHop(1);
                  setIsPlaying(false);
                }}
                className="px-1.5 py-0.5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800"
                title="Rewind"
              >
                <SkipBack className="w-3 h-3" />
              </button>
              <button
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentHop(prev => Math.max(1, prev - 1));
                }}
                disabled={currentHop <= 1}
                className="px-1.5 py-0.5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-30"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="px-2.5 py-0.5 bg-[#E30613] hover:bg-[#C00510] text-white font-bold flex items-center space-x-1 uppercase text-[10px]"
              >
                {isPlaying ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
                <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
              </button>
              <button
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentHop(prev => Math.min(totalHops, prev + 1));
                }}
                disabled={currentHop >= totalHops}
                className="px-1.5 py-0.5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-30"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
              <span className="px-2 text-[10px] text-neutral-400 font-mono">
                {currentHop}/{totalHops}
              </span>
            </div>

            {/* Fullscreen Button */}
            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-1 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded"
              title="Full screen"
            >
              {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Cytoscape Container */}
          <div ref={graphContainerRef} className="flex-1 w-full h-full cursor-grab active:cursor-grabbing" />

          {/* Graph Legend */}
          <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex flex-wrap items-center justify-between text-[10px] font-mono text-neutral-500 gap-2">
            <div className="flex items-center space-x-4">
              <span className="flex items-center space-x-1.5">
                <span className="w-4 h-0.5 bg-[#E30613] inline-block" />
                <span className="font-bold text-neutral-800 dark:text-neutral-200">Solid Red: Attributed Suspicious Flow</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-4 h-0.5 border-b border-dashed border-[#64748B] inline-block" />
                <span>Dashed Slate: Candidate Route (Zero Attributed)</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-4 h-0.5 border-b border-dotted border-[#9CA3AF] inline-block" />
                <span>Dotted: Excluded (Reversed/Failed)</span>
              </span>
            </div>
            <div>
              <span>Click node or edge for complete FIFO audit trail</span>
            </div>
          </div>
        </div>

        {/* Selected Entity Inspector (4 Cols) */}
        <div className="lg:col-span-4 bg-white dark:bg-[#151619] border border-neutral-200 dark:border-neutral-800 p-5 rounded-md h-[640px] overflow-y-auto space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-[#E30613] inline-block" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 dark:text-white font-mono">
                Entity Audit Inspector
              </h2>
            </div>
            <span className="text-[10px] font-mono text-neutral-400 uppercase">
              {selectedEntity ? ('account_ref' in selectedEntity ? 'Node' : 'Movement') : 'Idle'}
            </span>
          </div>

          {selectedEntity ? (
            'account_ref' in selectedEntity ? (
              // Selected Account Node Inspector
              <div className="space-y-4 text-xs font-mono">
                <div className="p-3 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 rounded">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">
                    Inspected Account
                  </span>
                  <div className="text-lg font-black text-neutral-900 dark:text-white mt-0.5">
                    {selectedEntity.account_ref}
                  </div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 flex items-center gap-2">
                    <span>INSTITUTION:</span>
                    <strong className="text-neutral-900 dark:text-neutral-100 font-bold">
                      {selectedEntity.bank_name} ({selectedEntity.bank_code})
                    </strong>
                  </div>
                </div>

                <div className="border-b border-neutral-200 dark:border-neutral-800 pb-2.5">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">
                    Topological Role
                  </span>
                  <div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                      selectedEntity.is_off_ramp ? 'bg-[#8B0000] text-white' :
                      selectedEntity.is_origin ? 'bg-teal-700 text-white' :
                      selectedEntity.direction === 'ROOT' ? 'bg-[#E30613] text-white' :
                      'border border-neutral-400 text-neutral-800 dark:text-neutral-200'
                    }`}>
                      {selectedEntity.direction} {selectedEntity.is_off_ramp ? '• OFF-RAMP' : ''} {selectedEntity.is_origin ? '• ORIGIN VICTIM' : ''}
                    </span>
                  </div>
                </div>

                <div className="border-b border-neutral-200 dark:border-neutral-800 pb-2.5">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-0.5">
                    Hop Depth From Trigger
                  </span>
                  <div className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                    {selectedEntity.hop_depth} hops
                  </div>
                </div>

                <div className="border-b border-neutral-200 dark:border-neutral-800 pb-2.5">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-0.5">
                    Attributed Fund Volume
                  </span>
                  <div className="text-xl font-black text-neutral-900 dark:text-white tabular-nums">
                    ₹{(selectedEntity.amount_attributed_minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">
                    Evidence & Uncertainty Metric
                  </span>
                  <div className="text-neutral-800 dark:text-neutral-200 text-xs">
                    {selectedEntity.evidence_type}
                  </div>
                  <div className="mt-2 text-xs flex items-center justify-between border border-neutral-200 dark:border-neutral-800 p-2 rounded">
                    <span className="text-neutral-500">Uncertainty Index:</span>
                    <span className="font-bold text-neutral-900 dark:text-neutral-100">
                      {(selectedEntity.uncertainty * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              // Selected Transaction Edge Inspector
              <div className="space-y-4 text-xs font-mono">
                <div className="p-3 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 rounded">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold">
                    Settled Movement
                  </span>
                  <div className="text-xl font-black text-neutral-900 dark:text-white tabular-nums mt-0.5">
                    ₹{(selectedEntity.amount_minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 uppercase">
                    Via {selectedEntity.rail} • Hop Depth #{selectedEntity.hop_depth}
                  </div>
                </div>

                <div className="border-b border-neutral-200 dark:border-neutral-800 pb-2.5 space-y-1">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">
                    Classification & Attribution
                  </span>
                  <div>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        selectedEntity.edge_type === 'ATTRIBUTED'
                          ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300'
                          : selectedEntity.edge_type === 'CANDIDATE'
                          ? 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300 border border-slate-300'
                          : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 border border-neutral-300'
                      }`}
                    >
                      {selectedEntity.edge_type || 'ATTRIBUTED'} EDGE
                    </span>
                  </div>
                  {selectedEntity.edge_type === 'ATTRIBUTED' && (
                    <div className="text-xs text-neutral-800 dark:text-neutral-200 mt-1">
                      Attributed Amount: <strong>₹{((selectedEntity.attributed_amount_minor || selectedEntity.amount_minor) / 100).toLocaleString()}</strong>
                    </div>
                  )}
                  {selectedEntity.exclusion_reason && (
                    <div className="text-[11px] text-neutral-500 italic mt-1">
                      Note: {selectedEntity.exclusion_reason}
                    </div>
                  )}
                </div>

                <div className="border-b border-neutral-200 dark:border-neutral-800 pb-2.5 space-y-1">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">
                    Endpoints
                  </span>
                  <div>
                    <span className="text-neutral-400">Source: </span>
                    <strong className="text-neutral-900 dark:text-neutral-100">
                      {selectedEntity.source_account_ref} ({selectedEntity.source_bank_code})
                    </strong>
                  </div>
                  <div>
                    <span className="text-neutral-400">Destination: </span>
                    <strong className="text-neutral-900 dark:text-neutral-100">
                      {selectedEntity.destination_account_ref} ({selectedEntity.destination_bank_code})
                    </strong>
                  </div>
                  {selectedEntity.is_cross_bank && (
                    <div className="pt-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider border border-[#0284C7] text-[#0284C7] px-1.5 py-0.5 rounded">
                        Inter-Bank Clearing
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">
                    Allocation Method & Confidence
                  </span>
                  <div className="text-neutral-800 dark:text-neutral-200 font-bold">
                    {selectedEntity.allocation_method}
                  </div>
                  <div className="mt-2 text-xs flex items-center justify-between border border-neutral-200 dark:border-neutral-800 p-2 rounded">
                    <span className="text-neutral-500">Lineage Confidence:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {Math.round(selectedEntity.confidence * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="py-24 text-center text-neutral-400 font-mono text-xs">
              Click any graph node or edge to inspect attributes, FIFO attribution rationale, and counterparties.
            </div>
          )}
        </div>
      </div>

      {/* Tabs: Reconstructed Paths, Hop Evidence, and Chronological Timeline */}
      <div className="bg-white dark:bg-[#151619] border border-neutral-200 dark:border-neutral-800 p-5 rounded-md space-y-5">
        <div className="flex flex-wrap items-center space-x-6 border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <button
            onClick={() => setActiveTabPanel('paths')}
            className={`text-xs font-mono font-bold uppercase tracking-wider transition-colors pb-1 ${
              activeTabPanel === 'paths'
                ? 'text-[#E30613] border-b-2 border-[#E30613]'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            Reconstructed Paths ({attributedPaths.length} Attributed, {candidatePaths.length} Candidate)
          </button>
          <button
            onClick={() => setActiveTabPanel('timeline')}
            className={`text-xs font-mono font-bold uppercase tracking-wider transition-colors pb-1 ${
              activeTabPanel === 'timeline'
                ? 'text-[#E30613] border-b-2 border-[#E30613]'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            Chronological Timeline ({investigation.timeline?.length || 0})
          </button>
          <button
            onClick={() => setActiveTabPanel('hops')}
            className={`text-xs font-mono font-bold uppercase tracking-wider transition-colors pb-1 ${
              activeTabPanel === 'hops'
                ? 'text-[#E30613] border-b-2 border-[#E30613]'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            Hop Evidence Rows ({investigation.edges?.length || 0})
          </button>
        </div>

        {/* Tab 1: Reconstructed Paths */}
        {activeTabPanel === 'paths' && (
          <div className="space-y-4 font-mono text-xs">
            {/* Attributed Paths Section */}
            <div>
              <div className="flex items-center space-x-2 mb-2 text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Attributed Lineage Paths (Suspicious Movement Verified via FIFO)</span>
              </div>
              {attributedPaths.length === 0 ? (
                <div className="p-3 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-neutral-500 rounded">
                  No fully attributed end-to-end paths meeting certainty threshold.
                </div>
              ) : (
                <div className="space-y-2">
                  {attributedPaths.map((p, idx) => (
                    <div
                      key={p.path_id || idx}
                      className="p-3 border-2 border-red-200 dark:border-red-950 bg-red-50/50 dark:bg-red-950/20 rounded flex flex-col md:flex-row md:items-center justify-between gap-2"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-[#E30613] text-white rounded uppercase">
                            Attributed Path #{idx + 1}
                          </span>
                          <span className="text-neutral-700 dark:text-neutral-300 font-bold">
                            {p.nodes ? p.nodes.join('  ⟶  ') : JSON.stringify(p)}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          {p.explanation || `Attributed Flow: ₹${((p.attributed_amount_minor || 0) / 100).toLocaleString()} across ${p.hop_count || (p.nodes?.length - 1)} hops.`}
                        </p>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {Math.round((p.confidence || 0.95) * 100)}% Confidence
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Candidate Paths Section */}
            <div className="pt-2">
              <div className="flex items-center space-x-2 mb-2 text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
                <HelpCircle className="w-4 h-4 text-slate-500" />
                <span>Candidate Settlement Routes (Observed Routes with Zero or Uncertain Attributed Flow)</span>
              </div>
              {candidatePaths.length === 0 ? (
                <div className="p-3 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-neutral-500 rounded">
                  No additional candidate routes discovered.
                </div>
              ) : (
                <div className="space-y-2">
                  {candidatePaths.map((p, idx) => {
                    const isObj = typeof p === 'object' && p !== null && !Array.isArray(p);
                    const nodeChain = isObj ? (p.nodes ? p.nodes.join('  ⟶  ') : '') : p.join('  ⟶  ');
                    const expl = isObj ? p.explanation : 'Eligible route, but FIFO indicates non-illicit balance source.';
                    return (
                      <div
                        key={idx}
                        className="p-3 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 rounded flex flex-col md:flex-row md:items-center justify-between gap-2"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded uppercase">
                              Candidate Path #{idx + 1}
                            </span>
                            <span className="text-neutral-700 dark:text-neutral-300 font-bold">
                              {nodeChain}
                            </span>
                          </div>
                          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            {expl}
                          </p>
                        </div>
                        <div className="text-right whitespace-nowrap text-[11px] text-neutral-400">
                          Route Only (0 Attributed)
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Chronological Timeline */}
        {activeTabPanel === 'timeline' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  <th className="pb-2.5 font-bold">TIMESTAMP (UTC)</th>
                  <th className="pb-2.5 font-bold">SOURCE</th>
                  <th className="pb-2.5 font-bold">DESTINATION</th>
                  <th className="pb-2.5 font-bold">RAIL</th>
                  <th className="pb-2.5 font-bold">AMOUNT</th>
                  <th className="pb-2.5 font-bold">ATTRIBUTED</th>
                  <th className="pb-2.5 font-bold">CLASSIFICATION</th>
                  <th className="pb-2.5 font-bold">CONFIDENCE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {!investigation.timeline?.length ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-neutral-400 font-mono text-xs">
                      No chronological timeline events recorded.
                    </td>
                  </tr>
                ) : (
                  investigation.timeline.map((item, idx) => (
                    <tr key={idx} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/30">
                      <td className="py-2.5 text-neutral-500">{item.timestamp?.slice(0, 19)}</td>
                      <td className="py-2.5 font-bold text-neutral-900 dark:text-neutral-100">
                        {item.source_account_ref} ({item.source_bank_code})
                      </td>
                      <td className="py-2.5 font-bold text-neutral-900 dark:text-neutral-100">
                        {item.destination_account_ref} ({item.destination_bank_code})
                      </td>
                      <td className="py-2.5 text-neutral-600 dark:text-neutral-400 font-sans">{item.rail}</td>
                      <td className="py-2.5 font-black text-neutral-900 dark:text-white tabular-nums">
                        ₹{(item.amount_minor / 100).toLocaleString()}
                      </td>
                      <td className="py-2.5 font-bold text-[#E30613] tabular-nums">
                        ₹{(((item as any).attributed_amount_minor || 0) / 100).toLocaleString()}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                            (item as any).edge_type === 'ATTRIBUTED'
                              ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                              : 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300'
                          }`}
                        >
                          {(item as any).edge_type || 'ATTRIBUTED'}
                        </span>
                      </td>
                      <td className="py-2.5 text-emerald-600 dark:text-emerald-400 font-bold">
                        {Math.round(item.confidence * 100)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Hop Evidence Rows */}
        {activeTabPanel === 'hops' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  <th className="pb-2.5 font-bold">HOP</th>
                  <th className="pb-2.5 font-bold">DIRECTION</th>
                  <th className="pb-2.5 font-bold">SOURCE</th>
                  <th className="pb-2.5 font-bold">DESTINATION</th>
                  <th className="pb-2.5 font-bold">AMOUNT</th>
                  <th className="pb-2.5 font-bold">ATTRIBUTED</th>
                  <th className="pb-2.5 font-bold">METHOD</th>
                  <th className="pb-2.5 font-bold">CROSS-BANK</th>
                  <th className="pb-2.5 font-bold">CONFIDENCE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {!investigation.edges?.length ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-neutral-400 font-mono text-xs">
                      No hop movements found in active dossier.
                    </td>
                  </tr>
                ) : (
                  investigation.edges.map((e, idx) => (
                    <tr key={idx} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/30">
                      <td className="py-2.5 font-bold text-[#E30613]">HOP {e.hop_depth}</td>
                      <td className="py-2.5">
                        <span className="text-[10px] font-bold border border-neutral-300 dark:border-neutral-700 px-1.5 py-0.5 rounded">
                          {e.direction}
                        </span>
                      </td>
                      <td className="py-2.5 font-bold">{e.source_account_ref} ({e.source_bank_code})</td>
                      <td className="py-2.5 font-bold">{e.destination_account_ref} ({e.destination_bank_code})</td>
                      <td className="py-2.5 font-black text-neutral-900 dark:text-white tabular-nums">
                        ₹{(e.amount_minor / 100).toLocaleString()}
                      </td>
                      <td className="py-2.5 font-bold text-[#E30613] tabular-nums">
                        ₹{((e.attributed_amount_minor || 0) / 100).toLocaleString()}
                      </td>
                      <td className="py-2.5 text-neutral-500 text-[10px]">{e.allocation_method}</td>
                      <td className="py-2.5">
                        {e.is_cross_bank ? (
                          <span className="text-[9px] font-bold uppercase tracking-wider bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 px-1.5 py-0.5 rounded">
                            YES
                          </span>
                        ) : (
                          <span className="text-neutral-400">NO</span>
                        )}
                      </td>
                      <td className="py-2.5 text-emerald-600 dark:text-emerald-400 font-bold">
                        {Math.round(e.confidence * 100)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
