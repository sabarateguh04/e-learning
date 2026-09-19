// Shared API contracts — mirror backend/src/repositories/* & controllers.
import type { UserScope } from '../store/authStore';
import type { MenuKey, RoleLevel } from '../lib/roles';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type AccountStatus = 'PENDING' | 'ACTIVE' | 'REJECTED';

export interface ModuleAttachment {
  id: string;
  title: string;
  pdf_url: string;
  pages: number;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  answer_index: number;
}

export interface QuizData {
  pass_score: number;
  time_limit_minutes: number;
  questions: QuizQuestion[];
}

export interface ModuleMetrics {
  views: number;
  presentations: number;
  public_views: number;
}

export interface LearningModule {
  id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  /** Institution of the author (falls back to tenant name). */
  instansi_name: string | null;
  author_id: string | null;
  author_name: string | null;
  approval_status: ApprovalStatus;
  created_at: string;
  title: string;
  description: string;
  content_text: string | null;
  quiz: QuizData | null;
  metrics: ModuleMetrics;
  video_url: string | null;
  pdf_url: string | null;
  thumbnail_url: string | null;
  target_audience: string;
  category: string;
  duration_minutes: number;
  instructor_name: string;
  attachments: ModuleAttachment[];
  has_quiz: boolean;
  published_at: string;
}

export interface ModulesResponse {
  success: boolean;
  total: number;
  audiences: readonly string[];
  data: LearningModule[];
}

export interface ModuleResponse {
  success: boolean;
  data: LearningModule;
}

/** Target audiens lap kegiatan (jenjang pendidikan). */
export const AUDIENCE_CATEGORIES = ['TK/SD', 'SMP', 'SMA/SMK', 'Mahasiswa', 'Umum'] as const;
export const REPORT_PHOTO_MIN = 2;
export const REPORT_PHOTO_MAX = 4;

export type AudienceCategory = (typeof AUDIENCE_CATEGORIES)[number];
export type ReportStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface FieldReport {
  id: string;
  tenant_id: string;
  trainer_id: string;
  trainer_name: string;
  module_id: string;
  module_title: string;
  provinsi_id: number | null;
  kota_id: number | null;
  provinsi_name: string | null;
  kota_name: string | null;
  territory_name: string;
  location_name: string;
  /** Tanggal pelaksanaan (YYYY-MM-DD) */
  report_date: string;
  audience_category: AudienceCategory;
  audience: AudienceCategory;
  participant_count: number;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  photo_url: string | null;
  /** 2-4 foto bukti kegiatan */
  photo_urls: string[];
  status: ReportStatus;
  created_at: string;
  /* ── Hierarchical approval ── */
  approver_role_level: number | null;
  /** e.g. "Eksekutif Kota · Kota Depok" — the position expected to approve */
  approver_label: string;
  reviewed_by: string | null;
  reviewed_by_role: number | null;
  reviewer_name: string | null;
  reviewer_role_label: string | null;
  review_path: 'DIRECT_SUPERVISOR' | 'SUPER_ADMIN_OVERRIDE' | null;
  review_note: string | null;
  reviewed_at: string | null;
  /** True when the current user is the direct supervisor (or Super Admin) and the report is still pending */
  can_review: boolean;
  review_block_reason: string | null;
}

export interface SubmitReportPayload {
  module_id: string;
  location_name: string;
  report_date: string;
  audience: AudienceCategory | '';
  participant_count: number | '';
  latitude: number | null;
  longitude: number | null;
  /** base64 data URLs, 2-4 items */
  photos: string[];
  notes: string;
}

export interface ReportsResponse {
  success: boolean;
  total: number;
  scope: UserScope;
  categories: readonly AudienceCategory[];
  data: FieldReport[];
}

export interface SubmitReportResponse {
  success: boolean;
  message: string;
  data: FieldReport;
}

export interface ApiValidationError {
  error: string;
  message: string;
  errors?: Record<string, string>;
}

