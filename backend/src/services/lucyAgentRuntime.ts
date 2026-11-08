/** Bounded orchestration for Lucy's existing tools. No network, database, or credentials here. */
export type LucyTool = {
  type: 'function'; name: string; description: string; parameters: any; strict: boolean;
};
export type LucyToolOutcome = {
  tool: string; success: boolean; result?: any; error?: string; reused?: boolean;
};
export type LucyRun = {
  text: string; model: string | null; status: 'completed' | 'partial' | 'ignored';
  stopReason?: 'provider_unavailable' | 'step_limit' | 'tool_limit' | 'time_limit' | 'invalid_response' | 'cancelled';
  outcomes: LucyToolOutcome[]; modelCalls: number;
};

export function validateLucyArguments(tool: LucyTool, raw: string): Record<string, any> {
  if (typeof raw !== 'string' || raw.length > 12000) throw new Error('Tool arguments exceed the allowed size');
  let value: any;
  try { value = JSON.parse(raw || '{}'); } catch { throw new Error('Tool arguments must be valid JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Tool arguments must be an object');
  const schema = tool.parameters;
  for (const key of schema.required || []) {
    if (!(key in value)) throw new Error(`Missing required argument: ${key}`);
  }
  for (const [key, field] of Object.entries(value)) {
    const spec = Object.prototype.hasOwnProperty.call(schema.properties || {}, key) && schema.properties[key];
    if (!spec) throw new Error(`Unknown argument: ${key}`);
    if (spec.type === 'string' && (typeof field !== 'string' || field.length > (spec.maxLength || 4000))) throw new Error(`Invalid text argument: ${key}`);
    if ((schema.required || []).includes(key) && typeof field === 'string' && !field.trim()) throw new Error(`Missing required argument: ${key}`);
    if (spec.type === 'number' && (typeof field !== 'number' || !Number.isFinite(field))) throw new Error(`Invalid number argument: ${key}`);
    if (spec.type === 'integer' && (typeof field !== 'number' || !Number.isInteger(field))) throw new Error(`Invalid integer argument: ${key}`);
    if (typeof field === 'number' && ((spec.minimum !== undefined && field < spec.minimum) || (spec.maximum !== undefined && field > spec.maximum))) throw new Error(`Argument out of range: ${key}`);
    if (spec.enum && !spec.enum.includes(field)) throw new Error(`Unsupported value for: ${key}`);
  }
  return value;
}

const canonical = (args: Record<string, any>) => JSON.stringify(Object.fromEntries(Object.entries(args).sort(([a], [b]) => a.localeCompare(b))));

export async function runLucyAgent(options: {
  instructions: string; input: any[]; tools: LucyTool[];
  respond: (request: {instructions: string; input: any[]; tools: LucyTool[]}) => Promise<any>;
  execute: (name: string, args: Record<string, any>) => Promise<any>;
  mutationTools: Set<string>; untrustedReadTools?: Set<string>;
  onOutcome?: (outcome: LucyToolOutcome) => Promise<void>;
  now?: () => number;
  shouldContinue?: () => Promise<boolean>;
}): Promise<LucyRun> {
  const now = options.now || Date.now, started = now();
  const input = [...options.input], outcomes: LucyToolOutcome[] = [];
  const definitions = new Map(options.tools.map(tool => [tool.name, tool]));
  const writes = new Map<string, Promise<LucyToolOutcome>>(), callIds = new Set<string>();
  let model: string | null = null, modelCalls = 0, toolCalls = 0, untrustedRead = false;
  const partial = (stopReason: LucyRun['stopReason']): LucyRun => ({text: '', model, status: 'partial', stopReason, outcomes, modelCalls});

  for (let step = 0; step < 6; step++) {
    if(options.shouldContinue && !await options.shouldContinue())return partial('cancelled');
    if (now() - started >= 90000) return partial('time_limit');
    let response: any;
    try {
      modelCalls++;
      // Keep the existing six-call ceiling. Reserve the last call for synthesis, not more actions.
      response = await options.respond({instructions: options.instructions + (step === 5 ? '\nNo more tools are available in this turn. Summarize verified results and explicitly identify unfinished work.' : ''), input, tools: step === 5 ? [] : options.tools});
    } catch (error) {
      if (!outcomes.length) throw error;
      return partial('provider_unavailable');
    }
    if (!response || typeof response !== 'object' || !Array.isArray(response.output)
      || response.output.some((item: any) => !item || typeof item !== 'object' || Array.isArray(item))) return partial('invalid_response');
    model = typeof response.model === 'string' ? response.model : model;
    if(['incomplete','failed','cancelled'].includes(response.status))return {...partial('invalid_response'),text:!response.output.some((item:any)=>item.type==='function_call')&&typeof response.output_text==='string'?response.output_text.trim():''};
    const calls = response.output.filter((item: any) => item.type === 'function_call');
    if (!calls.length) {
      const text = String(response.output_text || '').trim();
      if (!text || response.status === 'incomplete') return {...partial('invalid_response'), text};
      return {text, model, status: outcomes.some(item => !item.success) ? 'partial' : 'completed', outcomes, modelCalls};
    }
    if (step === 5) return partial('step_limit');
    if (toolCalls + calls.length > 24) return partial('tool_limit');
    // Validate the entire envelope before allowing any side effect.
    for (const call of calls) {
      if (typeof call.call_id !== 'string' || !call.call_id || call.call_id.length > 200 || callIds.has(call.call_id)
        || typeof call.name !== 'string' || !call.name || call.name.length > 100) return partial('invalid_response');
      callIds.add(call.call_id);
    }
    toolCalls += calls.length;
    if (calls.some((call: any) => options.untrustedReadTools?.has(call.name))) untrustedRead = true;
    input.push(...response.output);

    const invoke = async (call: any): Promise<LucyToolOutcome> => {
      let args: Record<string, any>;
      if(options.shouldContinue && !await options.shouldContinue())return {tool:call.name,success:false,error:'Work was cancelled or access changed'};
      try {
        const definition = definitions.get(call.name);
        if (!definition) throw new Error('This tool is not available for your role');
        args = validateLucyArguments(definition, call.arguments || '{}');
        if (untrustedRead && options.mutationTools.has(call.name)) throw new Error('Document and work-record lookup turns are read-only. Ask for the action in a separate message.');
      } catch (error: any) { return {tool: call.name, success: false, error: error.message}; }
      const key = `${call.name}:${canonical(args)}`;
      if (options.mutationTools.has(call.name) && writes.has(key)) return {...await writes.get(key)!, reused: true};
      const work = (async (): Promise<LucyToolOutcome> => {
        try { return {tool: call.name, success: true, result: await options.execute(call.name, args)}; }
        catch (error: any) { return {tool: call.name, success: false, error: error.message || 'Tool failed'}; }
      })();
      // Preserve failed/uncertain write outcomes too. Never automatically retry a write within a turn.
      if (options.mutationTools.has(call.name)) writes.set(key, work);
      return work;
    };

    for (let index = 0; index < calls.length;) {
      if(options.shouldContinue && !await options.shouldContinue())return partial('cancelled');
      if (now() - started >= 90000) return partial('time_limit');
      const batch: any[] = [calls[index++]];
      // Parallelize only adjacent reads, with at most three in flight. Writes preserve model order.
      if (!options.mutationTools.has(batch[0].name)) {
        while (batch.length < 3 && index < calls.length && !options.mutationTools.has(calls[index].name)) batch.push(calls[index++]);
      }
      const results = await Promise.all(batch.map(invoke));
      for (let i = 0; i < results.length; i++) {
        const outcome = results[i]; outcomes.push(outcome);
        if (!outcome.reused) await options.onOutcome?.(outcome);
        const serialized = JSON.stringify(outcome);
        // Return valid JSON with an explicit limitation, rather than silently cutting records mid-JSON.
        const output = serialized.length <= 20000 ? serialized : JSON.stringify({tool: outcome.tool, success: outcome.success, truncated: true, instruction: 'This is an incomplete evidence preview. Narrow the query; do not infer missing records or totals.', preview: serialized.slice(0,18000)});
        input.push({type: 'function_call_output', call_id: batch[i].call_id, output});
      }
    }
    if (calls.every((call: any) => call.name === 'ignore_ambient_speech') && outcomes.at(-1)?.success) {
      if (outcomes.every(item => item.tool === 'ignore_ambient_speech')) return {text: '', model, status: 'ignored', outcomes, modelCalls};
      // Ambient classification cannot erase records read or changed earlier in the request.
      return partial('invalid_response');
    }
  }
  return partial('step_limit');
}
