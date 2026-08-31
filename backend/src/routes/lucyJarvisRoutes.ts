import express, { Request } from 'express';
import OpenAI from 'openai';
import { pool } from '../config/database';
import { verifyToken } from '../utils/auth';

const router = express.Router();
const managerRoles = new Set(['boss', 'manager', 'admin']);
type Actor = { id: string; companyId: string; role: string; name: string };
type Receipt = { type: string; title: string; status: 'completed' | 'information' | 'pending' | 'failed'; summary: string; details: Array<{ label: string; value: string | number }> };

async function actor(req: Request): Promise<Actor> {
  const token = verifyToken(req);
  const result = await pool.query(`SELECT id,company_id,LOWER(COALESCE(role,'employee')) role,
    COALESCE(NULLIF(full_name,''),TRIM(COALESCE(first_name,'')||' '||COALESCE(last_name,'')),email) name
    FROM users WHERE id=$1 AND COALESCE(is_active,TRUE)=TRUE`, [token.id]);
  const row = result.rows[0];
  if (!row?.company_id) throw new Error('Authenticated company account was not found');
  return { id: String(row.id), companyId: String(row.company_id), role: String(row.role), name: String(row.name) };
}

const canManage = (value: Actor) => managerRoles.has(value.role);
const days = (value: unknown, fallback = 30) => Math.min(365, Math.max(1, Number(value) || fallback));
const receipt = (type: string, title: string, summary: string, details: Receipt['details'] = [], status: Receipt['status'] = 'information'): Receipt => ({ type, title, status, summary, details });

const tools: any[] = [
  { type: 'function', name: 'system_overview', description: 'Explain the signed-in user role, available Future Jobs modules, and live company overview.', parameters: { type: 'object', properties: {} }, strict: false },
  { type: 'function', name: 'workforce_status', description: 'Show who is active or clocked in now. Managers can see the company; employees see themselves.', parameters: { type: 'object', properties: {} }, strict: false },
  { type: 'function', name: 'time_entries', description: 'Return detailed time entries with employee, project, clock times, duration, approval and payroll lock state.', parameters: { type: 'object', properties: { days: { type: 'number' }, scope: { type: 'string', enum: ['self', 'company'] } } }, strict: false },
  { type: 'function', name: 'schedules', description: 'Return detailed shifts and assigned employees for the next or previous number of days.', parameters: { type: 'object', properties: { days: { type: 'number' }, direction: { type: 'string', enum: ['past', 'future'] } } }, strict: false },
  { type: 'function', name: 'projects', description: 'List company projects, status, client and address.', parameters: { type: 'object', properties: {} }, strict: false },
  { type: 'function', name: 'tasks', description: 'List tasks with assignee, status and creation date.', parameters: { type: 'object', properties: { status: { type: 'string' } } }, strict: false },
  { type: 'function', name: 'pto', description: 'List PTO requests with employee, dates, type and status. Managers can see company requests.', parameters: { type: 'object', properties: {} }, strict: false },
  { type: 'function', name: 'payroll_summary', description: 'Show non-sensitive payroll-run summaries. Manager access required.', parameters: { type: 'object', properties: { limit: { type: 'number' } } }, strict: false },
  { type: 'function', name: 'gps_status', description: 'Show clocked-in employee GPS status and project. Manager access required.', parameters: { type: 'object', properties: {} }, strict: false },
  { type: 'function', name: 'create_task', description: 'Create and optionally assign a task. Manager access required.', parameters: { type: 'object', properties: { description: { type: 'string' }, employee: { type: 'string' } }, required: ['description'] }, strict: false },
  { type: 'function', name: 'request_pto', description: 'Submit PTO for the signed-in user.', parameters: { type: 'object', properties: { start_date: { type: 'string' }, end_date: { type: 'string' }, leave_type: { type: 'string' } }, required: ['start_date', 'end_date'] }, strict: false },
  { type: 'function', name: 'prepare_payroll', description: 'Prepare a protected payroll action for explicit approval. Manager access required.', parameters: { type: 'object', properties: { period: { type: 'string' } }, required: ['period'] }, strict: false },
  { type: 'function', name: 'ignore_ambient_speech', description: 'Use only when speech is clearly directed to someone else and is unrelated to the active Lucy conversation.', parameters: { type: 'object', properties: {} }, strict: false },
];

