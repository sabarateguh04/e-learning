import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Clock, Eye, FileText, Info, Plus, Presentation, Search, Video } from 'lucide-react';
import { AUDIENCE_META, TARGET_AUDIENCES, audienceTone, isTargetAudience } from '../lib/audience';
import { useFetch } from '../lib/hooks';
import { isSuperAdmin, isTrainer } from '../lib/roles';
import { useAuthStore } from '../store/authStore';
import type { LearningModule, ListResponse, ModulesResponse } from '../types';
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton, cardClass, inputClass, primaryButtonClass } from '../components/ui';
import { MotionItem, MotionList } from '../components/motion';
import { ModuleCover } from '../components/ModuleCover';

function ModuleCard({ module }: { module: LearningModule }) {
  const hasVideo = Boolean(module.video_url);
  const pdfCount = module.attachments.length + (module.pdf_url ? 1 : 0);

  return (
    <Link
      to={`/modules/${module.id}/present`}
      title="Buka dalam mode presentasi layar penuh"
      className={`${cardClass} card-interactive group flex h-full flex-col overflow-hidden hover:border-slate-300 dark:hover:border-slate-700`}
    >
      {/* Thumbnail: explicit image → YouTube poster → road-safety illustration */}
      <ModuleCover module={module} className="aspect-video w-full">
        <div className="absolute left-3 top-3 flex gap-1.5">
          {hasVideo && (
            <span className="inline-flex items-center gap-1 rounded-md bg-black/40 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">
              <Video className="h-3 w-3" /> Video
            </span>
          )}
          {pdfCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-black/40 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">
              <FileText className="h-3 w-3" /> {pdfCount} PDF
            </span>
          )}
        </div>
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-md bg-black/40 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">
          <Clock className="h-3 w-3" /> {module.duration_minutes} min
        </span>
      </ModuleCover>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${audienceTone(module.target_audience)}`} title={isTargetAudience(module.target_audience) ? AUDIENCE_META[module.target_audience].description : undefined}>
            {module.target_audience}
          </span>
          <span className="text-[11px] text-slate-400">{module.category}</span>
        </div>
        <div className="space-y-1">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 group-hover:text-brand-600 dark:text-white dark:group-hover:text-brand-400">
            {module.title}
          </h3>
          <p className="line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{module.description}</p>
        </div>
        <div className="mt-auto flex items-center justify-between pt-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="truncate">By {module.author_name ?? module.instructor_name}</span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{module.metrics.views}</span>
            {module.has_quiz && <Badge tone="success">Quiz</Badge>}
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 group-hover:text-brand-600 dark:text-slate-200 dark:group-hover:text-brand-400"><Presentation className="h-3.5 w-3.5" /> Presentasikan</span>
          <Link to={`/modules/${module.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"><Info className="h-3.5 w-3.5" /> Detail</Link>
        </div>
      </div>
    </Link>
  );
}

function CardSkeleton() {
  return (
    <div className={`${cardClass} overflow-hidden`}>
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

function MySubmissions() {
  const { data } = useFetch<ListResponse<LearningModule>>('/modules/mine');
  const pending = (data?.data ?? []).filter((m) => m.approval_status !== 'APPROVED');
  if (!pending.length) return null;
  return (
    <div className={`${cardClass} p-4`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Your submissions awaiting review</p>
      <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
        {pending.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <Link to={`/modules/${m.id}`} className="truncate font-medium hover:text-brand-600 dark:hover:text-brand-400">{m.title}</Link>
            <Badge tone={m.approval_status === 'REJECTED' ? 'danger' : 'warning'}>{m.approval_status}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Modules() {
  const roleLevel = useAuthStore((s) => s.user?.role_level);
  const canAuthor = isTrainer(roleLevel) || isSuperAdmin(roleLevel);
  const { data, loading, error, refetch } = useFetch<ModulesResponse>('/modules');
  const [query, setQuery] = useState('');
  const [audience, setAudience] = useState<string>('All');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.data ?? []).filter(
      (m) =>
        (audience === 'All' || m.target_audience === audience) &&
        (!q || `${m.title} ${m.description} ${m.category} ${m.instructor_name}`.toLowerCase().includes(q)),
    );
  }, [data, query, audience]);

  const audiences = ['All', ...TARGET_AUDIENCES];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Learning Modules"
        description={data ? `${data.total} modules available for your tenant.` : 'Video lessons, reading material and evaluations.'}
        action={canAuthor ? <Link to="/modules/new" className={primaryButtonClass}><Plus className="h-4 w-4" /> Create module</Link> : undefined}
      />

      {canAuthor && <MySubmissions />}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {audiences.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAudience(a)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                audience === a
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700'
              }`}
            >
              {a === 'All' ? 'Semua jenjang' : a}
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules…"
            className={`${inputClass} pl-9`}
          />
        </div>
      </div>

      {/* Grid */}
      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title="No modules match" description="Try a different audience filter or search term." />
      ) : (
        <MotionList className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((m) => (
            <MotionItem key={m.id} className="h-full">
              <ModuleCard module={m} />
            </MotionItem>
          ))}
        </MotionList>
      )}
    </div>
  );
}
