// ============================================
// TASK SERVICE
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import { pool } from '../config/database';

export interface Task {
  id: string;
  project_id: string;
  company_id: string;
  name: string;
  description?: string;
  status: string;
  assigned_to?: string;
  estimated_hours?: number;
  created_by?: string;
  created_at: string;
}

// Create a task
export async function createTask(
  projectId: string,
  companyId: string,
  name: string,
  createdBy: string,
  description?: string,
  assignedTo?: string,
  estimatedHours?: number
): Promise<Task> {
  const result = await pool.query(
    `INSERT INTO tasks (project_id, company_id, name, description, assigned_to, estimated_hours, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [projectId, companyId, name, description || null, assignedTo || null, estimatedHours || null, createdBy]
  );
  return result.rows[0];
}

// Update a task
export async function updateTask(
  taskId: string,
  updates: {
    name?: string;
    description?: string;
    status?: string;
    assigned_to?: string;
    estimated_hours?: number;
  }
): Promise<Task> {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }
  }
  if (fields.length === 0) throw new Error('No fields to update');
  values.push(taskId);
  const result = await pool.query(
    `UPDATE tasks SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0];
}

// Get all tasks for a project
export async function getProjectTasks(projectId: string): Promise<Task[]> {
  const result = await pool.query(
    `SELECT t.*, u.first_name || ' ' || u.last_name as assigned_name
     FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id
     WHERE t.project_id = $1 ORDER BY t.created_at DESC`,
    [projectId]
  );
  return result.rows;
}

// Get tasks assigned to a specific user
export async function getUserTasks(userId: string): Promise<Task[]> {
  const result = await pool.query(
    `SELECT t.*, p.name as project_name
     FROM tasks t JOIN projects p ON t.project_id = p.id
     WHERE t.assigned_to = $1 AND t.status != 'completed'
     ORDER BY t.created_at DESC`,
    [userId]
  );
  return result.rows;
}

console.log('📋 Task Service loaded – Future Jobs Pro AI by Samuel B.');