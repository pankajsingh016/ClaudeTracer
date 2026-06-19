// Typed client for the FastAPI backend. In dev, Vite proxies /api -> :8000.

export interface Project {
  key: string;
  name: string;
  path: string | null;
  sessions: number;
  cost: number;
  savings: number;
  tokens: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
  last_active: number | null;
  models: string[];
  estimated: boolean;
}

export interface SessionSummary {
  id: string;
  project_key: string;
  project_name: string | null;
  title: string;
  agent_name: string | null;
  is_subagent: boolean;
  branch: string | null;
  started: number | null;
  ended: number | null;
  user_msgs: number;
  assistant_msgs: number;
  tool_uses: number;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
  total_tokens: number;
  cost: number;
  savings: number;
  estimated: boolean;
  models: string[];
  snippet?: string;
}

export interface Analytics {
  totals: {
    cost: number;
    tokens: number;
    savings: number;
    sessions: number;
    busiest_project: string | null;
  };
  cost_over_time: { date: string; cost: number; tokens: number }[];
  heatmap: { day: string; value: number }[];
  stream: Record<string, number | string>[];
  stream_keys: string[];
  by_model: { model: string; cost: number; tokens: number }[];
  by_project: { project: string; key: string; cost: number; tokens: number }[];
  sunburst: SunburstNode;
  treemap: TreeNode;
}

export interface SunburstNode {
  name: string;
  value?: number;
  children?: SunburstNode[];
}
export interface TreeNode {
  name: string;
  value?: number;
  children?: TreeNode[];
}

export interface TranscriptBlock {
  kind: "text" | "thinking" | "tool_use" | "tool_result";
  text?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  is_error?: boolean;
}
export interface TranscriptEvent {
  role: "user" | "assistant";
  ts: string | null;
  model?: string;
  blocks: TranscriptBlock[];
  cost?: number;
  tokens?: number;
}
export interface Transcript {
  session: SessionSummary;
  events: TranscriptEvent[];
}

export interface EnterprisePlan {
  id: string;
  name: string;
  group: string;
  kind: "metered" | "flat";
  factor?: number;
  monthly?: number;
  monthly_annual?: number;
  per_seat?: boolean;
  note: string;
}

export interface Meta {
  claude_dir: string;
  exists: boolean;
  models: Record<string, { input: number; output: number; fast_mode?: boolean }>;
  fast_mode: Record<string, { input: number; output: number }>;
  batch: Record<string, { input: number; output: number }>;
  modifiers: {
    cache_read_mult: number;
    cache_write_5m_mult: number;
    cache_write_1h_mult: number;
    batch_discount: number;
    inference_geo_us_mult: number;
    cloud_regional_mult: number;
    enterprise_discount_mult: number;
    cloud_endpoint: string;
  };
  tools: {
    web_search_per_request: number;
    managed_agent_session_hour: number;
    code_execution_hour: number;
  };
  ccu: { per_usd: number; usd_per_ccu: number };
  enterprise_plans: EnterprisePlan[];
}

const qs = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

export const api = {
  meta: () => get<Meta>("/api/meta"),
  projects: () => get<Project[]>("/api/projects"),
  sessions: (project?: string) =>
    get<SessionSummary[]>(`/api/sessions${qs({ project })}`),
  transcript: (id: string) => get<Transcript>(`/api/sessions/${id}`),
  analytics: (project?: string, model?: string) =>
    get<Analytics>(`/api/analytics${qs({ project, model })}`),
  search: (q: string, project?: string, model?: string) =>
    get<SessionSummary[]>(`/api/search${qs({ q, project, model })}`),
};

// ---- formatting helpers ----
export const fmtUSD = (n: number) =>
  n >= 100 ? `$${n.toFixed(0)}` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`;

// Active cost basis (Cost basis dropdown). All cost displays use fmtCost / applyFactor.
export const costState = {
  factor: 1,
  basisId: "list_api" as string,
  basisLabel: "List API price",
};
export const setCostBasis = (factor: number, basisId: string, basisLabel: string) => {
  costState.factor = factor;
  costState.basisId = basisId;
  costState.basisLabel = basisLabel;
};
/** @deprecated use setCostBasis */
export const setCostFactor = (f: number) => {
  costState.factor = f;
};
export const applyFactor = (n: number) => n * costState.factor;
export const fmtCost = (n: number) => fmtUSD(n * costState.factor);

export const fmtTokens = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B`
  : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M`
  : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K`
  : `${n}`;

export const fmtDate = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

export const fmtDay = (ms: number | null) =>
  ms ? new Date(ms).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

// stable color per model id
const PALETTE = ["#d97757", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#64748b"];
export const modelColor = (model: string) => {
  let h = 0;
  for (let i = 0; i < model.length; i++) h = (h * 31 + model.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

export const shortModel = (m: string) =>
  m.replace("claude-", "").replace(/-\d{8}$/, "").replace("<synthetic>", "local");

/** Snake_case project keys → readable labels for UI. */
export const formatProjectName = (name: string) =>
  name.includes("_") && !name.includes(" ") ? name.replace(/_/g, " ") : name;
