// ============================================
// FORM SERVICE
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import { pool } from '../config/database';

export interface FormTemplate {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  fields: FormField[];
  created_by?: string;
  created_at: string;
}

export interface FormField {
  label: string;
  type: 'text' | 'number' | 'checkbox' | 'select' | 'signature' | 'photo';
  required: boolean;
  options?: string[];  // for select type
}

export interface FormSubmission {
  id: string;
  template_id: string;
  time_entry_id?: string;
  user_id: string;
  company_id: string;
  answers: Record<string, any>;
  submitted_at: string;
}

// Create a form template
export async function createFormTemplate(
  companyId: string,
  name: string,
  createdBy: string,
  description?: string,
  fields: FormField[] = []
): Promise<FormTemplate> {
  const result = await pool.query(
    `INSERT INTO form_templates (company_id, name, description, fields, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [companyId, name, description || null, JSON.stringify(fields), createdBy]
  );
  return result.rows[0];
}

// Get all form templates for a company
export async function getCompanyFormTemplates(companyId: string): Promise<FormTemplate[]> {
  const result = await pool.query(
    'SELECT * FROM form_templates WHERE company_id = $1 ORDER BY created_at DESC',
    [companyId]
  );
  return result.rows;
}

// Get a single form template by ID
export async function getFormTemplateById(templateId: string): Promise<FormTemplate> {
  const result = await pool.query('SELECT * FROM form_templates WHERE id = $1', [templateId]);
  return result.rows[0];
}

// Submit a filled form
export async function submitForm(
  templateId: string,
  userId: string,
  companyId: string,
  answers: Record<string, any>,
  timeEntryId?: string
): Promise<FormSubmission> {
  const result = await pool.query(
    `INSERT INTO form_submissions (template_id, user_id, company_id, answers, time_entry_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [templateId, userId, companyId, JSON.stringify(answers), timeEntryId || null]
  );
  return result.rows[0];
}

// Get form submissions for a time entry
export async function getTimeEntryForms(timeEntryId: string): Promise<FormSubmission[]> {
  const result = await pool.query(
    `SELECT fs.*, ft.name as template_name
     FROM form_submissions fs
     JOIN form_templates ft ON fs.template_id = ft.id
     WHERE fs.time_entry_id = $1`,
    [timeEntryId]
  );
  return result.rows;
}

// Get recent submissions for a company (for review)
export async function getCompanyFormSubmissions(companyId: string, limit = 50): Promise<any[]> {
  const result = await pool.query(
    `SELECT fs.*, ft.name as template_name, u.first_name || ' ' || u.last_name as submitted_by
     FROM form_submissions fs
     JOIN form_templates ft ON fs.template_id = ft.id
     JOIN users u ON fs.user_id = u.id
     WHERE fs.company_id = $1
     ORDER BY fs.submitted_at DESC LIMIT $2`,
    [companyId, limit]
  );
  return result.rows;
}

console.log('📋 Form Service loaded – Future Jobs Pro AI by Samuel B.');