/**
 * Splits lesson text into presentation slides: a new slide starts at every `#`/`##` heading
 * or at a `---` divider. Text before the first heading becomes the first slide.
 */
export function splitIntoSlides(text: string): Array<{ title: string | null; body: string }> {
  const normalized = text.replace(/\r\n/g, '\n');
  const chunks = normalized.split(/\n(?=#{1,2}\s)|\n-{3,}\n/);
  return chunks
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const m = chunk.match(/^(#{1,2})\s+(.+)\n?/);
      if (!m) return { title: null, body: chunk };
      return { title: m[2].trim(), body: chunk.slice(m[0].length).trim() };
    });
}
