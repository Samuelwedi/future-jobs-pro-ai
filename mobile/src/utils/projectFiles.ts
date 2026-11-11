export type ProjectFile = { id: string; name: string; url: string | null };

// Opening is always a separate user action. Do not turn local paths, credentials,
// app schemes, or a malformed URL into a native link.
export function projectFileUrl(value: unknown): string | null {
  if (typeof value !== 'string' || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function readProjectFiles(response: unknown, projectId: string, companyId: string): ProjectFile[] {
  const value = response as { success?: boolean; attachments?: unknown[] } | null;
  if (!value || value.success !== true || !Array.isArray(value.attachments)) throw new Error('Invalid project files response');
  const ids = new Set<string>();
  return value.attachments.map((entry: any) => {
    if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id)
      || entry.project_id !== projectId || entry.company_id !== companyId
      || typeof entry.file_name !== 'string' || !entry.file_name.trim()) {
      throw new Error('Invalid project file scope or metadata');
    }
    ids.add(entry.id);
    return { id: entry.id, name: entry.file_name, url: projectFileUrl(entry.file_url) };
  });
}