// ── Analytics ────────────────────────────────────────────────────────────────
export interface AnalyticsSummary {
  total_sessions: number;
  total_participants: number;
  avg_participants: number;
  pending_reviews: number;
  approval_rate: number;
  active_trainers: number;
  modules_used: number;
  total_module_views: number;
}

export interface TrainerStat {
  rank: number;
  trainer_id: string;
  trainer_name: string;
  territory_name: string;
  report_count: number;
  participants: number;
  approved_count: number;
}

export interface ModuleStat {
  rank: number;
  module_id: string;
  title: string;
  category: string;
  usage_count: number;
  participants: number;
  share: number;
  views: number;
  public_views: number;
  presentations_total: number;
}

export interface DailyPoint {
  date: string;
  sessions: number;
  participants: number;
}

export interface ViewedModuleStat {
  rank: number;
  module_id: string;
  title: string;
  target_audience: string;
  views: number;
  public_views: number;
  presentations: number;
}

export interface FilterOption { id: number | string; nama: string }
export interface AnalyticsFiltersSelected { provinsi_id: number | null; kota_id: number | null; instansi_id: string | null; satker_id: string | null; from: string | null; to: string | null }
export interface FilterOptionsResponse {
  success?: boolean;
  locked: { provinsi: boolean; kota: boolean; instansi: boolean; satker: boolean };
  selected: AnalyticsFiltersSelected;
  provinsi: FilterOption[];
  kota: FilterOption[];
  instansi: FilterOption[];
  satker: FilterOption[];
  names: { provinsi: string | null; kota: string | null; instansi: string | null; satker: string | null };
}

export interface ExecutiveDashboardResponse {
  success: boolean;
  scope: UserScope;
  filters: FilterOptionsResponse;
  period: { from: string; to: string };
  generated_at: string;
  summary: AnalyticsSummary;
  top_trainers: TrainerStat[];
  top_modules: ModuleStat[];
  top_viewed_modules: ViewedModuleStat[];
  trend: DailyPoint[];
}

// ── Admin ────────────────────────────────────────────────────────────────────
export interface AdminUser {
  id: string;
  tenant_id: string;
  tenant_name: string;
  username: string;
  employee_id: string;
  full_name: string;
  email: string | null;
  role_level: RoleLevel;
  role_label: string;
  account_status: AccountStatus;
  profile_photo_url: string | null;
  must_change_password: boolean;
  password_changed_at: string | null;
  provinsi_id: number | null;
  kota_id: number | null;
  provinsi_name: string | null;
  kota_name: string | null;
  legacy_ids: { instansi: string | null; organisasi: string | null; satker: string | null; sub_org: string | null };
  legacy: { instansi: string | null; organisasi: string | null; satker: string | null; sub_org: string | null };
  created_at: string;
  approved_at: string | null;
}

export interface AdminOverview {
  success: boolean;
  users: Record<AccountStatus, number>;
  modules: Record<ApprovalStatus, number>;
  tenants: number;
}

export interface MenuMeta {
  key: MenuKey;
  label: string;
  description: string;
  locked?: number[];
}

export type MenuMatrix = Record<MenuKey, Record<string, boolean>>;

export interface MenuAccessResponse {
  success: boolean;
  roles: Array<{ level: RoleLevel; label: string }>;
  menus: MenuMeta[];
  matrix: MenuMatrix;
}

/* ── Executive report (GET /api/reports/executive) ─────────────────────────── */
export type BreakdownLevel = 'provinsi' | 'kota' | 'trainer';

