import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserPayload } from '../middlewares/authenticate';
import { reportRepo } from '../repositories/reportRepo';
import { moduleRepo } from '../repositories/moduleRepo';
import { tenantRepo } from '../repositories/tenantRepo';
import { AnalyticsFilters, EMPTY_FILTERS, describeScope, resolveFilters, territorySql } from '../services/scope';
import { chosenNames, loadFilterOptions } from '../services/filterOptions';
import { renderExecutiveReport, ExecutiveAnalytics } from '../services/executiveReportPdf';

const TOP_N = 5;

/**
 * Builds the executive analytics for the caller's scope (same bottom-up scoping as /reports):
 * summary, top trainers, most-presented modules, most-viewed modules, and a 28-day trend.
 */
export async function buildExecutiveAnalytics(user: UserPayload, filters: AnalyticsFilters = EMPTY_FILTERS, query: Record<string, unknown> = {}): Promise<ExecutiveAnalytics> {
  const viewScope = territorySql(user, 'v', filters, { withDates: true, userIdColumn: 'user_id' });
  const [{ summary, trainers, modules, daily, window }, viewed, options] = await Promise.all([
    reportRepo.analytics(user, TOP_N, filters),
    moduleRepo.topViewed(viewScope, TOP_N),
    loadFilterOptions(user, query),
  ]);
  const total_sessions = Number(summary.total_sessions);
  const approved = Number(summary.approved);

  const summaryOut = {
    total_sessions,
    total_participants: Number(summary.total_participants),
    avg_participants: Number(summary.avg_participants),
    pending_reviews: Number(summary.pending_reviews ?? 0),
    approval_rate: total_sessions ? Math.round((approved / total_sessions) * 100) : 0,
    active_trainers: Number(summary.active_trainers),
    modules_used: Number(summary.modules_used),
    total_module_views: viewed.reduce((n, m) => n + m.views + m.public_views, 0),
  };

  const top_trainers = trainers.map((t, i) => ({
    rank: i + 1,
    trainer_id: t.trainer_id as string,
    trainer_name: t.trainer_name as string,
    territory_name: t.territory_name as string,
    report_count: Number(t.report_count),
    participants: Number(t.participants),
    approved_count: Number(t.approved_count),
  }));

  const top_modules = modules.map((m, i) => ({
    rank: i + 1,
    module_id: m.module_id as string,
    title: m.title as string,
    category: m.category as string,
    usage_count: Number(m.usage_count),
    participants: Number(m.participants),
    share: total_sessions ? Number(m.usage_count) / total_sessions : 0,
    views: Number(m.view_count),
    public_views: Number(m.public_view_count),
    presentations_total: Number(m.presentation_count),
  }));

  const top_viewed_modules = viewed.map((m, i) => ({ rank: i + 1, ...m }));

  const byDay = new Map(daily.map((d) => [new Date(d.d).toISOString().slice(0, 10), d]));
  const trend = Array.from({ length: window.days }, (_, i) => {
    const date = new Date(Date.parse(window.from) + i * 86_400_000).toISOString().slice(0, 10);
    const row = byDay.get(date);
    return { date, sessions: Number(row?.sessions ?? 0), participants: Number(row?.participants ?? 0) };
  });

  return {
    scope: describeScope(user, filters, chosenNames(options)),
    filters: { ...options, selected: filters },
    period: { from: window.from, to: window.to },
    generated_at: new Date().toISOString(),
    summary: summaryOut, top_trainers, top_modules, top_viewed_modules, trend,
  };
}

// GET /api/analytics/executive
export const getExecutiveDashboardData = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { filters } = resolveFilters(req.user!, req.query as Record<string, unknown>);
    res.json({ success: true, ...(await buildExecutiveAnalytics(req.user!, filters, req.query as Record<string, unknown>)) });
  } catch (err) {
    next(err);
  }
};

// GET /api/analytics/executive/report.pdf  — official downloadable report for the caller's scope
export const downloadExecutiveReport = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user!;
    const { filters } = resolveFilters(user, req.query as Record<string, unknown>);
    const [data, tenant] = await Promise.all([buildExecutiveAnalytics(user, filters, req.query as Record<string, unknown>), tenantRepo.findById(user.tenant_id)]);
    const stamp = new Date().toISOString().slice(0, 10);
    const scopeSlug = data.scope.label.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-eksekutif-${scopeSlug}-${stamp}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    renderExecutiveReport(res, user, tenant?.name ?? 'Platform E-Learning', data);
  } catch (err) {
    next(err);
  }
};

// GET /api/analytics/filters?provinsi_id=  -> options for the executive filter bar, bounded by role
export const getFilterOptions = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, ...(await loadFilterOptions(req.user!, req.query as Record<string, unknown>)) });
  } catch (err) {
    next(err);
  }
};
