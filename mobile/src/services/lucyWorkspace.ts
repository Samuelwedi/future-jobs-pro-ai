/** User-operated controls only. Preferences never grant authorization. */
export const preferenceOptions = {
  response_style: ['concise', 'conversational', 'formal'], detail_level: ['summary', 'balanced', 'detailed'],
  focus_area: ['tasks', 'schedules', 'projects', 'approvals'], language: ['en', 'es', 'fr', 'pt'],
  week_start: ['monday', 'sunday'], time_format: ['12h', '24h'],
} as const;
export type PreferenceKey = keyof typeof preferenceOptions;
export type Preference = {key: PreferenceKey; value: string; expiresAt: string};
export type Work = {id: string; prompt: string; status: 'queued'|'running'|'completed'|'partial'|'failed'|'cancelled'; createdAt: string; result?: {text: string; run?: unknown}|null; error?: string|null};
type Client = {get: (url: string) => Promise<any>; put: (url: string, data: any) => Promise<any>; post: (url: string, data?: any) => Promise<any>; delete: (url: string) => Promise<unknown>};
export type WorkspaceState = {preferences: Preference[]; jobs: Work[]; enabled: boolean|null; ready: boolean; loading: boolean; busy: boolean; error: string; prompt: string; choices: Partial<Record<PreferenceKey,string>>};
const root = '/lucy-v2';
export class LucyWorkspaceController {
  private state: WorkspaceState = {preferences: [], jobs: [], enabled: null, ready: false, loading: false, busy: false, error: '', prompt: '', choices: {}};
  private listeners = new Set<() => void>();
  private active = false;
  private epoch = 0;
  private read = 0;
  private locked = false;
  private timer: ReturnType<typeof setInterval>|undefined;
  private requests = new Map<string,string>();
  constructor(private client: Client) {}
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {this.listeners.add(listener); return () => {this.listeners.delete(listener);};};
  private patch(update: Partial<WorkspaceState>) {this.state = {...this.state, ...update}; this.listeners.forEach(listener => listener());}
  open() {
    if (this.active) return;
    this.active = true; this.epoch++;
    void this.refresh();
    this.timer = setInterval(() => {if (!this.state.loading && this.state.jobs.some(job => job.status === 'queued' || job.status === 'running')) void this.refresh();}, 5000);
  }
  close() {
    this.active = false; this.epoch++; this.read++;
    clearInterval(this.timer); this.timer = undefined;
    // Keep unsent drafts and uncertain request keys within this authenticated session.
    this.patch({loading: false});
  }
  setPrompt(prompt: string) {if (!this.locked) this.patch({prompt: prompt.slice(0,4000)});}
  choose(key: PreferenceKey, value: string) {if (!this.locked) this.patch({choices: {...this.state.choices,[key]: value}});}
  async refresh() {
    if (!this.active || this.locked) return;
    const epoch = this.epoch, read = ++this.read;
    this.patch({loading: true, error: ''});
    const results = await Promise.allSettled([this.client.get(root + '/preferences'), this.client.get(root + '/work')]);
    if (!this.active || epoch !== this.epoch || read !== this.read) return;
    const [preferences, work] = results;
    this.patch({loading: false,
      ...(preferences.status === 'fulfilled' ? {preferences: preferences.value.preferences, ready: true} : {preferences: [], ready: false}),
      ...(work.status === 'fulfilled' ? {jobs: work.value.jobs, enabled: work.value.enabled === true} : {jobs: [], enabled: null}),
      error: results.some(result => result.status === 'rejected') ? 'loadError' : '',
    });
  }
  private async mutate(work: () => Promise<void>) {
    if (!this.active || this.locked) return;
    this.locked = true; this.read++;
    const epoch = this.epoch;
    this.patch({busy: true, loading: false, error: ''});
    try {await work();}
    catch {if (this.active && epoch === this.epoch) this.patch({error: 'saveError'});}
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
      if (this.active && epoch === this.epoch) this.patch({preferences: [...this.state.preferences.filter(item => item.key !== key),data.preference]});
    });
  }
  forget(key: PreferenceKey) {
    return this.mutate(async () => {
      const epoch = this.epoch;
      await this.client.delete(root + '/preferences/' + key);
      if (this.active && epoch === this.epoch) {
        const choices = {...this.state.choices}; delete choices[key];
        this.patch({preferences: this.state.preferences.filter(item => item.key !== key),choices});
      }
    });
  }
  create() {
    const prompt = this.state.prompt.trim();
    if (!prompt || this.state.enabled !== true) return Promise.resolve();
    return this.mutate(async () => {
      const epoch = this.epoch;
      let requestKey = this.requests.get(prompt);
      if (!requestKey) {
        requestKey = `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
        this.requests.set(prompt,requestKey);
      }
      const data = await this.client.post(root + '/work', {prompt,requestKey});
      // Retain the key until this session can show the acknowledgement. Hidden/late
      // responses remain retry-safe; a deliberately repeated acknowledged task is new work.
      if (this.active && epoch === this.epoch) {
        this.requests.delete(prompt);
        this.patch({jobs: [data.job,...this.state.jobs.filter(job => job.id !== data.job.id)],prompt: ''});
      }
    });
  }
  cancel(id: string) {
    if (!this.state.jobs.some(job => job.id === id && ['queued','running'].includes(job.status))) return Promise.resolve();
    return this.mutate(async () => {
      const epoch = this.epoch;
      const data = await this.client.post(root + '/work/' + encodeURIComponent(id) + '/cancel');
      if (this.active && epoch === this.epoch) this.patch({jobs: this.state.jobs.map(job => job.id === id ? data.job : job)});
    });
  }
}