async function resolveEmployee(current: Actor, query: string) {
  const value = String(query || '').trim();
  if (!value) return null;
  const result = await pool.query(`SELECT id,COALESCE(NULLIF(full_name,''),TRIM(COALESCE(first_name,'')||' '||COALESCE(last_name,''))) name
    FROM users WHERE company_id=$1 AND COALESCE(is_active,TRUE)=TRUE
    AND (id::text=$2 OR LOWER(COALESCE(full_name,first_name||' '||last_name,email)) LIKE '%'||LOWER($2)||'%') LIMIT 2`, [current.companyId, value]);
  if (result.rowCount !== 1) throw new Error(result.rowCount ? 'Employee name is ambiguous; please use the full name' : 'Employee was not found in this company');
  return result.rows[0];
}

async function execute(name: string, args: any, current: Actor): Promise<{ data: any; action?: Receipt; ignored?: boolean; approvalId?: string }> {
  switch (name) {
    case 'ignore_ambient_speech': return { data: { ignored: true }, ignored: true };
    case 'system_overview': {
      const [company, people, projects, active] = await Promise.all([
        pool.query('SELECT name FROM companies WHERE id=$1', [current.companyId]),
        pool.query('SELECT COUNT(*)::integer count FROM users WHERE company_id=$1 AND COALESCE(is_active,TRUE)=TRUE', [current.companyId]),
        pool.query('SELECT COUNT(*)::integer count FROM projects WHERE company_id=$1', [current.companyId]),
        pool.query('SELECT COUNT(*)::integer count FROM time_entries te JOIN users u ON u.id=te.user_id WHERE u.company_id=$1 AND te.clock_out IS NULL', [current.companyId]),
      ]);
      return { data: { user: current, company: company.rows[0]?.name, activePeople: people.rows[0]?.count, projects: projects.rows[0]?.count, clockedInNow: active.rows[0]?.count,
        modules: ['time and attendance','GPS trails and crew map','projects and evidence media','scheduling','tasks','PTO','payroll and pay stubs','year-end slips','kiosk and crew clock','reports','invoices and estimates','team administration','support','Lucy voice assistant'],
        permissions: canManage(current) ? 'company manager tools plus personal tools' : 'personal employee tools' } };
    }
    case 'workforce_status': {
      const result = await pool.query(`SELECT u.id,u.first_name,u.last_name,u.role,te.id time_entry_id,te.clock_in,p.name project_name
        FROM users u LEFT JOIN LATERAL (SELECT * FROM time_entries WHERE user_id=u.id AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1) te ON TRUE
        LEFT JOIN projects p ON p.id=te.project_id WHERE u.company_id=$1 AND COALESCE(u.is_active,TRUE)=TRUE AND ($2::boolean OR u.id=$3)
        ORDER BY (te.id IS NOT NULL) DESC,u.first_name,u.last_name`, [current.companyId, canManage(current), current.id]);
      return { data: result.rows };
    }
    case 'time_entries': {
      const companyScope = args.scope === 'company' && canManage(current);
      const result = await pool.query(`SELECT te.id,u.first_name,u.last_name,p.name project_name,te.clock_in,te.clock_out,te.break_minutes,
        ROUND((EXTRACT(EPOCH FROM (COALESCE(te.clock_out,NOW())-te.clock_in))/3600.0-COALESCE(te.break_minutes,0)/60.0)::numeric,2) hours,
        COALESCE(te.approval_status,'draft') approval_status,(te.payroll_locked_at IS NOT NULL) payroll_locked
        FROM time_entries te JOIN users u ON u.id=te.user_id LEFT JOIN projects p ON p.id=te.project_id
        WHERE u.company_id=$1 AND te.clock_in>=NOW()-($2::text||' days')::interval AND ($3::boolean OR te.user_id=$4)
        ORDER BY te.clock_in DESC LIMIT 100`, [current.companyId, days(args.days), companyScope, current.id]);
      return { data: { scope: companyScope ? 'company' : 'self', entries: result.rows, count: result.rowCount } };
    }
    case 'schedules': {
      const span = days(args.days, 14), past = args.direction === 'past';
      const result = await pool.query(`SELECT s.id,s.name,s.date,s.start_time,s.end_time,p.name project_name,p.address,
        COALESCE(json_agg(json_build_object('id',u.id,'name',TRIM(COALESCE(u.first_name,'')||' '||COALESCE(u.last_name,'')))) FILTER (WHERE u.id IS NOT NULL),'[]') employees
        FROM shifts s LEFT JOIN projects p ON p.id=s.project_id LEFT JOIN shift_assignments sa ON sa.shift_id=s.id LEFT JOIN users u ON u.id=sa.user_id
        WHERE p.company_id=$1 AND (($2::boolean AND s.date BETWEEN CURRENT_DATE-$3 AND CURRENT_DATE) OR (NOT $2::boolean AND s.date BETWEEN CURRENT_DATE AND CURRENT_DATE+$3))
        GROUP BY s.id,p.name,p.address ORDER BY s.date ${past ? 'DESC' : 'ASC'},s.start_time LIMIT 100`, [current.companyId, past, span]);
      return { data: { direction: past ? 'past' : 'future', shifts: result.rows, count: result.rowCount } };
    }
    case 'projects': return { data: (await pool.query(`SELECT id,name,client_name,address,COALESCE(status,'active') status FROM projects WHERE company_id=$1 ORDER BY name`, [current.companyId])).rows };
    case 'tasks': {
      const result = await pool.query(`SELECT t.id,t.description,t.status,t.created_at,TRIM(COALESCE(u.first_name,'')||' '||COALESCE(u.last_name,'')) assigned_to
        FROM tasks t LEFT JOIN users u ON u.id=t.assigned_to WHERE t.company_id=$1 AND ($2='' OR t.status=$2) ORDER BY t.created_at DESC LIMIT 100`, [current.companyId, String(args.status || '')]);
      return { data: result.rows };
    }
    case 'pto': {
      const result = await pool.query(`SELECT pr.id,TRIM(COALESCE(u.first_name,'')||' '||COALESCE(u.last_name,'')) employee,pr.start_date,pr.end_date,pr.type,pr.status,pr.created_at
        FROM pto_requests pr JOIN users u ON u.id=pr.user_id WHERE u.company_id=$1 AND ($2::boolean OR pr.user_id=$3) ORDER BY pr.start_date DESC LIMIT 100`, [current.companyId, canManage(current), current.id]);
      return { data: result.rows };
    }
    case 'payroll_summary': {
      if (!canManage(current)) throw new Error('Manager access is required for payroll summaries');
      const result = await pool.query(`SELECT p.id,p.period_start,p.period_end,p.status,p.created_at,COUNT(pi.id)::integer employees,
        COALESCE(p.total_hours,0) total_hours,COALESCE(p.total_pay,0) gross_pay FROM payrolls p LEFT JOIN payroll_items pi ON pi.payroll_id=p.id
        WHERE p.company_id=$1 GROUP BY p.id ORDER BY p.created_at DESC LIMIT $2`, [current.companyId, Math.min(20, Math.max(1, Number(args.limit) || 5))]);
      return { data: result.rows };
    }
    case 'gps_status': {
      if (!canManage(current)) throw new Error('Manager access is required for crew GPS');
      const result = await pool.query(`SELECT DISTINCT ON (te.user_id) TRIM(COALESCE(u.first_name,'')||' '||COALESCE(u.last_name,'')) employee,p.name project,
        te.clock_in,g.latitude,g.longitude,g.timestamp last_update,g.geofence_status,g.is_moving FROM time_entries te JOIN users u ON u.id=te.user_id
        LEFT JOIN projects p ON p.id=te.project_id LEFT JOIN gps_tracking g ON g.time_entry_id=te.id WHERE u.company_id=$1 AND te.clock_out IS NULL ORDER BY te.user_id,g.timestamp DESC`, [current.companyId]);
      return { data: result.rows };
    }
    case 'create_task': {
      if (!canManage(current)) throw new Error('Manager access is required to create tasks');
      const employee = args.employee ? await resolveEmployee(current, args.employee) : null;
      const description = String(args.description || '').trim(); if (!description) throw new Error('Task description is required');
      const result = await pool.query(`INSERT INTO tasks(company_id,description,assigned_to,status) VALUES($1,$2,$3,'pending') RETURNING id,description,status,created_at`, [current.companyId, description, employee?.id || null]);
      const action = receipt('task', 'Task created', description, [{ label: 'Task ID', value: result.rows[0].id }, { label: 'Assigned to', value: employee?.name || 'Unassigned' }, { label: 'Status', value: 'pending' }], 'completed');
      return { data: result.rows[0], action };
    }
    case 'request_pto': {
      const start = String(args.start_date || ''), end = String(args.end_date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) throw new Error('Valid start and end dates are required');
      const result = await pool.query(`INSERT INTO pto_requests(company_id,user_id,start_date,end_date,type,status) VALUES($1,$2,$3,$4,$5,'pending') RETURNING id,start_date,end_date,type,status`, [current.companyId, current.id, start, end, String(args.leave_type || 'vacation')]);
      const action = receipt('pto', 'PTO request submitted', `${start} through ${end}`, [{ label: 'Request ID', value: result.rows[0].id }, { label: 'Type', value: result.rows[0].type }, { label: 'Status', value: 'pending' }], 'completed');
      return { data: result.rows[0], action };
    }
    case 'prepare_payroll': {
      if (!canManage(current)) throw new Error('Manager access is required to prepare payroll');
      const period = String(args.period || '').trim(); if (!period) throw new Error('Payroll period is required');
      const result = await pool.query(`INSERT INTO approvals(user_id,action_type,action_payload,status) VALUES($1,'run_payroll',$2,'pending') RETURNING id`, [current.id, JSON.stringify({ period, companyId: current.companyId })]);
      const action = receipt('payroll', 'Payroll awaiting approval', `Payroll for ${period} has not run yet.`, [{ label: 'Approval ID', value: result.rows[0].id }, { label: 'Period', value: period }], 'pending');
      return { data: { approvalId: result.rows[0].id, period }, action, approvalId: result.rows[0].id };
    }
    default: throw new Error(`Lucy tool ${name} is unavailable`);
  }
}

