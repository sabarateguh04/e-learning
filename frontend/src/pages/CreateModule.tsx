import { useState, type FormEvent, type ReactNode } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, FileText, Loader2, Plus, Send, Trash2, Video, type LucideIcon } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { isSuperAdmin } from '../lib/roles';
import { useAuthStore } from '../store/authStore';
import type { ApiValidationError, CreateModulePayload, LearningModule, ModuleOptions, QuizQuestion } from '../types';
import { Badge, cardClass, inputClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';
import { AUDIENCE_META, TARGET_AUDIENCES, audienceTone } from '../lib/audience';
import { parseVideoSource } from '../lib/video';
import { VideoPlayer } from '../components/VideoPlayer';

type Step = 'text' | 'video' | 'quiz';
const STEPS: Array<{ key: Step; label: string; icon: LucideIcon; hint: string }> = [
  { key: 'text', label: 'Teks', icon: FileText, hint: 'Title, metadata and lesson body' },
  { key: 'video', label: 'Video', icon: Video, hint: 'Video and PDF resources' },
  { key: 'quiz', label: 'Kuis Builder', icon: ClipboardCheck, hint: 'Multiple-choice evaluation' },
];

const newQuestion = (n: number): QuizQuestion => ({ id: `q${n}`, question: '', options: ['', ''], answer_index: 0 });

function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">{label}</label>
      {children}
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : hint ? <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function CreateModule() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const options = useFetch<ModuleOptions>('/modules/options');

  const [step, setStep] = useState<Step>('text');
  const [form, setForm] = useState({ title: '', description: '', category: '', target_audience: 'Umum', content_text: '', video_url: '', pdf_url: '', duration_minutes: '' });
  const [quizEnabled, setQuizEnabled] = useState(false);
  const [quizMeta, setQuizMeta] = useState({ pass_score: '70', time_limit_minutes: '15' });
  const [questions, setQuestions] = useState<QuizQuestion[]>([newQuestion(1)]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [created, setCreated] = useState<LearningModule | null>(null);

  const set = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => { const { [key]: _r, content: _c, ...rest } = e; return rest; });
  };

  const updateQuestion = (i: number, patch: Partial<QuizQuestion>) => setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const updateOption = (qi: number, oi: number, value: string) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) } : q)));
  const addOption = (qi: number) => setQuestions((qs) => qs.map((q, idx) => (idx === qi && q.options.length < 6 ? { ...q, options: [...q.options, ''] } : q)));
  const removeOption = (qi: number, oi: number) =>
    setQuestions((qs) => qs.map((q, idx) => {
      if (idx !== qi || q.options.length <= 2) return q;
      const options = q.options.filter((_, j) => j !== oi);
      return { ...q, options, answer_index: Math.min(q.answer_index, options.length - 1) };
    }));

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const errorsInStep = (s: Step) =>
    Object.keys(errors).some((k) => (s === 'text' ? ['title', 'description', 'category', 'target_audience', 'content_text', 'duration_minutes', 'content'].includes(k) : s === 'video' ? ['video_url', 'pdf_url', 'content'].includes(k) : k.startsWith('quiz')));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFailure(null);
    setErrors({});
    const payload: CreateModulePayload = {
      ...form,
      duration_minutes: Number(form.duration_minutes || 0),
      quiz: quizEnabled ? { pass_score: Number(quizMeta.pass_score), time_limit_minutes: Number(quizMeta.time_limit_minutes), questions } : null,
    };
    try {
      const { data } = await api.post<{ data: LearningModule }>('/modules', payload);
      setCreated(data.data);
    } catch (err) {
      if (axios.isAxiosError<ApiValidationError>(err) && err.response?.status === 422 && err.response.data.errors) {
        const errs = err.response.data.errors;
        setErrors(errs);
        const first = STEPS.find((s) => Object.keys(errs).some((k) => (s.key === 'quiz' ? k.startsWith('quiz') : s.key === 'video' ? ['video_url', 'pdf_url'].includes(k) : !k.startsWith('quiz') && !['video_url', 'pdf_url'].includes(k))));
        if (first) setStep(first.key);
      }
      setFailure(getErrorMessage(err, 'Failed to save the module.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <div className={`${cardClass} flex flex-col items-center px-6 py-14 text-center animate-fade-up`}>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"><CheckCircle2 className="h-6 w-6" /></div>
          <p className="text-base font-semibold">{created.title}</p>
          <div className="mt-2"><Badge tone={created.approval_status === 'APPROVED' ? 'success' : 'warning'}>{created.approval_status}</Badge></div>
          <p className="mt-3 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            {created.approval_status === 'APPROVED' ? 'Published and visible to your tenant.' : 'Submitted. A Super Admin will review it before it appears in the catalogue.'}
          </p>
          <div className="mt-6 flex gap-2">
            <Link to={`/modules/${created.id}`} className={secondaryButtonClass}>Preview</Link>
            <button type="button" onClick={() => navigate('/modules')} className={primaryButtonClass}>Back to modules</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/modules" className="mb-2 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"><ArrowLeft className="h-4 w-4" /> Modules</Link>
          <h1 className="text-2xl font-bold tracking-tight">Create Module</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isSuperAdmin(user?.role_level) ? 'Published immediately as Super Admin.' : 'Submitted for Super Admin approval before it goes live.'}
          </p>
        </div>
      </div>

      {/* Stepper */}
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map(({ key, label, icon: Icon, hint }, i) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => setStep(key)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                step === key ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
              } ${errorsInStep(key) && step !== key ? 'ring-2 ring-red-400/50' : ''}`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${step === key ? 'bg-white/15' : 'bg-slate-100 dark:bg-slate-800'}`}>{i + 1}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold"><Icon className="h-4 w-4" />{label}</span>
                <span className={`hidden text-[11px] sm:block ${step === key ? 'opacity-70' : 'text-slate-500 dark:text-slate-400'}`}>{hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      {failure && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">{failure}</p>}

      <fieldset disabled={submitting} className={`${cardClass} animate-fade-up`} key={step}>
        {/* ── Step 1: Teks ─────────────────────────────────────────────── */}
        {step === 'text' && (
          <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Title" htmlFor="title" error={errors.title}>
                <input id="title" value={form.title} onChange={(e) => set('title', e.target.value)} className={inputClass} placeholder="e.g. Community Outreach Basics" autoFocus />
              </Field>
            </div>
            <Field label="Category" htmlFor="category" error={errors.category}>
              <select id="category" value={form.category} onChange={(e) => set('category', e.target.value)} className={inputClass}>
                <option value="">General</option>
                {options.data?.categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Target audiens (jenjang)" htmlFor="target_audience" error={errors.target_audience}>
              <select id="target_audience" value={form.target_audience} onChange={(e) => set('target_audience', e.target.value)} className={inputClass}>
                {(options.data?.audiences ?? TARGET_AUDIENCES).map((a) => (
                  <option key={a} value={a}>{a}{a in AUDIENCE_META ? ` — ${AUDIENCE_META[a as keyof typeof AUDIENCE_META].description}` : ''}</option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2 flex flex-wrap gap-1.5">
              {TARGET_AUDIENCES.map((a) => (
                <button key={a} type="button" onClick={() => set('target_audience', a)} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-all active:scale-95 ${audienceTone(a)} ${form.target_audience === a ? 'ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-900' : 'opacity-70 hover:opacity-100'}`}>
                  {a}
                </button>
              ))}
            </div>
            <div className="sm:col-span-2">
              <Field label="Short description" htmlFor="description" error={errors.description}>
                <textarea id="description" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} className={`${inputClass} resize-y`} placeholder="One or two sentences shown on the module card." />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Lesson text" htmlFor="content_text" error={errors.content_text ?? errors.content} hint="Markdown supported. At least one of lesson text, video or PDF is required.">
                <textarea id="content_text" rows={12} value={form.content_text} onChange={(e) => set('content_text', e.target.value)} className={`${inputClass} resize-y font-mono text-xs leading-relaxed`} placeholder={'# Introduction\n\nExplain the objective of this module…'} />
              </Field>
            </div>
            <Field label="Duration (minutes)" htmlFor="duration_minutes" error={errors.duration_minutes}>
              <input id="duration_minutes" type="number" min={0} max={600} value={form.duration_minutes} onChange={(e) => set('duration_minutes', e.target.value)} className={inputClass} placeholder="20" />
            </Field>
          </div>
        )}

        {/* ── Step 2: Video ────────────────────────────────────────────── */}
        {step === 'video' && (
          <div className="space-y-5 p-5">
            <Field label="Video URL" htmlFor="video_url" error={errors.video_url ?? errors.content} hint="Tautan YouTube (video atau playlist) atau file MP4 langsung. Kosongkan untuk modul bacaan.">
              <input id="video_url" type="url" value={form.video_url} onChange={(e) => set('video_url', e.target.value)} className={inputClass} placeholder="https://www.youtube.com/watch?v=…" autoFocus />
            </Field>
            {parseVideoSource(form.video_url) && (
              <div className="aspect-video w-full overflow-hidden rounded-xl bg-slate-900 ring-1 ring-slate-900/10 dark:ring-white/10 animate-fade-in">
                <VideoPlayer url={form.video_url} title="Pratinjau video" />
              </div>
            )}
            <Field label="PDF URL (optional)" htmlFor="pdf_url" error={errors.pdf_url}>
              <input id="pdf_url" type="url" value={form.pdf_url} onChange={(e) => set('pdf_url', e.target.value)} className={inputClass} placeholder="https://cdn.example.com/handout.pdf" />
            </Field>
          </div>
        )}

        {/* ── Step 3: Kuis Builder ─────────────────────────────────────── */}
        {step === 'quiz' && (
          <div className="space-y-5 p-5">
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
              <span>
                <span className="block text-sm font-medium">Attach an evaluation</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">Learners must pass it to complete the module.</span>
              </span>
              <input type="checkbox" checked={quizEnabled} onChange={(e) => setQuizEnabled(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900" />
            </label>

            {quizEnabled && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Pass score (%)" htmlFor="pass_score" error={errors['quiz.pass_score']}>
                    <input id="pass_score" type="number" min={1} max={100} value={quizMeta.pass_score} onChange={(e) => setQuizMeta((m) => ({ ...m, pass_score: e.target.value }))} className={inputClass} />
                  </Field>
                  <Field label="Time limit (min)" htmlFor="time_limit" error={errors['quiz.time_limit_minutes']}>
                    <input id="time_limit" type="number" min={1} max={240} value={quizMeta.time_limit_minutes} onChange={(e) => setQuizMeta((m) => ({ ...m, time_limit_minutes: e.target.value }))} className={inputClass} />
                  </Field>
                </div>

                <ol className="space-y-4">
                  {questions.map((q, qi) => {
                    const qErr = errors[`quiz.questions.${qi}.question`] ?? errors[`quiz.questions.${qi}.options`] ?? errors[`quiz.questions.${qi}.answer_index`];
                    return (
                      <li key={q.id} className={`rounded-xl border p-4 ${qErr ? 'border-red-300 dark:border-red-900' : 'border-slate-200 dark:border-slate-800'}`}>
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Question {qi + 1}</p>
                          <button type="button" onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qi))} disabled={questions.length <= 1} className="rounded-md p-1 text-slate-400 hover:text-red-600 disabled:opacity-40" aria-label="Remove question"><Trash2 className="h-4 w-4" /></button>
                        </div>
                        <input value={q.question} onChange={(e) => updateQuestion(qi, { question: e.target.value })} className={inputClass} placeholder="Type the question…" />
                        <div className="mt-3 space-y-2">
                          {q.options.map((opt, oi) => (
                            <div key={oi} className="flex items-center gap-2">
                              <input type="radio" name={`answer-${q.id}`} checked={q.answer_index === oi} onChange={() => updateQuestion(qi, { answer_index: oi })} className="h-4 w-4 text-brand-600 focus:ring-brand-500" title="Mark as correct" />
                              <input value={opt} onChange={(e) => updateOption(qi, oi, e.target.value)} className={`${inputClass} py-2`} placeholder={`Option ${oi + 1}`} />
                              <button type="button" onClick={() => removeOption(qi, oi)} disabled={q.options.length <= 2} className="rounded-md p-1 text-slate-400 hover:text-red-600 disabled:opacity-40" aria-label="Remove option"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <button type="button" onClick={() => addOption(qi)} disabled={q.options.length >= 6} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline disabled:opacity-40 dark:text-brand-400"><Plus className="h-3.5 w-3.5" /> Add option</button>
                          <span className="text-[11px] text-slate-400">Radio marks the correct answer</span>
                        </div>
                        {qErr && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{qErr}</p>}
                      </li>
                    );
                  })}
                </ol>
                <button type="button" onClick={() => setQuestions((qs) => [...qs, newQuestion(qs.length + 1)])} className={secondaryButtonClass}><Plus className="h-4 w-4" /> Add question</button>
              </>
            )}
          </div>
        )}
      </fieldset>

      {/* Footer nav */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)].key)} disabled={stepIndex === 0} className={secondaryButtonClass}><ArrowLeft className="h-4 w-4" /> Back</button>
        {stepIndex < STEPS.length - 1 ? (
          <button type="button" onClick={() => setStep(STEPS[stepIndex + 1].key)} className={primaryButtonClass}>Next <ArrowRight className="h-4 w-4" /></button>
        ) : (
          <button type="submit" disabled={submitting} className={primaryButtonClass}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {isSuperAdmin(user?.role_level) ? 'Publish module' : 'Submit for approval'}</button>
        )}
      </div>
    </form>
  );
}
