import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ── Types ─────────────────────────────────

export interface WorkspaceMeta {
  path: string;
  repo_name: string;
  branch: string;
  file_count: number;
  last_analysis_at: number | null;
}

export interface ComponentScore {
  raw_score: number;
  weight: number;
  contribution: number;
  details: string[];
}

export interface ScoreComponents {
  [key: string]: ComponentScore;
  churn_rate: ComponentScore;
  code_smell_density: ComponentScore;
  coupling_index: ComponentScore;
  change_coupling: ComponentScore;
  test_coverage_gap: ComponentScore;
  knowledge_concentration: ComponentScore;
  cyclomatic_complexity: ComponentScore;
  decision_staleness: ComponentScore;
}

export interface FileScore {
  path: string;
  relative_path: string;
  composite_score: number;
  components: ScoreComponents;
  loc: number;
  language: string;
  last_modified: number;
  supervision_status: "none" | "acceptable" | "regressed";
}

export interface HeatmapNode {
  name: string;
  path: string;
  score: number | null;
  loc: number | null;
  children: HeatmapNode[] | null;
}

export interface FileBreakdown {
  path: string;
  composite_score: number;
  components: ComponentDetail[];
}

export interface ComponentDetail {
  name: string;
  raw_score: number;
  weight: number;
  contribution: number;
  details: string[];
}

export interface AnalysisResult {
  workspace_score: number;
  file_count: number;
  high_debt_count: number;
  files: FileScore[];
  duration_ms: number;
}

export interface AnalysisProgress {
  current: number;
  total: number;
  current_file: string;
}

export interface DebtSnapshot {
  id: number;
  timestamp: number;
  composite_score: number;
  file_count: number;
  high_debt_count: number;
  commit_count_week: number;
  snapshot_metadata: string | null;
}

export interface RegisterItem {
  id: string;
  created_at: number;
  updated_at: number;
  title: string;
  description: string;
  file_path: string | null;
  severity: "low" | "medium" | "high" | "critical";
  item_type: string;
  owner: string | null;
  target_sprint: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  status: "open" | "in_progress" | "resolved" | "deferred" | "accepted";
  tags: string[];
  linked_commit: string | null;
  notes: string | null;
}

export interface DebtBudget {
  id: string;
  pattern: string;
  label: string;
  max_score: number;
  created_at: number;
  notify_on_breach: boolean;
}

export interface FileChangedEvent {
  path: string;
  event_type: string;
}

export interface GitAnalysisData {
  churn: Record<string, number>;
  blame_summary: Record<string, [string, number][]>;
  co_changes: [string, string, number][];
  commit_count: number;
  author_count: number;
}

export interface AppSettings {
  schema_version: number;
  gitHistoryDays: number;
  churnNormalizationPercentile: number;
  weights: Record<string, number>;
  warningThreshold: number;
  criticalThreshold: number;
  busFactor: number;
  colorScheme: "default" | "heatwave" | "monochrome";
  nodeLabel: "always" | "hover" | "never";
  animationsEnabled: boolean;
  snapshotSchedule: "weekly" | "biweekly" | "manual";
  snapshotRetention: number;
  notificationsEnabled: boolean;
}

// ── Commands (Frontend → Backend) ──────────

export async function openWorkspace(path: string): Promise<WorkspaceMeta> {
  return invoke<WorkspaceMeta>("open_workspace", { path });
}

export async function runGitAnalysis(workspacePath: string, historyDays: number): Promise<GitAnalysisData> {
  return invoke<GitAnalysisData>("run_git_analysis", { workspacePath, historyDays });
}

export async function runFullAnalysis(
  workspacePath: string,
): Promise<AnalysisResult> {
  return invoke<AnalysisResult>("run_full_analysis", { workspacePath });
}

export async function getHeatmapData(): Promise<HeatmapNode> {
  return invoke<HeatmapNode>("get_heatmap_data");
}

/** Single-file incremental re-analysis (used by FileWatcher) */
export async function reanalyzeFile(
  workspacePath: string,
  filePath: string,
): Promise<FileScore> {
  return invoke<FileScore>("reanalyze_file", { workspacePath, filePath });
}

export async function getFileBreakdown(path: string): Promise<FileBreakdown> {
  return invoke<FileBreakdown>("get_file_breakdown", { path });
}

export async function takeSnapshot(
  workspacePath: string,
  compositeScore: number,
  fileCount: number,
  highDebtCount: number,
  commitCountWeek: number,
  metadataJson?: string,
): Promise<DebtSnapshot> {
  return invoke<DebtSnapshot>("take_snapshot", {
    workspacePath,
    compositeScore,
    fileCount,
    highDebtCount,
    commitCountWeek,
    metadataJson,
  });
}

export async function getDebtSnapshots(
  workspacePath: string,
): Promise<DebtSnapshot[]> {
  return invoke<DebtSnapshot[]>("get_debt_snapshots", { workspacePath });
}

export async function registerCrud(
  workspacePath: string,
  operation: string,
  item?: RegisterItem,
  id?: string,
): Promise<unknown> {
  return invoke("register_crud", { workspacePath, operation, item, id });
}

export async function budgetCrud(
  workspacePath: string,
  operation: string,
  item?: DebtBudget,
  id?: string,
): Promise<unknown> {
  return invoke("budget_crud", { workspacePath, operation, item, id });
}

export async function startFileWatcher(workspacePath: string): Promise<void> {
  return invoke("start_file_watcher", { workspacePath });
}

export interface CouplingPair {
  file_a: string;
  file_b: string;
  coupling_ratio: number;
  co_change_count: number;
  has_import_link: boolean;
}

export async function getChangeCouplings(
  workspacePath: string,
  threshold?: number,
): Promise<CouplingPair[]> {
  return invoke<CouplingPair[]>("get_change_couplings", { workspacePath, threshold });
}

export async function watchlistCrud(
  workspacePath: string,
  operation: string,
  filePath?: string,
): Promise<unknown> {
  return invoke("watchlist_crud", { workspacePath, operation, filePath });
}

export async function getSettings(workspacePath: string): Promise<AppSettings> {
  return invoke<AppSettings>("get_settings", { workspacePath });
}

export async function saveSettings(
  workspacePath: string,
  settings: Partial<AppSettings>,
): Promise<AppSettings> {
  return invoke<AppSettings>("save_settings", { workspacePath, settings });
}

// ── Events (Backend → Frontend) ────────────

export function onAnalysisProgress(
  callback: (progress: AnalysisProgress) => void,
): Promise<UnlistenFn> {
  return listen<AnalysisProgress>("analysis_progress", (event) =>
    callback(event.payload),
  );
}

export function onFileChanged(
  callback: (event: FileChangedEvent) => void,
): Promise<UnlistenFn> {
  return listen<FileChangedEvent>("file_changed", (event) =>
    callback(event.payload),
  );
}