export interface ExecutiveReportSummary {
  total_sessions: number; total_participants: number; avg_participants: number;
  pending_reviews: number; approved: number; rejected: number; approval_rate: number;
  active_trainers: number; total_trainers: number; pending_accounts: number; modules_used: number; cities_covered: number;
  modules_available: number; modules_uploaded: number;
  total_views: number; internal_views: number; public_views: number; presentations: number; unique_viewers: number; modules_accessed: number; views_7d: number;
}
export interface ReportModuleStat {
  rank: number; module_id: string; title: string; target_audience: string; category: string;
  views: number; internal_views: number; public_views: number; presentations: number; unique_viewers: number; sessions: number; last_viewed_at: string | null;
}
export interface ReportTrainerStat {
  rank: number; trainer_id: string; trainer_name: string; employee_id: string; instansi_name: string; organisasi_name: string; territory_name: string;
  report_count: number; participants: number; approved_count: number; modules_uploaded: number; modules_read: number; activity_score: number; last_activity_at: string | null;
}
export interface ReportActivity {
  id: string; created_at: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; trainer_name: string; instansi_name: string; organisasi_name: string; territory_name: string;
  module_id: string; module_title: string; module_read: boolean; location_name: string; audience_category: string; participant_count: number;
}
export interface ReportBreakdownRow {
  id: string | number; name: string; hint: string; trainers: number; sessions: number; participants: number; approved: number; views: number; modules_read: number;
}
export interface ReportTrendPoint { date: string; sessions: number; participants: number; views: number }
export interface ExecutiveReportResponse {
  success: boolean;
  scope: UserScope;
  filters: FilterOptionsResponse;
  breakdown_level: BreakdownLevel;
  generated_at: string;
  period: { from: string; to: string };
  summary: ExecutiveReportSummary;
  top_modules: ReportModuleStat[];
  top_trainers: ReportTrainerStat[];
  activities: ReportActivity[];
  breakdown: ReportBreakdownRow[];
  audience_mix: Array<{ audience_category: string; sessions: number; participants: number }>;
  trend: ReportTrendPoint[];
}

export interface AppNotification {
  id: string;
  type: 'REPORT_SUBMITTED' | 'REPORT_DECIDED';
  title: string;
  body: string;
  link: string | null;
  report_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface TenantOption {
  id: string;
  name: string;
  subdomain?: string;
  instansi_name: string | null;
}

export interface RegisterOptions {
  success: boolean;
  roles: Array<{ level: RoleLevel; label: string }>;
  tenants: TenantOption[];
  provinsi: Array<{ id: number; nama: string; kode: string | null }>;
  kota: Array<{ id: number; provinsi_id: number; nama: string; kode: string | null }>;
  legacy: Record<'instansi' | 'organisasi' | 'satker' | 'sub_org', Array<{ id: string; nama: string; parent_id: string | null }>>;
}

export interface ListResponse<T> {
  success: boolean;
  total: number;
  data: T[];
}

// ── Profile ──────────────────────────────────────────────────────────────────
export interface Profile {
  id: string;
  username: string;
  employee_id: string;
  full_name: string;
  email: string | null;
  role_level: RoleLevel;
  role_label: string;
  account_status: AccountStatus;
  profile_photo_url: string | null;
  tenant: { id: string; name: string };
  wilayah: { provinsi_id: number | null; provinsi_name: string | null; kota_id: number | null; kota_name: string | null; level: 'NATIONAL' | 'PROVINCE' | 'CITY' };
  instansi: {
    legacy_instansi_id: string | null;
    legacy_org_id: string | null;
    legacy_satker_id: string | null;
    legacy_sub_org_id: string | null;
    instansi_name: string | null;
    organisasi_name: string | null;
    satker_name: string | null;
    sub_org_name: string | null;
  };
  created_at: string;
  approved_at: string | null;
  last_login_at: string | null;
}

// ── Master data ──────────────────────────────────────────────────────────────
export interface ProvinsiRecord {
  id: number;
  nama: string;
  kode: string | null;
  kota_count: number;
  user_count: number;
}

export interface KotaRecord {
  id: number;
  provinsi_id: number;
  provinsi_nama: string;
  nama: string;
  kode: string | null;
  user_count: number;
}

export interface LegacyRecord {
  id: string;
  nama: string;
  parent_id: string | null;
  parent_nama: string | null;
  user_count: number;
  child_count: number;
}

// ── Authoring ────────────────────────────────────────────────────────────────
export interface ModuleOptions {
  success: boolean;
  audiences: string[];
  categories: string[];
}

export interface CreateModulePayload {
  title: string;
  description: string;
  category: string;
  target_audience: string;
  content_text: string;
  video_url: string;
  pdf_url: string;
  duration_minutes: number;
  quiz: QuizData | null;
}
