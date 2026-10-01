import express, { Request, Response } from 'express';
import { pool } from '../config/database';
import { companyActor, manages } from '../middleware/companyActor';
import {
  createFormTemplate,
  getCompanyFormTemplates,
  getFormTemplateById,
  submitForm,
  getTimeEntryForms,
  getCompanyFormSubmissions,
} from '../services/formService';

const router = express.Router();
router.use(companyActor);

async function requireTimeEntryAccess(req: Request, res: Response, timeEntryId: string): Promise<boolean> {
  const actor = res.locals.actor;
  const entry = await pool.query(
    `SELECT te.user_id, u.company_id
       FROM time_entries te JOIN users u ON u.id=te.user_id
      WHERE te.id=$1 AND u.company_id=$2`,
    [timeEntryId, actor.company_id],
  );
  if (!entry.rowCount) {
    res.status(404).json({ success: false, message: 'Time entry not found' });
    return false;
  }
  if (!manages(actor) && String(entry.rows[0].user_id) !== String(actor.id)) {
    res.status(403).json({ success: false, message: 'Form access denied' });
    return false;
  }
  return true;
}

// POST /api/forms/templates – create a form template
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const actor = res.locals.actor;
    if (!manages(actor)) return res.status(403).json({ success: false, message: 'Manager access is required' });
    const { name, description, fields } = req.body;
    if (!name || !Array.isArray(fields) || fields.length > 100) {
      return res.status(400).json({ success: false, message: 'A name and up to 100 form fields are required' });
    }
    const template = await createFormTemplate(actor.company_id, String(name).trim().slice(0, 200), actor.id, description, fields);
    res.status(201).json({ success: true, template });
  } catch (error: any) {
    console.error('Create form template error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/forms/templates/:companyId – get all templates for a company
router.get('/templates/:companyId', async (req: Request, res: Response) => {
  try {
    if (String(req.params.companyId) !== String(res.locals.actor.company_id)) {
      return res.status(403).json({ success: false, message: 'Company access denied' });
    }
    const templates = await getCompanyFormTemplates(res.locals.actor.company_id);
    res.json({ success: true, templates });
  } catch (error: any) {
    console.error('Get templates error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/forms/template/:templateId – get a single template
router.get('/template/:templateId', async (req: Request, res: Response) => {
  try {
    const template = await getFormTemplateById(req.params.templateId as string, res.locals.actor.company_id);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, template });
  } catch (error: any) {
    console.error('Get template error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/forms/submit – submit a filled form
router.post('/submit', async (req: Request, res: Response) => {
  try {
    const { templateId, answers, timeEntryId } = req.body;
    if (!templateId || !answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ success: false, message: 'templateId and answer fields are required' });
    }
    if (JSON.stringify(answers).length > 200000) {
      return res.status(413).json({ success: false, message: 'Form answers are too large' });
    }
    if (timeEntryId && !(await requireTimeEntryAccess(req, res, String(timeEntryId)))) return;
    const actor = res.locals.actor;
    const submission = await submitForm(templateId, actor.id, actor.company_id, answers, timeEntryId);
    res.status(201).json({ success: true, submission });
  } catch (error: any) {
    console.error('Submit form error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/forms/time-entry/:timeEntryId – get forms for a time entry
router.get('/time-entry/:timeEntryId', async (req: Request, res: Response) => {
  try {
    if (!(await requireTimeEntryAccess(req, res, String(req.params.timeEntryId)))) return;
    const forms = await getTimeEntryForms(req.params.timeEntryId as string, res.locals.actor.company_id);
    res.json({ success: true, forms });
  } catch (error: any) {
    console.error('Get time entry forms error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/forms/submissions/:companyId – get recent submissions for review
router.get('/submissions/:companyId', async (req: Request, res: Response) => {
  try {
    if (!manages(res.locals.actor)) return res.status(403).json({ success: false, message: 'Manager access is required' });
    if (String(req.params.companyId) !== String(res.locals.actor.company_id)) {
      return res.status(403).json({ success: false, message: 'Company access denied' });
    }
    const submissions = await getCompanyFormSubmissions(res.locals.actor.company_id);
    res.json({ success: true, submissions });
  } catch (error: any) {
    console.error('Get submissions error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
