import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { ROLE } from '../middlewares/rbacGuard';
import { moduleRepo, QuizData, QuizQuestion } from '../repositories/moduleRepo';
import { PRIMARY_TENANT } from '../database/migrate';

export type { LearningModule, ModuleAttachment, QuizData, QuizQuestion } from '../repositories/moduleRepo';

/** Education levels a module is designed for — mirrors the ENUM on tbl_elearning_modules.target_audience. */
export const TARGET_AUDIENCES = ['TK/SD', 'MTS/SMP', 'SMA/SMK', 'Mahasiswa', 'Umum'] as const;
export type TargetAudience = (typeof TARGET_AUDIENCES)[number];
const isAudience = (v: unknown): v is TargetAudience => typeof v === 'string' && (TARGET_AUDIENCES as readonly string[]).includes(v);
const CATEGORIES = ['Compliance', 'Operations', 'Facilitation', 'Leadership', 'Soft Skills', 'Digital Skills', 'Community', 'General'];

// GET /api/modules?audience=Trainers&q=safety
// Modules are global: every APPROVED module is visible to all authenticated users.
export const getAllModules = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const audience = typeof req.query.audience === 'string' ? req.query.audience : null;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

    const all = await moduleRepo.listVisible(req.user!);
    let modules = all;
    if (audience) modules = modules.filter((m) => m.target_audience === audience);
    if (q) modules = modules.filter((m) => `${m.title} ${m.description} ${m.category}`.toLowerCase().includes(q));

    res.json({ success: true, total: modules.length, audiences: TARGET_AUDIENCES, data: modules });
  } catch (err) {
    next(err);
  }
};

// GET /api/modules/mine  — author's own submissions in any state
export const getMyModules = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await moduleRepo.listByAuthor(req.user!.id);
    res.json({ success: true, total: data.length, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/modules/options — dropdown data for the authoring wizard
export const getModuleOptions = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.json({ success: true, audiences: TARGET_AUDIENCES, categories: CATEGORIES });
};

// GET /api/modules/:id
export const getModuleById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    let module = await moduleRepo.findVisibleById(req.user!, id);
    // Authors may preview their own pending/rejected modules.
    if (!module) {
      const own = await moduleRepo.findById(id);
      if (own && own.author_id === req.user!.id) module = own;
    }
    if (!module) {
      res.status(404).json({ error: 'Not Found', message: `Module "${id}" is not available for this tenant` });
      return;
    }
    res.json({ success: true, data: module });
  } catch (err) {
    next(err);
  }
};

// POST /api/modules/:id/view  — authenticated view metric
export const trackView = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!(await moduleRepo.findVisibleById(req.user!, id))) {
      res.status(404).json({ error: 'Not Found', message: 'Module not found' });
      return;
    }
    await moduleRepo.increment(id, 'view_count');
    await moduleRepo.logView({ tenant_id: req.tenantId!, module_id: id, kind: 'VIEW', user: req.user });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

// GET /api/public/modules  — public catalogue of APPROVED modules (no auth, no counters touched)
// Optional ?instansi_id=&audience= (both validated: id = master-data slug, audience = enum).
export const listPublicModules = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const instansi_id = typeof req.query.instansi_id === 'string' && /^[\w.-]{1,50}$/.test(req.query.instansi_id) ? req.query.instansi_id : null;
    const audience = typeof req.query.audience === 'string' && (TARGET_AUDIENCES as readonly string[]).includes(req.query.audience) ? req.query.audience : null;
    const [modules, instansi] = await Promise.all([moduleRepo.listPublic({ instansi_id, audience }), moduleRepo.publicInstansi()]);
    // Never leak quiz answers or authoring internals to anonymous visitors.
    const data = modules.map(({ quiz, ...m }) => ({ ...m, has_quiz: Boolean(quiz), quiz: null }));
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ success: true, total: data.length, instansi, filters: { instansi_id, audience }, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/public/modules/:id  — unauthenticated share link; counts a public view
export const getPublicModule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const module = await moduleRepo.findById(req.params.id as string);
    if (!module || module.approval_status !== 'APPROVED') {
      res.status(404).json({ error: 'Not Found', message: 'Module not found' });
      return;
    }
    await moduleRepo.increment(module.id, 'public_view_count');
    await moduleRepo.logView({ tenant_id: module.tenant_id ?? PRIMARY_TENANT.id, module_id: module.id, kind: 'PUBLIC', user: null });
    // Strip answers before exposing the quiz publicly.
    const quiz = module.quiz ? { ...module.quiz, questions: module.quiz.questions.map(({ answer_index: _a, ...q }) => q) } : null;
    res.json({ success: true, data: { ...module, quiz } });
  } catch (err) {
    next(err);
  }
};

