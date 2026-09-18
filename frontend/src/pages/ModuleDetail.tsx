import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Calendar, CheckCircle2, ClipboardCheck, Clock, Download, Eye, FileText, Globe2, MapPin, Presentation, RotateCcw, User, XCircle } from 'lucide-react';
import { LessonText } from '../components/LessonText';
import { VideoPlayer } from '../components/VideoPlayer';
import { AUDIENCE_META, audienceTone, isTargetAudience } from '../lib/audience';
import { api } from '../lib/api';
import { useFetch } from '../lib/hooks';
import type { ModuleAttachment, ModuleResponse, QuizData } from '../types';
import { Badge, ErrorState, Skeleton, cardClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmt = new Intl.NumberFormat('id-ID');

function AttachmentRow({ attachment }: { attachment: ModuleAttachment }) {
  return (
    <a href={attachment.pdf_url} target="_blank" rel="noreferrer" className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"><FileText className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{attachment.title}</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">PDF{attachment.pages ? ` · ${attachment.pages} pages` : ''}</p>
      </div>
      <Download className="h-4 w-4 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  );
}

/* ── Quiz runner ─────────────────────────────────────────────────────────── */
function QuizRunner({ quiz, onClose }: { quiz: QuizData; onClose: () => void }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const total = quiz.questions.length;
  const correct = quiz.questions.filter((q) => answers[q.id] === q.answer_index).length;
  const score = total ? Math.round((correct / total) * 100) : 0;
  const passed = score >= quiz.pass_score;
  const answered = Object.keys(answers).length;

  return (
    <div className={`${cardClass} animate-fade-up`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold">Evaluation</h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{total} questions · {quiz.time_limit_minutes} min · {quiz.pass_score}% to pass</p>
        </div>
        {submitted ? (
          <Badge tone={passed ? 'success' : 'danger'}>{passed ? 'Passed' : 'Not passed'} · {score}%</Badge>
        ) : (
          <span className="text-xs text-slate-500 dark:text-slate-400">{answered}/{total} answered</span>
        )}
      </div>
      <ol className="divide-y divide-slate-100 dark:divide-slate-800">
        {quiz.questions.map((q, i) => {
          const chosen = answers[q.id];
          return (
            <li key={q.id} className="space-y-3 px-5 py-4">
              <p className="text-sm font-medium"><span className="mr-2 text-slate-400">{i + 1}.</span>{q.question}</p>
              <div className="space-y-1.5">
                {q.options.map((opt, oi) => {
                  const isChosen = chosen === oi;
                  const isCorrect = q.answer_index === oi;
                  const tone = submitted
                    ? isCorrect ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40' : isChosen ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40' : 'border-slate-200 dark:border-slate-800'
                    : isChosen ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700';
                  return (
                    <label key={oi} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${tone}`}>
                      <input type="radio" name={q.id} disabled={submitted} checked={isChosen} onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))} className="h-4 w-4" />
                      <span className="flex-1">{opt}</span>
                      {submitted && isCorrect && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                      {submitted && isChosen && !isCorrect && <XCircle className="h-4 w-4 text-red-500" />}
                    </label>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
        {submitted ? (
          <>
            <button type="button" onClick={() => { setAnswers({}); setSubmitted(false); }} className={secondaryButtonClass}><RotateCcw className="h-4 w-4" /> Retry</button>
            <button type="button" onClick={onClose} className={primaryButtonClass}>Done</button>
          </>
        ) : (
          <>
            <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
            <button type="button" onClick={() => setSubmitted(true)} disabled={answered < total} className={primaryButtonClass}>Submit answers</button>
          </>
        )}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2"><Skeleton className="aspect-video w-full rounded-2xl" /><Skeleton className="h-7 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /></div>
      <Skeleton className="h-80 w-full rounded-2xl" />
    </div>
  );
}

export function ModuleDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, refetch } = useFetch<ModuleResponse>(id ? `/modules/${id}` : null);
  const module = data?.data;
  const [params] = useSearchParams();
  const [quizOpen, setQuizOpen] = useState(params.get('quiz') === '1');

  // Engagement metric: one view per page open (fire-and-forget).
  useEffect(() => {
    if (!id) return;
    api.post(`/modules/${id}/view`).catch(() => undefined);
  }, [id]);

  const materials: ModuleAttachment[] = module
    ? [...(module.pdf_url ? [{ id: 'primary', title: `${module.title} — Course Notes`, pdf_url: module.pdf_url, pages: 0 }] : []), ...module.attachments]
    : [];

  return (
    <div className="space-y-6">
      <Link to="/modules" className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to modules</Link>

      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : loading || !module ? (
        <DetailSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ── Main ─────────────────────────────────────────────────────── */}
          <div className="space-y-5 lg:col-span-2">
            {module.approval_status !== 'APPROVED' && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                Author preview — this module is <strong>{module.approval_status.toLowerCase()}</strong> and not yet visible to learners.
              </p>
            )}

            <div className="aspect-video w-full overflow-hidden rounded-2xl bg-slate-900 shadow-lg ring-1 ring-slate-900/10 dark:ring-white/10">
              <VideoPlayer url={module.video_url} title={module.title} poster={module.thumbnail_url} />
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${audienceTone(module.target_audience)}`} title={isTargetAudience(module.target_audience) ? AUDIENCE_META[module.target_audience].description : undefined}>
                  Target audiens · {module.target_audience}
                </span>
                <Badge>{module.category}</Badge>
                {module.quiz && <Badge tone="success">{module.quiz.questions.length}-question evaluation</Badge>}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <h1 className="text-2xl font-bold tracking-tight">{module.title}</h1>
                <Link to={`/modules/${module.id}/present`} className={`${primaryButtonClass} shrink-0`}><Presentation className="h-4 w-4" /> Presentasikan</Link>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> {module.author_name ?? module.instructor_name}</span>
                <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {module.duration_minutes} min</span>
                <span className="inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Published {formatDate(module.published_at)}</span>
              </div>
            </div>

            {module.description && (
              <div className={`${cardClass} p-5`}>
                <h2 className="text-sm font-semibold">About this module</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{module.description}</p>
              </div>
            )}

            {module.content_text && (
              <div className={`${cardClass} p-5`}>
                <h2 className="mb-4 text-sm font-semibold">Lesson</h2>
                <LessonText text={module.content_text} />
              </div>
            )}

            {quizOpen && module.quiz && <QuizRunner quiz={module.quiz} onClose={() => setQuizOpen(false)} />}
          </div>

          {/* ── Side ─────────────────────────────────────────────────────── */}
          <aside className="space-y-4">
            <div className={cardClass}>
              <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <h2 className="text-sm font-semibold">Supporting materials</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{materials.length} file{materials.length === 1 ? '' : 's'}</p>
              </div>
              <div className="p-1.5">
                {materials.length > 0 ? materials.map((att) => <AttachmentRow key={att.id} attachment={att} />) : <p className="px-3 py-6 text-center text-xs text-slate-500 dark:text-slate-400">No downloadable materials for this module.</p>}
              </div>
            </div>

            <div className={`${cardClass} p-4`}>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/50 dark:text-brand-300"><ClipboardCheck className="h-4.5 w-4.5" /></div>
                <div>
                  <p className="text-sm font-semibold">Evaluation</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {module.quiz ? `${module.quiz.questions.length} questions · ${module.quiz.time_limit_minutes} minutes · ${module.quiz.pass_score}% to pass` : 'No evaluation is attached to this module.'}
                  </p>
                </div>
              </div>
              <button type="button" disabled={!module.quiz} onClick={() => setQuizOpen(true)} className={`${primaryButtonClass} mt-4 w-full`}>Take Evaluation / Quiz</button>
            </div>

            <div className={`${cardClass} p-4`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Engagement</p>
              <dl className="mt-2 space-y-2 text-sm">
                {[
                  ['Views', module.metrics.views, Eye],
                  ['Presented in the field', module.metrics.presentations, MapPin],
                  ['Public views', module.metrics.public_views, Globe2],
                ].map(([label, value, Icon]) => {
                  const I = Icon as typeof Eye;
                  return (
                    <div key={label as string} className="flex items-center justify-between">
                      <dt className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><I className="h-3.5 w-3.5" />{label as string}</dt>
                      <dd className="font-medium tabular-nums">{fmt.format(value as number)}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
