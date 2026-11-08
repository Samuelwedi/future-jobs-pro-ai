import type {LucyEvidence} from '../utils/lucyEvidence';
import {buildLucyWorkReport, readLucyWorkModes, type LucyWorkMode, type LucyWorkModes} from '../utils/lucyWorkReport';
import type {LucyReportSharing, TemporaryLucyReport} from './lucyReportSharing';

/** User-operated controls only. Preferences never grant authorization. */
export const preferenceOptions = {
  response_style: ['concise', 'conversational', 'formal'], detail_level: ['summary', 'balanced', 'detailed'],
  focus_area: ['tasks', 'schedules', 'projects', 'approvals'], language: ['en', 'es', 'fr', 'pt'],
  week_start: ['monday', 'sunday'], time_format: ['12h', '24h'],
} as const;
export type PreferenceKey = keyof typeof preferenceOptions;
export type Preference = {key: PreferenceKey; value: string; expiresAt: string};
export type Work = {id: string; prompt: string; status: 'queued'|'running'|'completed'|'partial'|'failed'|'cancelled'; createdAt: string; updatedAt?: string; completedAt?: string|null; mode?: LucyWorkMode; result?: {text: string; run?: unknown; evidence?: LucyEvidence}|null; error?: string|null};
type Client = {get: (url: string) => Promise<any>; put: (url: string, data: any) => Promise<any>; post: (url: string, data?: any) => Promise<any>; delete: (url: string) => Promise<unknown>};
export type WorkspaceState = {preferences: Preference[]; jobs: Work[]; enabled: boolean|null; modes: LucyWorkModes|null; mode: LucyWorkMode; ready: boolean; loading: boolean; busy: boolean; error: string; prompt: string; choices: Partial<Record<PreferenceKey,string>>};
const root = '/lucy-v2';
export class LucyWorkspaceController {
  private state: WorkspaceState = {preferences: [], jobs: [], enabled: null, modes: null, mode: 'ai_research', ready: false, loading: false, busy: false, error: '', prompt: '', choices: {}};
  private listeners = new Set<() => void>();
  private active = false;
  private epoch = 0;
  private read = 0;
  private locked = false;
  private timer: ReturnType<typeof setInterval>|undefined;
  private requests = new Map<string,string>();
  private selectedMode: LucyWorkMode|null = null;
  constructor(private client: Client, private sharing?: LucyReportSharing, private inScope: () => boolean = () => true) {}
  private current(epoch = this.epoch) {return this.active && epoch === this.epoch && this.inScope();}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {this.listeners.add(listener); return () => {this.listeners.delete(listener);};};
  private patch(update: Partial<WorkspaceState>) {this.state = {...this.state, ...update}; this.listeners.forEach(listener => listener());}
  open() {
    if (this.active || !this.inScope()) return;
    this.active = true; this.epoch++;
    // Retained drafts are session-local; results must be reloaded after reopening.
    this.patch({jobs: [], modes: null, enabled: null});
    void this.refresh();
    this.timer = setInterval(() => {if (!this.state.loading && this.state.jobs.some(job => job.status === 'queued' || job.status === 'running')) void this.refresh();}, 5000);
  }
  close() {
    this.active = false; this.epoch++; this.read++;
    clearInterval(this.timer); this.timer = undefined;
    // Keep unsent drafts and uncertain request keys within this authenticated session.
    this.patch({loading: false});
  }
  setPrompt(prompt: string) {if (!this.locked) this.patch({prompt: prompt.slice(0,this.state.mode === 'record_search' ? 200 : 4000)});}
  setMode(mode: LucyWorkMode) {
    if (this.locked || !this.current() || this.state.modes?.[mode] !== true) return;
    this.selectedMode = mode;
    // Do not truncate a longer draft when switching to a short keyword search.
    this.patch({mode, enabled: true});
  }
  choose(key: PreferenceKey, value: string) {if (!this.locked) this.patch({choices: {...this.state.choices,[key]: value}});}
  async refresh() {
    if (!this.current() || this.locked) return;
    const epoch = this.epoch, read = ++this.read;
    this.patch({loading: true, error: ''});
    const results = await Promise.allSettled([this.client.get(root + '/preferences'), this.client.get(root + '/work')]);
    if (!this.current(epoch) || read !== this.read) return;
    const [preferences, work] = results;
    const modes = work.status === 'fulfilled' ? readLucyWorkModes(work.value) : null;
    const mode = this.selectedMode ?? (modes?.record_search ? 'record_search' : 'ai_research');
    this.patch({loading: false,
      ...(preferences.status === 'fulfilled' ? {preferences: preferences.value.preferences, ready: true} : {preferences: [], ready: false}),
      ...(work.status === 'fulfilled' ? {jobs: Array.isArray(work.value?.jobs) ? work.value.jobs : [], modes, mode, enabled: modes?.[mode] === true} : {jobs: [], modes: null, enabled: null}),
      error: results.some(result => result.status === 'rejected') ? 'loadError' : '',
    });
  }
  private async mutate(work: () => Promise<void>, error = 'saveError') {
    if (!this.current() || this.locked) return;
    this.locked = true; this.read++;
    const epoch = this.epoch;
    this.patch({busy: true, loading: false, error: ''});
    try {await work();}
    catch {if (this.current(epoch)) this.patch({error});}
    finally {
      this.locked = false; this.patch({busy: false});
      // A reopened panel must reconcile an operation that finished while hidden.
      if (this.active && epoch !== this.epoch) void this.refresh();
    }
  }
  save(key: PreferenceKey) {
    const value = this.state.choices[key] ?? this.state.preferences.find(item => item.key === key && Date.parse(item.expiresAt) > Date.now())?.value ?? preferenceOptions[key][0];
    return this.mutate(async () => {
      const epoch = this.epoch;
      const data = await this.client.put(root + '/preferences/' + key, {value, expiresAt: new Date(Date.now() + 30*86400000).toISOString()});
      if (this.current(epoch)) this.patch({preferences: [...this.state.preferences.filter(item => item.key !== key),data.preference]});
    });
  }
  forget(key: PreferenceKey) {
    return this.mutate(async () => {
      const epoch = this.epoch;
      await this.client.delete(root + '/preferences/' + key);
      if (this.current(epoch)) {
        const choices = {...this.state.choices}; delete choices[key];
        this.patch({preferences: this.state.preferences.filter(item => item.key !== key),choices});
      }
    });
  }
  create() {
    const prompt = this.state.prompt.trim(), mode = this.state.mode;
    if (!prompt || this.state.prompt.length > (mode === 'record_search' ? 200 : 4000) || this.state.enabled !== true || !this.state.modes) return Promise.resolve();
    const explicit = this.state.modes.explicit;
    const identity = JSON.stringify([mode, prompt]);
    return this.mutate(async () => {
      const epoch = this.epoch;
      this.selectedMode = mode;
      let requestKey = this.requests.get(identity);
      if (!requestKey) {
        requestKey = `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
        this.requests.set(identity,requestKey);
      }
      const data = await this.client.post(root + '/work', {prompt,requestKey,...(explicit ? {mode} : {})});
      // Retain the key until this session can show the acknowledgement. Hidden/late
      // responses remain retry-safe; a deliberately repeated acknowledged task is new work.
      if (this.current(epoch)) {
        this.requests.delete(identity);
        this.patch({jobs: [data.job,...this.state.jobs.filter(job => job.id !== data.job.id)],prompt: ''});
      }
    });
  }
  shareReport(job: Work, language = 'en', title = 'Lucy report (.txt)') {
    if (this.state.loading || !this.sharing || !this.state.jobs.includes(job)) return Promise.resolve();
    return this.mutate(async () => {
      const epoch = this.epoch;
      const authorized = () => this.current(epoch) && this.state.jobs.includes(job);
      if (!authorized()) return;
      const report = buildLucyWorkReport(job, language);
      const available = await this.sharing!.isAvailable();
      if (!authorized()) return;
      if (!available) {this.patch({error: 'shareUnavailable'}); return;}
      let temporary: TemporaryLucyReport|undefined;
      try {
        temporary = await this.sharing!.createTemporary(report);
        if (!authorized()) return;
        // The OS sheet is the only destination chooser. Never auto-send or upload.
        await temporary.share(title);
      } finally {
        // Keep the file alive while the sheet is open, even if the app backgrounds.
        // Cleanup also runs after close, account change, cancellation or native error.
        await temporary?.cleanup();
      }
    }, 'shareError');
  }
  cancel(id: string) {
    if (!this.state.jobs.some(job => job.id === id && ['queued','running'].includes(job.status))) return Promise.resolve();
    return this.mutate(async () => {
      const epoch = this.epoch;
      const data = await this.client.post(root + '/work/' + encodeURIComponent(id) + '/cancel');
      if (this.current(epoch)) this.patch({jobs: this.state.jobs.map(job => job.id === id ? data.job : job)});
    });
  }
}
