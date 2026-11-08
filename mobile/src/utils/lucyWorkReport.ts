import type {LucySource} from './lucyEvidence';

export type LucyWorkMode = 'ai_research' | 'record_search' | 'work_briefing';
export type LucyBriefingOptions = {from: string; to: string; taskStatus: 'open'|'pending'|'in_progress'|'completed'|'all'};
export type LucyWorkModes = {ai_research: boolean; record_search: boolean; work_briefing: boolean; explicit: boolean};
export type LucyWorkReport = {text: string; filename: string; bytes: number};
const record = (value: unknown): value is Record<string, unknown> => value != null && typeof value === 'object' && !Array.isArray(value);

/** Missing metadata means an older AI-only server; malformed new metadata fails closed. */
export function readLucyWorkModes(value: unknown): LucyWorkModes {
  const disabled = {ai_research: false, record_search: false, work_briefing: false, explicit: true};
  if (!record(value)) return disabled;
  if (!Object.prototype.hasOwnProperty.call(value, 'modes')) return {ai_research: value.enabled === true, record_search: false, work_briefing: false, explicit: false};
  const modes = value.modes;
  if (!record(modes) || typeof modes.ai_research !== 'boolean' || typeof modes.record_search !== 'boolean'
    || ('work_briefing' in modes && typeof modes.work_briefing !== 'boolean')) return disabled;
  return {ai_research: modes.ai_research, record_search: modes.record_search, work_briefing: modes.work_briefing === true, explicit: true};
}