// ── Authoring ─────────────────────────────────────────────────────────────────
const validateQuiz = (raw: unknown, errors: Record<string, string>): QuizData | null => {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'object') {
    errors.quiz = 'Quiz must be an object';
    return null;
  }
  const q = raw as Partial<QuizData>;
  const questions = Array.isArray(q.questions) ? q.questions : [];
  if (questions.length === 0) return null; // empty builder = no quiz

  const clean: QuizQuestion[] = [];
  questions.forEach((item, i) => {
    const question = typeof item?.question === 'string' ? item.question.trim() : '';
    const options = Array.isArray(item?.options) ? item.options.map((o) => String(o ?? '').trim()).filter(Boolean) : [];
    const answer_index = Number(item?.answer_index);
    if (!question) errors[`quiz.questions.${i}.question`] = `Question ${i + 1} text is required`;
    if (options.length < 2) errors[`quiz.questions.${i}.options`] = `Question ${i + 1} needs at least 2 options`;
    if (!Number.isInteger(answer_index) || answer_index < 0 || answer_index >= options.length) errors[`quiz.questions.${i}.answer_index`] = `Question ${i + 1} needs a valid correct answer`;
    clean.push({ id: typeof item?.id === 'string' && item.id ? item.id : `q${i + 1}`, question, options, answer_index });
  });

  const pass_score = Number(q.pass_score ?? 70);
  const time_limit_minutes = Number(q.time_limit_minutes ?? 15);
  if (!(pass_score >= 1 && pass_score <= 100)) errors['quiz.pass_score'] = 'Pass score must be 1-100';
  if (!(time_limit_minutes >= 1 && time_limit_minutes <= 240)) errors['quiz.time_limit_minutes'] = 'Time limit must be 1-240 minutes';

  return { pass_score, time_limit_minutes, questions: clean };
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const optionalUrl = (v: unknown, field: string, errors: Record<string, string>) => {
  const s = str(v);
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) errors[field] = 'Must be an http(s) URL';
  return s;
};

/** Shared validation for create/update. */
const parseModuleBody = (b: Record<string, unknown>) => {
  const errors: Record<string, string> = {};
  const title = str(b.title);
  const description = str(b.description) || null;
  const content_text = str(b.content_text) || null;
  const category = str(b.category) || 'General';
  const target_audience = str(b.target_audience) || 'Umum';
  const video_url = optionalUrl(b.video_url, 'video_url', errors);
  const pdf_url = optionalUrl(b.pdf_url, 'pdf_url', errors);
  const duration_minutes = Number(b.duration_minutes ?? 0);
  const quiz = validateQuiz(b.quiz, errors);

  if (title.length < 4) errors.title = 'Title must be at least 4 characters';
  if (!isAudience(target_audience)) errors.target_audience = `Target audience must be one of: ${TARGET_AUDIENCES.join(', ')}`;
  if (!content_text && !video_url && !pdf_url) errors.content = 'Add lesson text, a video URL or a PDF URL';
  if (!(Number.isInteger(duration_minutes) && duration_minutes >= 0 && duration_minutes <= 600)) errors.duration_minutes = 'Duration must be 0-600 minutes';

  return { errors, value: { title, description, content_text, category, target_audience: target_audience as TargetAudience, video_url, pdf_url, duration_minutes, quiz } };
};

// POST /api/modules  (Trainer & Super Admin) — Trainer submissions are PENDING until approved
export const createModule = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user!;
    const { errors, value } = parseModuleBody(req.body ?? {});
    if (Object.keys(errors).length) {
      res.status(422).json({ error: 'Unprocessable Entity', message: 'Validation failed', errors });
      return;
    }
    const { title, description, content_text, category, target_audience, video_url, pdf_url, duration_minutes, quiz } = value;

    const module = await moduleRepo.create({
      id: randomUUID(),
      tenant_id: req.tenantId!,
      created_by: user.id,
      author_id: user.id,
      title,
      description,
      content_text,
      quiz,
      category,
      target_audience,
      instructor_name: user.full_name,
      video_url,
      pdf_url,
      duration_minutes,
      approval_status: user.role_level === ROLE.SUPER_ADMIN ? 'APPROVED' : 'PENDING',
    });

    res.status(201).json({
      success: true,
      message: module.approval_status === 'APPROVED' ? 'Module published' : 'Module submitted and awaiting Super Admin approval',
      data: module,
    });
  } catch (err) {
    next(err);
  }
};

// PUT /api/modules/:id  — author or Super Admin. A trainer's edit goes back to PENDING review.
export const updateModule = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user!;
    const id = req.params.id as string;
    const existing = await moduleRepo.findById(id);
    if (!existing) {
      res.status(404).json({ error: 'Not Found', message: 'Module not found' });
      return;
    }
    const isAdmin = user.role_level === ROLE.SUPER_ADMIN;
    if (!isAdmin && existing.author_id !== user.id) {
      res.status(403).json({ error: 'Forbidden', message: 'Only the author or a Super Admin can edit this module' });
      return;
    }
    const { errors, value } = parseModuleBody(req.body ?? {});
    if (Object.keys(errors).length) {
      res.status(422).json({ error: 'Unprocessable Entity', message: 'Validation failed', errors });
      return;
    }
    const module = await moduleRepo.update(id, {
      ...value,
      instructor_name: existing.instructor_name,
      approval_status: isAdmin ? existing.approval_status : 'PENDING',
    });
    res.json({ success: true, message: isAdmin ? 'Module updated' : 'Module updated and re-submitted for approval', data: module });
  } catch (err) {
    next(err);
  }
};
