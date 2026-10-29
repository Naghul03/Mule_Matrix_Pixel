import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  Filter,
  Maximize2,
  Minimize2,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
  Building,
  Layers,
  Info,
  Network,
  Cpu,
  Activity
} from 'lucide-react';
import cytoscape from 'cytoscape';
import { api } from '../lib/api';
import { Bank, Account, Transaction } from '../types/api';
import { useTheme } from '../context/ThemeContext';

interface NetworkExplorerProps {
  onNavigateTab: (tab: string, context?: any) => void;
}

const BANK_COLORS: Record<string, string> = {
  HDFX: '#2563EB', // Blue
  ICIX: '#EA580C', // Orange
  SBNX: '#0284C7', // Sky Blue
  AXSX: '#991B1B', // Maroon
  KOTX: '#DC2626', // Red
  PNBX: '#D97706', // Amber
  BOBX: '#F97316', // Orange
  PAYX: '#06B6D4', // Cyan
  DEFAULT: '#64748B' // Slate
};

export const NetworkExplorer: React.FC<NetworkExplorerProps> = ({ onNavigateTab }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [banks, setBanks] = useState<Bank[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Louvain Communities state
  const [communitiesData, setCommunitiesData] = useState<{
    status: string;
    modularity: number;
    total_communities: number;
    communities: any[];
  } | null>(null);
  const [filterMuleClustersOnly, setFilterMuleClustersOnly] = useState<boolean>(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBankId, setSelectedBankId] = useState<string>('ALL');
  const [selectedRiskState, setSelectedRiskState] = useState<string>('ALL');
  const [minAmount, setMinAmount] = useState<number>(0);
  const [maxNodesToShow, setMaxNodesToShow] = useState<number>(60);

  // Selection & Account Analytics
  const [selectedEntity, setSelectedEntity] = useState<
    { type: 'account'; data: Account } | { type: 'transaction'; data: Transaction } | null
  >(null);
  const [accountAnalytics, setAccountAnalytics] = useState<{
    community?: any;
    anomaly?: any;
    graphsage?: any;
    loading: boolean;
  }>({ loading: false });

  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [banksData, accsData, txsData, comms] = await Promise.allSettled([
        api.getBanks(),
        api.getAccounts({ limit: 120 }),
        api.getTransactions({ limit: 200 }),
        api.getGraphCommunities()
      ]);
      if (banksData.status === 'fulfilled') setBanks(banksData.value);
      if (accsData.status === 'fulfilled') setAccounts(accsData.value);
      if (txsData.status === 'fulfilled') setTransactions(txsData.value);
      if (comms.status === 'fulfilled') setCommunitiesData(comms.value);
    } catch (err) {
      console.error('Failed to load network data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fetch ML Analytics when an account is selected
  useEffect(() => {
    if (selectedEntity?.type === 'account') {
      const accId = selectedEntity.data.id;
      setAccountAnalytics({ loading: true });
      Promise.allSettled([
        api.getAccountCommunity(accId),
        api.getAccountAnomaly(accId),
        api.getAccountGraphSAGE(accId)
      ]).then(([commRes, anomRes, gsRes]) => {
        setAccountAnalytics({
          community: commRes.status === 'fulfilled' ? commRes.value.analysis : null,
          anomaly: anomRes.status === 'fulfilled' ? anomRes.value.anomaly_result : null,
          graphsage: gsRes.status === 'fulfilled' ? gsRes.value.graphsage_result : null,
          loading: false
        });
      });
    } else {
      setAccountAnalytics({ loading: false });
    }
  }, [selectedEntity]);

  // Set of accounts belonging to candidate mule clusters
  const muleClusterAccountIds = useMemo(() => {
    if (!communitiesData?.communities) return new Set<string>();
    const ids = new Set<string>();
    communitiesData.communities.forEach(c => {
      if (c.is_mule_cluster_candidate) {
        c.member_account_ids.forEach((id: string) => ids.add(id));
      }
    });
    return ids;
  }, [communitiesData]);

  // Filtered dataset
  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => {
      if (selectedBankId !== 'ALL' && acc.bank_id !== selectedBankId) return false;
      if (selectedRiskState !== 'ALL' && acc.risk_state !== selectedRiskState) return false;
      if (filterMuleClustersOnly && !muleClusterAccountIds.has(acc.id)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesRef = acc.account_ref.toLowerCase().includes(q);
        const matchesBank = (acc.bank_code || '').toLowerCase().includes(q);
        if (!matchesRef && !matchesBank) return false;
      }
      return true;
    }).slice(0, maxNodesToShow);
  }, [accounts, selectedBankId, selectedRiskState, filterMuleClustersOnly, muleClusterAccountIds, searchQuery, maxNodesToShow]);

  const activeAccountIds = useMemo(() => {
    return new Set(filteredAccounts.map(a => a.id));
  }, [filteredAccounts]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (!activeAccountIds.has(tx.source_account_id) && !activeAccountIds.has(tx.destination_account_id)) {
        return false;
      }
      if (minAmount > 0 && tx.amount_minor < minAmount * 100) {
        return false;
      }
      return true;
    });
  }, [transactions, activeAccountIds, minAmount]);

  // Cytoscape rendering
  useEffect(() => {
    if (!containerRef.current) return;
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    if (filteredAccounts.length === 0) return;

    const elements: cytoscape.ElementDefinition[] = [];

    // Add Nodes
    filteredAccounts.forEach(acc => {
      const bankCode = acc.bank_code || 'DEFAULT';
      const bankColor = BANK_COLORS[bankCode] || BANK_COLORS.DEFAULT;
      const isMule = acc.risk_state === 'SUSPECTED_MULE';
      const isElevated = acc.risk_state === 'ELEVATED';
      const inCluster = muleClusterAccountIds.has(acc.id);

      let borderColor = bankColor;
      let borderWidth = 2;
      let bgColor = isDark ? '#181A20' : '#FFFFFF';
      let size = 44;

      if (isMule) {
        borderColor = '#E30613'; // Crimson
        borderWidth = 3.5;
        bgColor = isDark ? '#2D1214' : '#FEE2E2';
        size = 50;
      } else if (isElevated) {
        borderColor = '#D97706'; // Amber
        borderWidth = 2.5;
        bgColor = isDark ? '#271E0B' : '#FEF3C7';
      } else if (inCluster) {
        borderColor = '#8B5CF6'; // Purple for Louvain ring candidate
        borderWidth = 2.5;
      }

      elements.push({
        group: 'nodes',
        data: {
          id: acc.id,
          label: `${acc.account_ref}\n${bankCode}`,
          bank_code: bankCode,
          risk_state: acc.risk_state,
          color: bgColor,
          borderColor,
          borderWidth,
          size,
          raw: acc
        }
      });
    });

    // Add Edges
    filteredTransactions.forEach(tx => {
      if (activeAccountIds.has(tx.source_account_id) && activeAccountIds.has(tx.destination_account_id)) {
        const isReversed = tx.status === 'REVERSED';
        const isFailed = tx.status === 'FAILED';
        let lineColor = isDark ? '#4B5563' : '#9CA3AF';
        let lineStyle: 'solid' | 'dashed' | 'dotted' = 'solid';

        if (isReversed || isFailed) {
          lineColor = '#EF4444';
          lineStyle = 'dotted';
        } else if (tx.is_cross_bank) {
          lineColor = '#0284C7'; // Cyan for cross-bank movement
        }

        elements.push({
          group: 'edges',
          data: {
            id: tx.id,
            source: tx.source_account_id,
            target: tx.destination_account_id,
            amount_formatted: `₹${(tx.amount_minor / 100).toLocaleString()}`,
            lineColor,
            lineStyle,
            raw: tx
          }
        });
      }
    });

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            'border-width': 'data(borderWidth)',
            'border-color': 'data(borderColor)',
            'label': 'data(label)',
            'color': isDark ? '#F3F4F6' : '#111827',
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
            'width': 2,
            'line-color': 'data(lineColor)',
            'line-style': 'data(lineStyle)' as any,
            'target-arrow-color': 'data(lineColor)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(amount_formatted)',
            'font-size': '9px',
            'font-family': 'JetBrains Mono, monospace',
            'color': isDark ? '#D1D5DB' : '#374151',
            'text-background-opacity': 0.85,
            'text-background-color': isDark ? '#111827' : '#FFFFFF',
            'text-background-padding': '2px'
          } as any
        },
        {
          selector: 'edge:selected',
          style: {
            'line-color': '#E30613',
            'target-arrow-color': '#E30613',
            'width': 3.5
          }
        }
      ],
      layout: {
        name: 'cose',
        animate: false,
        randomize: false,
        componentSpacing: 80,
        nodeOverlap: 20,
        padding: 40
      }
    });

    cy.on('tap', 'node', evt => {
      const raw = evt.target.data('raw');
      setSelectedEntity({ type: 'account', data: raw });
    });

    cy.on('tap', 'edge', evt => {
      const raw = evt.target.data('raw');
      setSelectedEntity({ type: 'transaction', data: raw });
    });

    cy.on('tap', evt => {
      if (evt.target === cy) {
        setSelectedEntity(null);
      }
    });

    cyRef.current = cy;
    setTimeout(() => {
      cy.fit(undefined, 30);
    }, 100);

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [filteredAccounts, filteredTransactions, isDark, muleClusterAccountIds]);

  return (
    <div className={`space-y-4 animate-fadeIn ${isFullScreen ? 'fixed inset-0 z-50 p-6 bg-white dark:bg-[#0A0B0D]' : ''}`}>
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-2 border-neutral-900 dark:border-neutral-100 pb-4">
        <div>
          <div className="flex items-center space-x-2 text-[11px] font-mono uppercase tracking-widest text-swiss-red font-bold">
            <Network className="w-3.5 h-3.5" />
            <span>TOPOLOGY & NETWORK EXPLORER</span>
            <span className="text-neutral-400">—</span>
            <span className="text-neutral-500">MULTI-BANK GRAPH ANALYTICS</span>
          </div>
          <div className="flex items-center space-x-3 mt-1">
            <h1 className="text-2xl md:text-4xl font-black uppercase tracking-tight text-neutral-900 dark:text-neutral-100">
              Network Explorer.
            </h1>
            {communitiesData && (
              <span className="px-2.5 py-0.5 rounded text-[11px] font-mono bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
                Louvain Q={communitiesData.modularity} ({communitiesData.total_communities} Communities)
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 mt-1 font-mono">
            Interactive multi-bank topology, Louvain modularity clustering, and Isolation Forest anomaly analysis.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setFilterMuleClustersOnly(!filterMuleClustersOnly)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono font-bold border rounded transition-colors ${
              filterMuleClustersOnly
                ? 'bg-purple-600 text-white border-purple-600'
                : 'border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{filterMuleClustersOnly ? 'Show All Nodes' : 'Filter Mule Clusters'}</span>
          </button>
          <button
            onClick={loadData}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono font-bold border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Reload</span>
          </button>
          <button
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono font-bold border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded transition-colors"
          >
            {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{isFullScreen ? 'Exit' : 'Full Screen'}</span>
          </button>
        </div>
      </div>

      {/* Control Bar & Filter Chips */}
      <div className="bg-white dark:bg-[#111215] border border-neutral-200 dark:border-neutral-800 p-4 rounded-md space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search account ref or bank..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-neutral-50 dark:bg-[#181A20] border border-neutral-300 dark:border-neutral-700 rounded text-neutral-900 dark:text-white font-mono placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-400"
            />
          </div>

          {/* Bank Filter */}
          <div>
            <select
              value={selectedBankId}
              onChange={e => setSelectedBankId(e.target.value)}
              className="w-full py-2 px-3 bg-neutral-50 dark:bg-[#181A20] border border-neutral-300 dark:border-neutral-700 rounded text-neutral-900 dark:text-white font-mono focus:outline-none"
            >
              <option value="ALL">All Synthetic Banks (8)</option>
              {banks.map(b => (
                <option key={b.id} value={b.id}>
                  {b.bank_code} — {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Risk State Filter */}
          <div>
            <select
              value={selectedRiskState}
              onChange={e => setSelectedRiskState(e.target.value)}
              className="w-full py-2 px-3 bg-neutral-50 dark:bg-[#181A20] border border-neutral-300 dark:border-neutral-700 rounded text-neutral-900 dark:text-white font-mono focus:outline-none"
            >
              <option value="ALL">All Risk States</option>
              <option value="SUSPECTED_MULE">Suspected Mule</option>
              <option value="ELEVATED">Elevated Risk</option>
              <option value="NORMAL">Normal</option>
            </select>
          </div>

          {/* Node Density Limit */}
          <div>
            <select
              value={maxNodesToShow}
              onChange={e => setMaxNodesToShow(Number(e.target.value))}
              className="w-full py-2 px-3 bg-neutral-50 dark:bg-[#181A20] border border-neutral-300 dark:border-neutral-700 rounded text-neutral-900 dark:text-white font-mono focus:outline-none"
            >
              <option value={30}>Display 30 Nodes</option>
              <option value={60}>Display 60 Nodes</option>
              <option value={100}>Display 100 Nodes (Large)</option>
            </select>
          </div>
        </div>

        {/* Bank Color Legend Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-[11px] font-mono">
          <span className="text-neutral-400 uppercase tracking-wider text-[10px]">Institutions:</span>
          {Object.entries(BANK_COLORS).filter(([k]) => k !== 'DEFAULT').map(([bCode, color]) => (
            <button
              key={bCode}
              onClick={() => {
                const b = banks.find(x => x.bank_code === bCode);
                setSelectedBankId(selectedBankId === b?.id ? 'ALL' : (b?.id || 'ALL'));
              }}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded border transition-colors ${
                banks.find(x => x.bank_code === bCode)?.id === selectedBankId
                  ? 'border-neutral-900 dark:border-white font-bold bg-neutral-100 dark:bg-neutral-800'
                  : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: color }}></span>
              <span>{bCode}</span>
            </button>
          ))}
          <span className="text-neutral-400 ml-auto flex items-center space-x-3 text-[10px]">
            <span className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-[#E30613] bg-red-100 dark:bg-red-950 inline-block"></span>
              <span>Suspected Mule</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-full border-2 border-purple-500 inline-block"></span>
              <span>Louvain Ring Candidate</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-3 h-0.5 bg-[#0284C7] inline-block"></span>
              <span>Cross-Bank Transfer</span>
            </span>
          </span>
        </div>
      </div>

      {/* Main Canvas & Detail Drawer Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[620px]">
        {/* Canvas */}
        <div className="lg:col-span-3 bg-white dark:bg-[#111215] border border-neutral-200 dark:border-neutral-800 rounded-md relative overflow-hidden flex flex-col">
          {loading && (
            <div className="absolute inset-0 bg-white/70 dark:bg-black/70 flex items-center justify-center z-10 font-mono text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mr-2 text-swiss-red" />
              <span>Simulating multi-bank graph topology...</span>
            </div>
          )}

          <div ref={containerRef} className="flex-1 w-full h-full" />

          {/* Quick Graph Footer Bar */}
          <div className="px-3 py-2 bg-neutral-50 dark:bg-[#14161C] border-t border-neutral-200 dark:border-neutral-800 text-[11px] font-mono text-neutral-500 flex items-center justify-between">
            <div>
              Displaying <span className="font-bold text-neutral-900 dark:text-white">{filteredAccounts.length}</span> accounts &{' '}
              <span className="font-bold text-neutral-900 dark:text-white">{filteredTransactions.length}</span> payment edges.
            </div>
            <div className="text-[10px] text-neutral-400 italic">
              Tap any node or edge to inspect explainable signals and analytics.
            </div>
          </div>
        </div>

        {/* Selected Entity Inspector Drawer */}
        <div className="bg-white dark:bg-[#111215] border border-neutral-200 dark:border-neutral-800 rounded-md p-4 flex flex-col justify-between overflow-y-auto">
          {!selectedEntity ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-neutral-400 font-mono space-y-2">
              <Layers className="w-8 h-8 opacity-40" />
              <div className="text-xs font-bold uppercase tracking-wider text-neutral-500">No Entity Selected</div>
              <p className="text-[11px] max-w-[200px]">
                Click an account node or transaction route on the canvas to inspect institutional metadata, Louvain community, and anomaly scores.
              </p>
            </div>
          ) : selectedEntity.type === 'account' ? (
            <div className="flex-1 flex flex-col justify-between space-y-4">
              <div className="space-y-3 text-xs font-mono">
                <div>
                  <span className="text-neutral-400 text-[10px] uppercase">Account Reference</span>
                  <div className="font-bold text-neutral-900 dark:text-white text-base">
                    {selectedEntity.data.account_ref}
                  </div>
                </div>

                <div>
                  <span className="text-neutral-400 text-[10px] uppercase">Synthetic Institution</span>
                  <div className="font-bold text-neutral-900 dark:text-white">
                    {selectedEntity.data.bank_code} — {selectedEntity.data.bank_name || 'Synthetic Bank'}
                  </div>
                </div>

                <div>
                  <span className="text-neutral-400 text-[10px] uppercase">Simulated Balance</span>
                  <div className="font-bold text-neutral-900 dark:text-white">
                    ₹{(selectedEntity.data.balance_minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div>
                  <span className="text-neutral-400 text-[10px] uppercase">Risk Classification</span>
                  <div className="mt-1">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                        selectedEntity.data.risk_state === 'SUSPECTED_MULE'
                          ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300'
                          : selectedEntity.data.risk_state === 'ELEVATED'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300'
                          : 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 border border-green-300'
                      }`}
                    >
                      {selectedEntity.data.risk_state}
                    </span>
                  </div>
                </div>

                {/* Machine Learning & Graph Analytics Section */}
                <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
                  <span className="text-neutral-400 text-[10px] uppercase font-bold flex items-center space-x-1">
                    <Cpu className="w-3 h-3 text-purple-500" />
                    <span>ML & Topology Signals</span>
                  </span>

                  {accountAnalytics.loading ? (
                    <div className="text-[11px] text-neutral-400 flex items-center space-x-1.5 py-1">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Computing anomaly & community...</span>
                    </div>
                  ) : (
                    <div className="space-y-2 text-[11px] bg-neutral-50 dark:bg-[#181A20] p-2.5 rounded border border-neutral-200 dark:border-neutral-800">
                      {accountAnalytics.community && (
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Louvain Community:</span>
                            <span className="font-bold text-neutral-900 dark:text-white">
                              #{accountAnalytics.community.community_id} (size {accountAnalytics.community.community_size})
                            </span>
                          </div>
                          {accountAnalytics.community.is_mule_cluster_candidate && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.2 bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 rounded text-[10px] font-bold">
                              Candidate Mule Ring ({Math.round(accountAnalytics.community.internal_density * 100)}% internal density)
                            </span>
                          )}
                        </div>
                      )}

                      {accountAnalytics.anomaly && (
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Isolation Forest:</span>
                            <span className={`font-bold ${accountAnalytics.anomaly.is_outlier ? 'text-red-500' : 'text-neutral-900 dark:text-white'}`}>
                              Score {accountAnalytics.anomaly.anomaly_score}/100 {accountAnalytics.anomaly.is_outlier ? '(Outlier)' : ''}
                            </span>
                          </div>
                          {accountAnalytics.anomaly.top_anomalous_features?.length > 0 && (
                            <div className="text-[10px] text-neutral-400 mt-0.5">
                              Key driver: {accountAnalytics.anomaly.top_anomalous_features[0].feature}
                            </div>
                          )}
                        </div>
                      )}

                      {accountAnalytics.graphsage && accountAnalytics.graphsage.status === 'READY' && (
                        <div className="flex items-center justify-between">
                          <span className="text-neutral-500">GraphSAGE 2-Hop:</span>
                          <span className="font-bold text-neutral-900 dark:text-white">
                            {(accountAnalytics.graphsage.mule_probability * 100).toFixed(1)}% prob
                          </span>
                        </div>
                      )}

                      <div className="text-[9px] text-neutral-400 italic pt-1 border-t border-neutral-200 dark:border-neutral-700">
                        Topological outlier measure; non-guilt-claiming simulation indicator.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Button: Launch Deep Lineage Investigation */}
              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  onClick={() =>
                    onNavigateTab('investigation', {
                      root_account_id: selectedEntity.data.id
                    })
                  }
                  className="w-full py-2.5 px-3 bg-[#E30613] hover:bg-[#C00510] text-white text-xs font-bold font-mono uppercase tracking-wider rounded flex items-center justify-center space-x-2 shadow-sm transition-colors"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Launch Investigation</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between space-y-4">
              <div className="space-y-3 text-xs font-mono">
                <div>
                  <span className="text-neutral-400 text-[10px] uppercase">Transaction ID</span>
                  <div className="font-bold text-neutral-900 dark:text-white text-[11px] break-all">
                    {selectedEntity.data.id}
                  </div>
                </div>

                <div>
                  <span className="text-neutral-400 text-[10px] uppercase">Transfer Amount</span>
                  <div className="font-bold text-neutral-900 dark:text-white text-base">
                    ₹{(selectedEntity.data.amount_minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div>
                  <span className="text-neutral-400 text-[10px] uppercase">Route</span>
                  <div className="text-neutral-700 dark:text-neutral-300">
                    {selectedEntity.data.source_account_ref} ({selectedEntity.data.source_bank_code}) →{' '}
                    {selectedEntity.data.destination_account_ref} ({selectedEntity.data.destination_bank_code})
                  </div>
                </div>

                <div>
                  <span className="text-neutral-400 text-[10px] uppercase">Payment Rail & Status</span>
                  <div className="flex items-center space-x-2 mt-0.5">
                    <span className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded font-bold">
                      {selectedEntity.data.rail}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded font-bold ${
                        selectedEntity.data.status === 'POSTED'
                          ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      }`}
                    >
                      {selectedEntity.data.status}
                    </span>
                  </div>
                </div>

                {selectedEntity.data.memo && (
                  <div>
                    <span className="text-neutral-400 text-[10px] uppercase">Memo / Rail Tag</span>
                    <div className="text-neutral-600 dark:text-neutral-400 italic">
                      "{selectedEntity.data.memo}"
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  onClick={() =>
                    onNavigateTab('investigation', {
                      root_account_id: selectedEntity.data.source_account_id
                    })
                  }
                  className="w-full py-2 px-3 border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-bold font-mono rounded flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Trace from Source</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
