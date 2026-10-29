import {
  Bank,
  Account,
  AccountDetail,
  Transaction,
  TransactionCreatePayload,
  DetectionAlert,
  DetectionAlertDetail,
  InvestigationDetail,
  ScenarioMeta,
  EvaluationComparison,
  AppSettings
} from '../types/api';

const BASE_URL = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMsg = `HTTP Error ${res.status}: ${res.statusText}`;
    try {
      const errorData = await res.json();
      errorMsg = errorData.message || errorData.error || errorMsg;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }
  return res.json();
}

export const api = {
  // Health
  getHealth: () => fetch(`${BASE_URL}/health`).then(handleResponse<{
    status: string;
    version: string;
    environment: string;
    metrics: { banks: number; accounts: number; transactions: number; alerts: number };
  }>),

  // Banks & Accounts
  getBanks: () => fetch(`${BASE_URL}/banks`).then(handleResponse<Bank[]>),
  getAccounts: (params?: { query?: string; bank_id?: string; risk_state?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.query) q.set('query', params.query);
    if (params?.bank_id) q.set('bank_id', params.bank_id);
    if (params?.risk_state) q.set('risk_state', params.risk_state);
    if (params?.limit) q.set('limit', params.limit.toString());
    return fetch(`${BASE_URL}/accounts?${q.toString()}`).then(handleResponse<Account[]>);
  },
  getAccountDetail: (id: string) => fetch(`${BASE_URL}/accounts/${id}`).then(handleResponse<AccountDetail>),

  // Transactions
  postTransaction: (payload: TransactionCreatePayload) =>
    fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handleResponse<Transaction>),
  getTransactions: (params?: { account_id?: string; scenario_id?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.account_id) q.set('account_id', params.account_id);
    if (params?.scenario_id) q.set('scenario_id', params.scenario_id);
    if (params?.limit) q.set('limit', params.limit.toString());
    return fetch(`${BASE_URL}/transactions?${q.toString()}`).then(handleResponse<Transaction[]>);
  },

  // Alerts
  getAlerts: (params?: { status?: string; severity?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.severity) q.set('severity', params.severity);
    if (params?.limit) q.set('limit', params.limit.toString());
    return fetch(`${BASE_URL}/alerts?${q.toString()}`).then(handleResponse<DetectionAlert[]>);
  },
  getAlertDetail: (id: string) => fetch(`${BASE_URL}/alerts/${id}`).then(handleResponse<DetectionAlertDetail>),
  updateAlertStatus: (id: string, status: string, rationale?: string) =>
    fetch(`${BASE_URL}/alerts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, rationale }),
    }).then(handleResponse<DetectionAlert>),

  // Investigations
  createInvestigation: (payload: { root_account_id: string; alert_id?: string; lookback_hours?: number; lookahead_hours?: number }) =>
    fetch(`${BASE_URL}/investigations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handleResponse<InvestigationDetail>),
  getInvestigationDetail: (id: string) => fetch(`${BASE_URL}/investigations/${id}`).then(handleResponse<InvestigationDetail>),
  retraceInvestigation: (id: string, params?: { lookback_hours?: number; lookahead_hours?: number; max_hops?: number }) => {
    const q = new URLSearchParams();
    if (params?.lookback_hours) q.set('lookback_hours', params.lookback_hours.toString());
    if (params?.lookahead_hours) q.set('lookahead_hours', params.lookahead_hours.toString());
    if (params?.max_hops) q.set('max_hops', params.max_hops.toString());
    return fetch(`${BASE_URL}/investigations/${id}/trace?${q.toString()}`, { method: 'POST' }).then(handleResponse<InvestigationDetail>);
  },
  getExportUrl: (id: string, format: 'html' | 'json' = 'html') => `${BASE_URL}/investigations/${id}/export?format=${format}`,

  // Scenarios & Simulation
  getScenarios: () => fetch(`${BASE_URL}/scenarios`).then(handleResponse<ScenarioMeta[]>),
  runScenario: (id: string, seed?: number) =>
    fetch(`${BASE_URL}/scenarios/${id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed }),
    }).then(handleResponse<{ scenario_id: string; transactions_count: number; alerts_generated: number; root_account_id?: string }>),
  resetSimulation: () => fetch(`${BASE_URL}/simulation/reset`, { method: 'POST' }).then(handleResponse<{ status: string; message: string }>),
  pauseSimulation: () => fetch(`${BASE_URL}/simulation/pause`, { method: 'POST' }).then(handleResponse<{ status: string }>),

  // Evaluations
  runEvaluation: (payload?: { scenario_ids?: string[]; seeds?: number[] }) =>
    fetch(`${BASE_URL}/evaluations/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }).then(handleResponse<EvaluationComparison>),

  // Settings
  getSettings: () => fetch(`${BASE_URL}/settings`).then(handleResponse<AppSettings>),
  updateSettings: (payload: Partial<AppSettings>) =>
    fetch(`${BASE_URL}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(handleResponse<AppSettings>),

  // Events SSE URL
  getEventsStreamUrl: () => `${BASE_URL}/events/stream`,

  // Graph Analytics & Anomaly Detection (Ported from Project A)
  getGraphCommunities: (resolution?: number) => {
    const q = new URLSearchParams();
    if (resolution) q.set('resolution', resolution.toString());
    return fetch(`${BASE_URL}/analytics/communities?${q.toString()}`).then(handleResponse<{
      status: string;
      modularity: number;
      total_communities: number;
      communities: Array<{
        community_id: number;
        member_count: number;
        member_account_ids: string[];
        distinct_banks: string[];
        internal_density: number;
        is_mule_cluster_candidate: boolean;
        modularity: number;
      }>;
      disclaimer: string;
    }>);
  },
  getAccountCommunity: (id: string) => fetch(`${BASE_URL}/analytics/account/${id}/community`).then(handleResponse<{
    account_id: string;
    account_ref: string;
    analysis: {
      community_id: number;
      community_size: number;
      modularity: number;
      internal_density: number;
      is_mule_cluster_candidate: boolean;
      community_risk_score: number;
      disclaimer: string;
    };
  }>),
  getAccountAnomaly: (id: string) => fetch(`${BASE_URL}/analytics/account/${id}/anomaly`).then(handleResponse<{
    account_id: string;
    features: Record<string, number>;
    anomaly_result: {
      status: string;
      raw_decision_score: number;
      anomaly_score: number;
      is_outlier: boolean;
      top_anomalous_features: Array<{ feature: string; impact: number; value: number }>;
      disclaimer: string;
    };
  }>),
  getAccountGraphSAGE: (id: string) => fetch(`${BASE_URL}/analytics/account/${id}/graphsage`).then(handleResponse<{
    account_id: string;
    account_ref: string;
    graphsage_result: {
      status: string;
      mule_probability: number;
      graphsage_risk_score: number;
      disclaimer: string;
    };
  }>),

  // Federated Multi-Bank Learning & Privacy
  getFederatedPrivacy: () => fetch(`${BASE_URL}/federated/privacy`).then(handleResponse<{
    title: string;
    version: string;
    local_private_data: string[];
    transmitted_artifacts: string[];
    privacy_preserving_mechanisms: string[];
    remaining_threat_models: string[];
    compliance_note: string;
  }>),
  getFederatedStatus: () => fetch(`${BASE_URL}/federated/status`).then(handleResponse<{
    current_round: number;
    registered_banks: Array<{ bank_id: string; bank_name: string; training_samples: number }>;
    total_rounds_executed: number;
    latest_round_summary: any;
  }>),
  trainFederated: (payload?: {
    num_rounds?: number;
    epochs_per_client?: number;
    learning_rate?: number;
    dp_clip_norm?: number;
    dp_noise_sigma?: number;
  }) => fetch(`${BASE_URL}/federated/train`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || { num_rounds: 5, epochs_per_client: 2, learning_rate: 0.02, dp_clip_norm: 1.0, dp_noise_sigma: 0.005 }),
  }).then(handleResponse<{
    status: string;
    total_rounds: number;
    rounds_history: any[];
    final_metrics: { accuracy: number; precision: number; recall: number; f1: number };
    per_bank_metrics: Record<string, any>;
  }>),
  compareFederated: (rounds: number = 5) => fetch(`${BASE_URL}/federated/compare?rounds=${rounds}`, {
    method: 'POST',
  }).then(handleResponse<{
    evaluation_title: string;
    participating_banks_count: number;
    federated_results: { rounds: number; metrics: any; privacy_guarantee: string };
    centralized_results: { epochs: number; metrics: any; privacy_guarantee: string };
    comparison_delta: { f1_difference: number; precision_difference: number; recall_difference: number; utility_retention_pct: number };
  }>),
};
