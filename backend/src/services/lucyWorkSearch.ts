import { pool } from '../config/database';
import { CompanyActor, manages } from '../middleware/companyActor';

/** Literal, bounded cross-module search. Database content is evidence, never executable instructions. */
export async function searchLucyWork(actor: CompanyActor, args: {query: string; scope?: string; limit?: number}) {
  const query = args.query?.trim();
  if (!query || query.length > 200) throw new Error('Search needs 1–200 characters');
  const scope = args.scope || 'all', limit = args.limit ?? 20;
  if (!['all', 'tasks', 'projects', 'schedules'].includes(scope)) throw new Error('Unsupported search scope');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Search limit must be 1–50');
  const records = await pool.query(`
    SELECT * FROM (
      SELECT 'task' kind,t.id,t.description title,t.status,
        json_build_object('assignedTo',COALESCE(u.full_name,TRIM(COALESCE(u.first_name,'')||' '||COALESCE(u.last_name,''))), 'createdAt',t.created_at) details
      FROM tasks t LEFT JOIN users u ON u.id=t.assigned_to AND u.company_id=t.company_id
      WHERE t.company_id=$1 AND ($3::boolean OR t.assigned_to=$2)
        AND $5 IN ('all','tasks') AND strpos(lower(concat_ws(' ',t.description,t.status,u.full_name,u.first_name,u.last_name)),lower($4))>0
      UNION ALL
      SELECT 'project',p.id,p.name,p.status,json_build_object('client',p.client_name)
      FROM projects p WHERE p.company_id=$1 AND $5 IN ('all','projects')
        AND ($3::boolean OR EXISTS(SELECT 1 FROM shifts s JOIN shift_assignments sa ON sa.shift_id=s.id WHERE s.project_id=p.id AND sa.user_id=$2)
          OR EXISTS(SELECT 1 FROM time_entries te WHERE te.project_id=p.id AND te.user_id=$2))
        AND strpos(lower(concat_ws(' ',p.name,p.client_name,p.status)),lower($4))>0
      UNION ALL
      SELECT 'schedule',s.id,COALESCE(s.name,p.name),'scheduled',json_build_object('date',s.date,'startTime',s.start_time,'endTime',s.end_time,'project',p.name)
      FROM shifts s JOIN projects p ON p.id=s.project_id
      WHERE p.company_id=$1 AND $5 IN ('all','schedules')
        AND ($3::boolean OR EXISTS(SELECT 1 FROM shift_assignments sa WHERE sa.shift_id=s.id AND sa.user_id=$2))
        AND strpos(lower(concat_ws(' ',s.name,p.name,s.date::text)),lower($4))>0
    ) results ORDER BY kind,title,id LIMIT $6`, [actor.company_id, actor.id, manages(actor), query, scope, limit + 1]);
  return {query, scope, access: manages(actor) ? 'company' : 'assigned_work', records: records.rows.slice(0,limit),
    hasMore: records.rows.length > limit, limit, source: 'Future Jobs work records', retrievedAt: new Date().toISOString()};
}