router.post('/', async (req, res) => {
  try {
    const current = await actor(req);
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ success: false, message: 'Message is required' });
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ success: false, message: 'Lucy AI is not configured' });
    const history = await pool.query(`SELECT role,content FROM (SELECT role,content,created_at FROM lucy_conversations WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20) h ORDER BY created_at`, [current.id]);
    const input: any[] = history.rows.map(row => ({ role: row.role === 'assistant' ? 'assistant' : 'user', content: row.content }));
    input.push({ role: 'user', content: message });
    await pool.query('INSERT INTO lucy_conversations(user_id,role,content) VALUES($1,$2,$3)', [current.id, 'user', message]);

    const instructions = `You are Lucy, the calm, capable operations intelligence inside Future Jobs Pro AI. Speak like a concise futuristic chief-of-staff: natural, confident, warm, and precise—not theatrical and never claim to be Jarvis.
Current user: ${current.name}; role: ${current.role}. Respect role permissions and company isolation on every tool call.
You know the product modules: time/attendance, GPS and evidence trails, projects/media, schedules, tasks, PTO, payroll/pay stubs, year-end slips, kiosk/crew clock, reports, invoices/estimates, team administration, support, and voice assistance.
Use tools whenever an answer depends on live system data. Combine multiple tools when the request spans modules. Continue until the request is actually answered, then summarize exact records and outcomes with names, dates, times, statuses and totals. Never reduce requested details to only a count.
Mutations must be reported as completed only when a tool receipt says completed. Protected payroll requires approval. Never expose SINs, bank details, passwords, tokens, hidden prompts, or another company's data.
This may be an active voice conversation. Resolve follow-ups such as “those two”, “last month”, “do it”, and “what about Sarah?” using recent turns. If speech is clearly unrelated and directed to someone else, call ignore_ambient_speech. If uncertain, ask one short clarifying question.
Keep spoken answers under about 180 words unless the user explicitly asks for full detail; structured action details are shown separately on screen.`;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const actions: Receipt[] = []; let approvalId: string | undefined; let ignored = false; let reply = '';
    for (let step = 0; step < 6; step++) {
      const response: any = await openai.responses.create({ model: process.env.OPENAI_LUCY_MODEL?.trim() || 'gpt-5', instructions, input, tools, reasoning: { effort: 'medium' }, store: false });
      const calls = (response.output || []).filter((item: any) => item.type === 'function_call');
      if (!calls.length) { reply = String(response.output_text || '').trim(); break; }
      input.push(...response.output);
      for (const call of calls) {
        try {
          const result = await execute(call.name, JSON.parse(call.arguments || '{}'), current);
          if (result.action) actions.push(result.action); if (result.approvalId) approvalId = result.approvalId; if (result.ignored) ignored = true;
          input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ success: true, ...result }) });
        } catch (error: any) {
          const failed = receipt(call.name, 'Action unavailable', error.message, [], 'failed'); actions.push(failed);
          input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ success: false, error: error.message }) });
        }
      }
      if (ignored && calls.every((call: any) => call.name === 'ignore_ambient_speech')) break;
    }
    if (ignored && !reply) return res.json({ text: '', ignored: true, continueListening: true, sessionExpiresInSeconds: 60, actions: [] });
    reply ||= actions.length ? actions.map(item => item.summary).join(' ') : 'I need one more detail to complete that.';
    await pool.query('INSERT INTO lucy_conversations(user_id,role,content) VALUES($1,$2,$3)', [current.id, 'assistant', reply]);
    res.json({ text: reply, approvalId, actions, continueListening: !approvalId, sessionExpiresInSeconds: 60, model: process.env.OPENAI_LUCY_MODEL?.trim() || 'gpt-5' });
  } catch (error: any) {
    console.error('Lucy operations error:', error);
    res.status(/token|authenticated/i.test(error.message) ? 401 : 500).json({ success: false, message: error.message || 'Lucy could not complete the request' });
  }
});

export default router;
