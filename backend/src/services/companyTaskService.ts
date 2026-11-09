import { pool } from '../config/database';
import { CompanyActor, manages } from '../middleware/companyActor';

export class TaskInputError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Shared by direct task creation and Lucy. A model-supplied assignee is never authority. */
export async function createCompanyTask(actor: CompanyActor, description: unknown, requestedAssignee?: unknown, notifyAssignee = false) {
  if (!manages(actor)) throw new TaskInputError(403, 'Manager access is required to create tasks');
  if (typeof description !== 'string' || !description.trim() || description.length > 4000) {
    throw new TaskInputError(400, 'Task description must contain 1–4,000 characters');
  }
  const rawAssignee = requestedAssignee === undefined || requestedAssignee === null || requestedAssignee === '' ? null : requestedAssignee;
  if (rawAssignee !== null && (typeof rawAssignee !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawAssignee))) {
    throw new TaskInputError(400, 'A valid employee ID is required');
  }
  const assignedTo = typeof rawAssignee === 'string' ? rawAssignee.toLowerCase() : null;
  const actorId = actor.id.toLowerCase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Stable lock order also protects against moving/deactivating the assignee
    // between validation and INSERT, without opposite-assignment deadlocks.
    const members = await client.query(`SELECT id,LOWER(COALESCE(role,'employee')) role FROM users
      WHERE id=ANY($1::uuid[]) AND company_id=$2 AND COALESCE(is_active,TRUE)=TRUE ORDER BY id FOR UPDATE`,
    [[...new Set([actorId, ...(assignedTo ? [assignedTo] : [])])].sort(), actor.company_id]);
    const current = members.rows.find(row => String(row.id) === actorId);
    if (!current || current.role !== actor.role || !manages({...actor, role: current.role})) {
      throw new TaskInputError(403, 'Your company access has changed');
    }
    if (assignedTo && !members.rows.some(row => String(row.id) === assignedTo)) {
      throw new TaskInputError(404, 'Employee was not found in this company');
    }
    const result = await client.query(`INSERT INTO tasks(company_id,description,assigned_to,status)
      VALUES($1,$2,$3,'pending') RETURNING *`, [actor.company_id, description.trim(), assignedTo]);
    if (notifyAssignee && assignedTo) {
      await client.query(`INSERT INTO in_app_notifications(company_id,user_id,title,message,notification_type,action_url)
        VALUES($1,$2,'New task assigned',$3,'task','/tasks')`, [actor.company_id, assignedTo, description.trim()]);
    }
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
