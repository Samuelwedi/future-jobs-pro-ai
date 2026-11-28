import { pool } from '../config/database';

const limits = { job_title: 100, department: 100, job_description: 500 } as const;
const fields = Object.keys(limits) as (keyof typeof limits)[];
type Details = Record<keyof typeof limits, string | null>;
const reject = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }); };
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const canEdit = (actor: string, target: string, self: boolean) =>
  actor === 'boss' ? ['boss','manager','admin','employee','worker'].includes(target) && (target !== 'boss' || self) :
  actor === 'admin' ? ['manager','admin','employee','worker'].includes(target) :
  actor === 'manager' && ['employee','worker'].includes(target);

function parseDetails(input: unknown, previous?: Details): Details {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 3) {
    return reject(400, 'Provide the three job detail fields.');
  }
  const candidate = input as Record<string, unknown>;
  return Object.fromEntries(fields.map(key => {
    if (!Object.prototype.hasOwnProperty.call(candidate, key)) return reject(400, 'Field is missing.');
    const value = candidate[key];
    if (value === null) return [key, null];
    const normalize = !!previous && value !== previous[key];
    if (typeof value !== 'string' || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value) ||
      (normalize && key !== 'job_description' && /[\r\n\t]/u.test(value))) {
      return reject(400, 'Invalid job details.');
    }
    // Preserve exact previous legacy values in the compare-and-set, including spaces.
    const next = normalize ? value.trim() || null : value;
    if (next !== null && [...next].length > (normalize ? limits[key] : 8192)) {
      return reject(400, 'A job detail is too long.');
    }
    return [key, next];
  })) as Details;
}

export async function updateTeamJobDetails(actorId: string, targetId: string, body: any) {
  if (!uuid.test(targetId)) return reject(404, 'Team member not found.');
  const { expectedActorId, expectedCompanyId, previous, details } = body || {};
  if (expectedActorId !== actorId || typeof expectedCompanyId !== 'string' || !uuid.test(expectedCompanyId)) {
    return reject(403, 'Team account changed.');
  }
  if (Object.keys(body).some(key => !['expectedActorId','expectedCompanyId','previous','details'].includes(key))) {
    return reject(400, 'Only job details can be changed here.');
  }
  const old = parseDetails(previous), next = parseDetails(details, old);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = [...new Set([actorId,targetId])];
    // A consistent lock order avoids competing editors acquiring these rows in opposite orders.
    const result = await client.query(
      `SELECT id, company_id, LOWER(role) AS role, job_title, department, job_description
         FROM users WHERE id=ANY($1::uuid[]) AND company_id=$2 AND COALESCE(is_active,TRUE)
         ORDER BY id FOR UPDATE`, [ids,expectedCompanyId],
    );
    const actor = result.rows.find(row => row.id === actorId);
    const target = result.rows.find(row => row.id === targetId);
    if (!actor || !['boss','admin','manager'].includes(actor.role)) return reject(403,'Team account changed or manager access is required.');
    if (!target) return reject(404,'Team member not found.');
    if (!canEdit(actor.role,target.role,actor.id===target.id)) return reject(403,'This team member cannot be edited by your account.');
    const unchanged = fields.every(key => target[key] === next[key]);
    if (!unchanged && fields.some(key => target[key] !== old[key])) {
      return reject(409, 'Job details changed. Reopen this team member to review them.');
    }
    const saved = unchanged ? { id: target.id, ...next } : (await client.query(
      `UPDATE users SET job_title=$1, department=$2, job_description=$3
        WHERE id=$4 AND company_id=$5 RETURNING id, job_title, department, job_description`,
      [next.job_title,next.department,next.job_description,targetId,expectedCompanyId],
    )).rows[0];
    if (!saved) return reject(409,'Job details could not be confirmed.');
    await client.query('COMMIT');
    return saved as Details & { id: string };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
