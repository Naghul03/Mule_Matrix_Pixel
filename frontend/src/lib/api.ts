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
};
