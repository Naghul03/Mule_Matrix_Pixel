import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Filter,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Building,
  Info,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import cytoscape from 'cytoscape';
import { api } from '../lib/api';
import { Account, Transaction, Bank, DetectionAlert } from '../types/api';
import { useTheme } from '../context/ThemeContext';

const BANK_COLORS: Record<string, string> = {
  HDFX: '#0284c7', // Sky Blue
  ICIX: '#ea580c', // Orange
  SBNX: '#16a34a', // Emerald
  AXSX: '#7c3aed', // Purple
  KOTX: '#db2777', // Pink
  PNBX: '#d97706', // Amber
  BOBX: '#0d9488', // Teal
  PAYX: '#0891b2', // Cyan
  DEFAULT: '#64748b'
};

export const NetworkExplorer: React.FC = () => {
  const { theme } = useTheme();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [alerts, setAlerts] = useState<DetectionAlert[]>([]);
  
  // Filters
  const [selectedBank, setSelectedBank] = useState<string>('ALL');
  const [riskFilter, setRiskFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected Inspector
  const [selectedNode, setSelectedNode] = useState<Account | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Transaction | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const loadData = async () => {
    try {
      const [accs, txs, bnks, alts] = await Promise.all([
        api.getAccounts({ limit: 120 }),
        api.getTransactions({ limit: 150 }),
        api.getBanks(),
        api.getAlerts({ limit: 50 })
      ]);
      setAccounts(accs);
      setTransactions(txs);
      setBanks(bnks);
      setAlerts(alts);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update Cytoscape Graph
  useEffect(() => {
    if (!containerRef.current || accounts.length === 0) return;

    let filteredAccs = accounts;
    if (selectedBank !== 'ALL') {
      filteredAccs = filteredAccs.filter(a => a.bank_code === selectedBank);
    }
    if (riskFilter !== 'ALL') {
      filteredAccs = filteredAccs.filter(a => a.risk_state === riskFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filteredAccs = filteredAccs.filter(a => a.account_ref.toLowerCase().includes(q));
    }

    const accIds = new Set(filteredAccs.map(a => a.id));
    const filteredTxs = transactions.filter(t => accIds.has(t.source_account_id) && accIds.has(t.destination_account_id));

    const isDark = theme === 'dark';
    const elements: cytoscape.ElementDefinition[] = [];

    // Nodes
    filteredAccs.forEach(acc => {
      const isMule = acc.risk_state === 'SUSPECTED_MULE' || alerts.some(a => a.account_id === acc.id);
      const bColor = BANK_COLORS[acc.bank_code || ''] || BANK_COLORS.DEFAULT;

      elements.push({
        group: 'nodes',
        data: {
          id: acc.id,
          label: `${acc.account_ref}\n${acc.bank_code || ''}`,
          account_ref: acc.account_ref,
          bank_code: acc.bank_code,
          isMule,
          color: isMule ? '#dc2626' : bColor,
          borderColor: isMule ? '#ef4444' : (isDark ? '#334155' : '#cbd5e1')
        }
      });
    });

    // Edges
    filteredTxs.forEach(tx => {
      elements.push({
        group: 'edges',
        data: {
          id: tx.id,
          source: tx.source_account_id,
          target: tx.destination_account_id,
          amount_formatted: `₹${(tx.amount_minor / 100).toLocaleString()}`,
          rail: tx.rail,
          isCross: tx.is_cross_bank
        }
      });
    });

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            'border-width': 1.5,
            'border-color': 'data(borderColor)',
            'label': 'data(label)',
            'color': isDark ? '#f8fafc' : '#0f172a',
            'font-size': '10px',
            'font-family': 'Inter, sans-serif',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'width': 40,
            'height': 40
          } as any
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#2563eb',
            'width': 48,
            'height': 48
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1.5,
            'line-color': isDark ? '#334155' : '#cbd5e1',
            'target-arrow-color': isDark ? '#334155' : '#cbd5e1',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(amount_formatted)',
            'font-size': '9px',
            'font-family': 'Inter, sans-serif',
            'color': isDark ? '#94a3b8' : '#64748b',
            'text-background-opacity': 0.9,
            'text-background-color': isDark ? '#0f172a' : '#ffffff',
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle'
          }
        },
        {
          selector: 'edge:selected',
          style: {
            'width': 2.5,
            'line-color': '#2563eb',
            'target-arrow-color': '#2563eb'
          }
        }
      ],
      layout: {
        name: 'cose',
        animate: true,
        padding: 40,
        nodeRepulsion: () => 7000,
        idealEdgeLength: () => 80
      }
    });

    cy.on('tap', 'node', (evt) => {
      const nodeData = evt.target.data();
      const acc = accounts.find(a => a.id === nodeData.id);
      setSelectedNode(acc || null);
      setSelectedEdge(null);
    });

    cy.on('tap', 'edge', (evt) => {
      const edgeData = evt.target.data();
      const tx = transactions.find(t => t.id === edgeData.id);
      setSelectedEdge(tx || null);
      setSelectedNode(null);
    });

    cyRef.current = cy;
  }, [accounts, transactions, selectedBank, riskFilter, searchQuery, theme]);

  return (
    <div className="space-y-4">
      {/* Top Filter Bar */}
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-apple">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search account ref..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500 w-44 font-mono"
            />
          </div>

          {/* Bank Filter */}
          <div className="flex items-center space-x-1.5 text-xs text-slate-600 dark:text-slate-300">
            <span>Bank:</span>
            <select
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
            >
              <option value="ALL">All Banks (8)</option>
              {banks.map(b => (
                <option key={b.id} value={b.bank_code}>{b.bank_code}</option>
              ))}
            </select>
          </div>

          {/* Risk Filter */}
          <div className="flex items-center space-x-1.5 text-xs text-slate-600 dark:text-slate-300">
            <span>Risk:</span>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
            >
              <option value="ALL">All Accounts</option>
              <option value="SUSPECTED_MULE">Suspected Mule</option>
              <option value="NORMAL">Normal</option>
            </select>
          </div>
        </div>

        {/* Canvas Controls */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.25)}
            className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)}
            className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => cyRef.current?.fit()}
            className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Fit to Canvas"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => cyRef.current?.layout({ name: 'cose', animate: true }).run()}
            className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Re-layout"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Graph & Inspector Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Graph (3 Cols) */}
        <div className="lg:col-span-3 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-3 h-[680px] flex flex-col relative shadow-apple">
          <div ref={containerRef} className="w-full h-full rounded-lg bg-slate-50 dark:bg-[#090d16]" />

          {/* Minimalist Legend */}
          <div className="absolute bottom-6 left-6 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 rounded-md p-2 text-[11px] flex items-center space-x-3 shadow-sm backdrop-blur">
            <span className="font-medium text-slate-600 dark:text-slate-400">Institutions:</span>
            {banks.map(b => (
              <span key={b.id} className="flex items-center space-x-1 font-mono">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: BANK_COLORS[b.bank_code] || '#64748b' }}></span>
                <span>{b.bank_code}</span>
              </span>
            ))}
            <span className="flex items-center space-x-1 text-red-600 font-medium pl-2 border-l border-slate-200 dark:border-slate-700">
              <span className="w-2 h-2 rounded-full bg-red-600 inline-block"></span>
              <span>Mule Flagged</span>
            </span>
          </div>
        </div>

        {/* Side Inspector (1 Col) */}
        <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-xl p-5 h-[680px] overflow-y-auto shadow-apple">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white pb-3 border-b border-slate-200 dark:border-slate-800">
            Inspector
          </h3>

          {selectedNode ? (
            <div className="mt-4 space-y-4 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase font-medium">Account Reference</span>
                <div className="font-mono text-sm font-semibold text-slate-900 dark:text-white mt-0.5">{selectedNode.account_ref}</div>
                <div className="text-slate-500 mt-0.5">
                  {selectedNode.bank_code} • {selectedNode.account_type}
                </div>
              </div>

              <div>
                <span className="text-slate-500 font-medium">Risk Status</span>
                <div className="mt-1">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    selectedNode.risk_state === 'SUSPECTED_MULE'
                      ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                  }`}>
                    {selectedNode.risk_state}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-500 font-medium">Simulated Balance</span>
                <div className="font-mono text-base font-semibold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                  ₹{(selectedNode.balance_minor / 100).toLocaleString()}
                </div>
              </div>

              {alerts.find(a => a.account_id === selectedNode.id) && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 space-y-1">
                  <div className="font-semibold flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Alert Raised
                  </div>
                  <div>Risk Score: {alerts.find(a => a.account_id === selectedNode.id)?.risk_score}</div>
                  <div className="text-[11px] font-mono">
                    {alerts.find(a => a.account_id === selectedNode.id)?.rules_triggered.join(', ')}
                  </div>
                </div>
              )}
            </div>
          ) : selectedEdge ? (
            <div className="mt-4 space-y-4 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase font-medium">Transaction</span>
                <div className="font-mono text-xs font-semibold text-slate-900 dark:text-white mt-0.5 break-all">{selectedEdge.id}</div>
              </div>

              <div>
                <span className="text-slate-500 font-medium">Amount</span>
                <div className="font-mono text-base font-semibold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                  ₹{(selectedEdge.amount_minor / 100).toLocaleString()}
                </div>
              </div>

              <div>
                <span className="text-slate-500 font-medium">Endpoints</span>
                <div className="font-mono text-slate-700 dark:text-slate-300 mt-1 space-y-1">
                  <div>Sender: {selectedEdge.source_account_ref} ({selectedEdge.source_bank_code})</div>
                  <div>Receiver: {selectedEdge.destination_account_ref} ({selectedEdge.destination_bank_code})</div>
                </div>
              </div>

              <div>
                <span className="text-slate-500 font-medium">Payment Rail</span>
                <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{selectedEdge.rail}</div>
              </div>

              <div>
                <span className="text-slate-500 font-medium">Memo</span>
                <div className="text-slate-600 dark:text-slate-400 italic mt-0.5">{selectedEdge.memo || "None"}</div>
              </div>
            </div>
          ) : (
            <div className="py-24 text-center text-slate-400 text-xs">
              Select any account node or transaction to inspect properties.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
