/** Evidence is supplied by executed server tools, never inferred from Lucy's prose. */
export type LucySource = {
  kind: 'document' | 'task' | 'project' | 'schedule';
  id: string;
  title: string;
  excerpt: string;
  retrievedAt: string;
  date?: string;
};
export type LucyEvidence = {sources: LucySource[]; incomplete: boolean};

/** Keep a malformed/oversized response from crashing the UI or appearing complete. */
export function readLucyEvidence(value: unknown): LucyEvidence | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'object' || !('sources' in value) || !Array.isArray(value.sources)) {
    return {sources: [], incomplete: true};
  }
  const valid = value.sources.slice(0, 12).filter((source): source is LucySource =>
    source != null && typeof source === 'object'
    && ['document', 'task', 'project', 'schedule'].includes(source.kind)
    && typeof source.id === 'string' && source.id.trim().length > 0 && source.id.length <= 200
    && typeof source.title === 'string' && typeof source.excerpt === 'string'
    && typeof source.retrievedAt === 'string' && source.retrievedAt.length <= 64 && Number.isFinite(Date.parse(source.retrievedAt))
    && (source.date === undefined || (typeof source.date === 'string' && source.date.length <= 64 && Number.isFinite(Date.parse(source.date))))
  );
  return {
    sources: valid.map(source => ({
      kind: source.kind, id: source.id, title: source.title.slice(0, 200),
      excerpt: source.excerpt.slice(0, 1200), retrievedAt: source.retrievedAt,
      ...(source.date === undefined ? {} : {date: source.date}),
    })),
    incomplete: !('incomplete' in value) || value.incomplete !== false
      || valid.length !== value.sources.length
      || valid.some(source => source.title.length > 200 || source.excerpt.length > 1200),
  };
}
