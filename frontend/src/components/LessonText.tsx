import { useMemo } from 'react';

/**
 * Tiny markdown-ish renderer: headings (#, ##, ###), paragraphs, bullet lists, **bold**.
 * No HTML pass-through. `size="lg"` is used by the presentation viewer.
 */
export function LessonText({ text, size = 'md', invert = false }: { text: string; size?: 'md' | 'lg'; invert?: boolean }) {
  const blocks = useMemo(() => text.replace(/\r\n/g, '\n').split(/\n{2,}/).filter((b) => b.trim()), [text]);
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>));

  const body = invert ? 'text-slate-200' : 'text-slate-700 dark:text-slate-300';
  const heading = invert ? 'text-white' : 'text-slate-900 dark:text-white';
  const base = size === 'lg' ? 'space-y-5 text-lg leading-relaxed sm:text-xl sm:leading-relaxed' : 'space-y-3 text-sm leading-relaxed';
  const hSize = size === 'lg' ? ['text-3xl sm:text-4xl', 'text-2xl sm:text-3xl', 'text-xl sm:text-2xl'] : ['text-lg', 'text-base', 'text-sm'];

  return (
    <div className={`${base} ${body}`}>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (/^#{1,3}\s/.test(lines[0])) {
          const level = lines[0].match(/^#+/)![0].length;
          const Tag = level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4';
          return <Tag key={i} className={`${hSize[level - 1]} font-semibold tracking-tight ${heading}`}>{inline(lines[0].replace(/^#+\s/, ''))}</Tag>;
        }
        if (lines.every((l) => /^\s*[-*]\s/.test(l))) {
          return <ul key={i} className={`list-disc ${size === 'lg' ? 'space-y-2 pl-7' : 'space-y-1 pl-5'}`}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*]\s/, ''))}</li>)}</ul>;
        }
        return <p key={i}>{lines.map((l, j) => <span key={j}>{inline(l)}{j < lines.length - 1 && <br />}</span>)}</p>;
      })}
    </div>
  );
}