/** Explicit Gregorian dates only. A range includes both endpoints and at most 31 days. */
export function readLucyBriefingOptions(value: unknown): LucyBriefingOptions|null {
  if (!record(value) || Object.keys(value).sort().join(',') !== 'from,taskStatus,to'
    || typeof value.taskStatus !== 'string' || !['open','pending','in_progress','completed','all'].includes(value.taskStatus)) return null;
  const day = (input: unknown): number|null => {
    if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input) || input.startsWith('0000-')) return null;
    const time = Date.parse(`${input}T00:00:00.000Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === input ? time : null;
  };
  const from = day(value.from), to = day(value.to);
  if (from === null || to === null || to < from || (to-from)/86400000+1 > 31) return null;
  return {from: value.from as string, to: value.to as string, taskStatus: value.taskStatus as LucyBriefingOptions['taskStatus']};
}
export function lucyBriefingPrompt(options: LucyBriefingOptions): string {
  return `Work briefing (no AI): ${options.taskStatus} tasks; shifts ${options.from} through ${options.to}`;
}
export const knownLucyWorkMode = (mode: unknown) => mode === undefined || mode === 'ai_research' || mode === 'record_search' || mode === 'work_briefing';
const localized = (key: string, language: string) => copy[key][language === 'es' ? 1 : language === 'fr' ? 2 : 0];
export function lucyWorkModeLabel(mode: unknown, language = 'en'): string {
  return localized(mode === 'work_briefing' ? 'briefingMode' : mode === 'record_search' ? 'recordMode'
    : mode === 'ai_research' ? 'aiMode' : mode === undefined ? 'legacyMode' : 'unavailableMode', language);
}
export function lucyBriefingPreview(options: LucyBriefingOptions, language = 'en'): string {
  const status = localized(`status_${options.taskStatus}`, language);
  if (language === 'es') return `Resumen de trabajo: tareas ${options.taskStatus === 'all' ? 'de todos los estados' : status} de cualquier fecha; turnos guardados del ${options.from} al ${options.to} (ambos incluidos).`;
  if (language === 'fr') return `Bilan de travail : tâches ${status}, toutes dates confondues ; quarts enregistrés du ${options.from} au ${options.to} (inclus).`;
  return `Work briefing: ${status} tasks across all dates; stored shifts from ${options.from} through ${options.to} (inclusive).`;
}

export const LUCY_REPORT_MAX_BYTES = 128000;
const invalid = (): never => {throw new Error('shareError');};
/** Count exact UTF-8 bytes without depending on a browser TextEncoder or Node Buffer. */
function utf8Bytes(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) return invalid();
      bytes += 4;
    } else if (code >= 0xDC00 && code <= 0xDFFF) return invalid();
    else bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
  }
  return bytes;
}
const boundedText = (value: unknown, max: number, required = false): value is string => typeof value === 'string'
  && value.length <= max && (!required || Boolean(value.trim()))
  && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value) && utf8Bytes(value) <= LUCY_REPORT_MAX_BYTES;
const timestamp = (value: unknown): value is string => boundedText(value, 64, true) && Number.isFinite(Date.parse(value));

const copy: Record<string, [string, string, string]> = {
  title: ['LUCY WORK REPORT', 'INFORME DE TRABAJO DE LUCY', 'RAPPORT DE TRAVAIL LUCY'],
  briefingTitle: ['LUCY WORK BRIEFING REPORT', 'INFORME DEL RESUMEN DE TRABAJO DE LUCY', 'RAPPORT DU BILAN DE TRAVAIL LUCY'],
  partialBriefingTitle: ['LUCY PARTIAL WORK BRIEFING REPORT', 'INFORME PARCIAL DEL RESUMEN DE TRABAJO DE LUCY', 'RAPPORT PARTIEL DU BILAN DE TRAVAIL LUCY'],
  briefingMode: ['Work briefing (no AI model)', 'Resumen de trabajo (sin modelo de IA)', 'Bilan de travail (sans modèle d’IA)'],
  unavailableMode: ['Unavailable work mode', 'Modo de trabajo no disponible', 'Mode de travail indisponible'],
  briefingQuery: ['Briefing request', 'Solicitud de resumen', 'Demande de bilan'],
  scheduleDates: ['Schedule dates', 'Fechas de los turnos', 'Dates des quarts'],
  scheduleScope: ['inclusive, stored shifts only', 'ambos incluidos, solo turnos guardados', 'inclus, quarts enregistrés uniquement'],
  taskStatus: ['Task status', 'Estado de las tareas', 'Statut des tâches'],
  taskScope: ['Tasks are selected across all dates, oldest first. Open means pending or in progress. Due dates are not evaluated.', 'Se seleccionan tareas de cualquier fecha, las más antiguas primero. Abiertas significa pendientes o en curso. No se evalúan las fechas de vencimiento.', 'Les tâches sont sélectionnées toutes dates confondues, les plus anciennes en premier. Ouvertes signifie en attente ou en cours. Les dates d’échéance ne sont pas évaluées.'],
  briefingBounds: ['Bounded briefing: counts plus at most six oldest tasks and six earliest stored shifts. Recurrence rules are not expanded. Missing or capped sources are partial.', 'Resumen limitado: recuentos y hasta seis tareas más antiguas y seis primeros turnos guardados. No se amplían las reglas de recurrencia. Las fuentes faltantes o limitadas producen resultados parciales.', 'Bilan limité : décomptes et au plus six tâches les plus anciennes et six premiers quarts enregistrés. Les règles de récurrence ne sont pas développées. Les sources manquantes ou limitées donnent des résultats partiels.'],
  status_open: ['open (pending or in progress)', 'abiertas (pendientes o en curso)', 'ouvertes (en attente ou en cours)'],
  status_pending: ['pending', 'pendientes', 'en attente'], status_in_progress: ['in progress', 'en curso', 'en cours'],
  status_completed: ['completed', 'completadas', 'terminées'], status_all: ['all', 'todos los estados', 'tous statuts'],
  partialTitle: ['LUCY PARTIAL RECORD SEARCH REPORT', 'INFORME PARCIAL DE BÚSQUEDA DE REGISTROS DE LUCY', 'RAPPORT PARTIEL DE RECHERCHE DE DONNÉES LUCY'],
  partial: ['PARTIAL RESULTS: Retrieval was limited or a source was unavailable. Some matching records may be missing. Do not treat this report as complete or exhaustive.', 'RESULTADOS PARCIALES: La consulta fue limitada o una fuente no estaba disponible. Pueden faltar registros coincidentes. Este informe no es completo ni exhaustivo.', 'RÉSULTATS PARTIELS : La recherche a été limitée ou une source était indisponible. Des données correspondantes peuvent manquer. Ce rapport n’est ni complet ni exhaustif.'],
  snapshot: ['Snapshot of the saved task and evidence already available in this account. No new retrieval was performed for this report.', 'Copia de la tarea guardada y las fuentes ya disponibles en esta cuenta. No se consultaron nuevos datos para este informe.', 'Copie de la tâche enregistrée et des sources déjà disponibles dans ce compte. Aucune nouvelle recherche n’a été effectuée pour ce rapport.'],
  recordMode: ['Company-record search (no AI model)', 'Búsqueda de registros de la empresa (sin modelo de IA)', 'Recherche de données de l’entreprise (sans modèle d’IA)'],
  aiMode: ['AI research', 'Investigación con IA', 'Recherche avec IA'],
  legacyMode: ['AI research (legacy server mode)', 'Investigación con IA (servidor anterior)', 'Recherche avec IA (ancien serveur)'],
  noModel: ['No AI model was called.', 'No se utilizó ningún modelo de IA.', 'Aucun modèle d’IA n’a été utilisé.'],
  modelCalls: ['Model calls reported by the server', 'Llamadas al modelo indicadas por el servidor', 'Appels au modèle signalés par le serveur'],
  unknownModel: ['Model-call details were not supplied.', 'No se proporcionaron detalles de las llamadas al modelo.', 'Les détails des appels au modèle n’ont pas été fournis.'],
  unknownEvidence: ['Unknown: source evidence was not supplied.', 'Desconocido: no se proporcionaron fuentes.', 'Inconnu : aucune source n’a été fournie.'],
  incomplete: ['Incomplete: some records may be missing. This is not an exhaustive search.', 'Incompleto: pueden faltar algunos registros. Esta búsqueda no es exhaustiva.', 'Incomplet : certaines données peuvent manquer. Cette recherche n’est pas exhaustive.'],
  complete: ['No missing evidence was reported for the retrieved records. This is not a guarantee that all company records were searched.', 'No se indicaron fuentes faltantes en los registros consultados. Esto no garantiza que se hayan buscado todos los registros de la empresa.', 'Aucune source manquante n’a été signalée pour les données récupérées. Cela ne garantit pas que toutes les données de l’entreprise ont été recherchées.'],
  mode: ['Mode', 'Modo', 'Mode'], id: ['Task ID', 'ID de tarea', 'ID de tâche'], status: ['Status', 'Estado', 'Statut'],
  created: ['Created', 'Creado', 'Créé'], completed: ['Completed', 'Completado', 'Terminé'], partialDate: ['Finished (partial)', 'Finalizado (parcial)', 'Terminé (partiel)'],
  missing: ['Not supplied', 'No proporcionado', 'Non fourni'], query: ['Query', 'Consulta', 'Requête'], result: ['Result', 'Resultado', 'Résultat'],
  completeness: ['Evidence completeness', 'Integridad de las fuentes', 'Exhaustivité des sources'], sources: ['Sources supplied', 'Fuentes proporcionadas', 'Sources fournies'],
  source: ['Source', 'Fuente', 'Source'], kind: ['Type', 'Tipo', 'Type'], sourceId: ['ID', 'ID', 'ID'], sourceTitle: ['Title', 'Título', 'Titre'],
  retrieved: ['Retrieved', 'Consultado', 'Consulté'], date: ['Record date', 'Fecha del registro', 'Date de l’enregistrement'], excerpt: ['Excerpt', 'Extracto', 'Extrait'],
  noSources: ['No source citations were supplied. None have been inferred from the result.', 'No se proporcionaron citas de fuentes. No se han inferido del resultado.', 'Aucune citation de source n’a été fournie. Aucune n’a été déduite du résultat.'],
  footer: ['This plain-text file contains record excerpts, not linked files or independently verified citations.', 'Este archivo de texto contiene extractos de registros, no archivos vinculados ni citas verificadas de forma independiente.', 'Ce fichier texte contient des extraits de données, et non des fichiers liés ou des citations vérifiées indépendamment.'],
};

/** Validate the whole loaded result before creating any file. Never fetch or follow sources. */
export function buildLucyWorkReport(value: unknown, language = 'en'): LucyWorkReport {
  const briefing = record(value) && value.mode === 'work_briefing';
  const modelFree = record(value) && (value.mode === 'record_search' || briefing);
  const partial = record(value) && value.status === 'partial' && modelFree;
  if (!record(value) || (value.status !== 'completed' && !partial) || !boundedText(value.id, 200, true)
    || !knownLucyWorkMode(value.mode)
    || !boundedText(value.prompt, modelFree ? 200 : 4000, true) || !timestamp(value.createdAt)
    || (value.completedAt != null && !timestamp(value.completedAt)) || (value.updatedAt !== undefined && !timestamp(value.updatedAt))
    || !record(value.result) || !boundedText(value.result.text, LUCY_REPORT_MAX_BYTES, true)) return invalid();
  const briefingOptions = briefing ? readLucyBriefingOptions(value.options) : null;
  if (briefing && (!briefingOptions || value.prompt !== lucyBriefingPrompt(briefingOptions))) return invalid();
  const run = value.result.run;
  if (run !== undefined && (!record(run) || (run.status !== undefined && run.status !== value.status)
    || (run.modelCalls !== undefined && (!Number.isSafeInteger(run.modelCalls) || Number(run.modelCalls) < 0)))) return invalid();
  if (modelFree && (!record(run) || run.modelCalls !== 0 || value.result.evidence === undefined)) return invalid();
  if (briefing) {
    if (!record(run) || run.status !== value.status || !Array.isArray(run.steps) || run.steps.length !== 2
      || run.steps.some((step,index) => !record(step) || step.tool !== ['briefing_tasks','briefing_schedules'][index]
        || (step.status !== 'completed' && step.status !== 'failed'))
      || (partial ? (run.stopReason !== 'retrieval_limits' && run.stopReason !== 'source_unavailable') : run.stopReason !== undefined)
      || (!partial && run.steps.some(step => step.status !== 'completed'))) return invalid();
    const failed = run.steps.filter(step => step.status === 'failed').length;
    if (failed > 1 || (run.stopReason === 'source_unavailable' ? failed !== 1 : failed !== 0)) return invalid();
  }
  if (partial && (!record(run) || run.status !== 'partial' || !record(value.result.evidence) || value.result.evidence.incomplete !== true)) return invalid();
  const label = (key: string) => localized(key, language);
  let sources: LucySource[] = [];
  let completeness = label('unknownEvidence');
  if (value.result.evidence !== undefined) {
    const evidence = value.result.evidence;
    if (!record(evidence) || !Array.isArray(evidence.sources) || evidence.sources.length > 12 || typeof evidence.incomplete !== 'boolean') return invalid();
    for (const source of evidence.sources) {
      if (!record(source) || typeof source.kind !== 'string' || !['document', 'task', 'project', 'schedule'].includes(source.kind)
        || !boundedText(source.id, 200, true) || !boundedText(source.title, 200) || !boundedText(source.excerpt, 1200)
        || (briefing && !['task','schedule'].includes(source.kind))
        || !timestamp(source.retrievedAt) || (source.date !== undefined && !timestamp(source.date))) return invalid();
    }
    sources = evidence.sources as LucySource[];
    if (briefing && (evidence.incomplete !== partial || ['task','schedule'].some(kind => sources.filter(source => source.kind === kind).length > 6))) return invalid();
    if (briefing && record(run) && Array.isArray(run.steps)
      && run.steps.some((step,index) => record(step) && step.status === 'failed' && sources.some(source => source.kind === (index === 0 ? 'task' : 'schedule')))) return invalid();
    completeness = label(evidence.incomplete ? 'incomplete' : 'complete');
  }
  const mode = lucyWorkModeLabel(value.mode, language);
  const model = modelFree ? label('noModel') : record(run) && typeof run.modelCalls === 'number'
    ? `${label('modelCalls')}: ${run.modelCalls}.` : label('unknownModel');
  const sections = [
    label(briefing ? (partial ? 'partialBriefingTitle' : 'briefingTitle') : (partial ? 'partialTitle' : 'title')), ...(partial ? [label('partial')] : []), label('snapshot'),
    `${label('mode')}: ${mode}`, model, `${label('id')}: ${value.id}`, `${label('status')}: ${value.status}`,
    `${label('created')}: ${value.createdAt}`, `${label(partial ? 'partialDate' : 'completed')}: ${value.completedAt ?? label('missing')}`,
    `${label(briefing ? 'briefingQuery' : 'query')}:\n${value.prompt}`,
    ...(briefingOptions ? [`${label('scheduleDates')}: ${briefingOptions.from} / ${briefingOptions.to} (${label('scheduleScope')}).`,
      `${label('taskStatus')}: ${label(`status_${briefingOptions.taskStatus}`)}. ${label('taskScope')}`, label('briefingBounds')] : []),
    `${label('result')}:\n${value.result.text}`,
    `${label('completeness')}: ${completeness}`, `${label('sources')}: ${sources.length}`,
    sources.length ? sources.map((source, index) => [
      `${label('source')} ${index + 1}`, `${label('kind')}: ${source.kind}`, `${label('sourceId')}: ${source.id}`,
      `${label('sourceTitle')}: ${source.title}`, `${label('retrieved')}: ${source.retrievedAt}`,
      ...(source.date ? [`${label('date')}: ${source.date}`] : []), `${label('excerpt')}:\n${source.excerpt}`,
    ].join('\n')).join('\n\n') : label('noSources'), label('footer'),
  ];
  const text = sections.join('\n\n') + '\n';
  const bytes = utf8Bytes(text);
  if (bytes > LUCY_REPORT_MAX_BYTES) return invalid();
  const safeId = value.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'task';
  const date = new Date(value.createdAt).toISOString().slice(0, 10);
  const filename = `lucy-${modelFree ? `${briefing ? 'work-briefing' : 'record-search'}${partial ? '-partial' : ''}` : 'research'}-${date}-${safeId}.txt`;
  return {text, filename, bytes};
}
