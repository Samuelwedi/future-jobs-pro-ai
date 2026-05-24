import express, { Request, Response } from 'express';
import {
  createFormTemplate,
  getCompanyFormTemplates,
  getFormTemplateById,
  submitForm,
  getTimeEntryForms,
  getCompanyFormSubmissions,
} from '../services/formService';

const router = express.Router();

// POST /api/forms/templates – create a form template
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const { companyId, name, description, fields, createdBy } = req.body;
    if (!companyId || !name || !createdBy) {
      return res.status(400).json({ success: false, message: 'companyId, name, and createdBy are required' });
    }
    const template = await createFormTemplate(companyId, name, createdBy, description, fields || []);
    res.status(201).json({ success: true, template });
  } catch (error: any) {
    console.error('Create form template error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/forms/templates/:companyId – get all templates for a company
router.get('/templates/:companyId', async (req: Request, res: Response) => {
  try {
    const templates = await getCompanyFormTemplates(req.params.companyId as string);
    res.json({ success: true, templates });
  } catch (error: any) {
    console.error('Get templates error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/forms/template/:templateId – get a single template
router.get('/template/:templateId', async (req: Request, res: Response) => {
  try {
    const template = await getFormTemplateById(req.params.templateId as string);
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
    const { templateId, userId, companyId, answers, timeEntryId } = req.body;
    if (!templateId || !userId || !companyId || !answers) {
      return res.status(400).json({ success: false, message: 'templateId, userId, companyId, and answers are required' });
    }
    const submission = await submitForm(templateId, userId, companyId, answers, timeEntryId);
    res.status(201).json({ success: true, submission });
  } catch (error: any) {
    console.error('Submit form error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/forms/time-entry/:timeEntryId – get forms for a time entry
router.get('/time-entry/:timeEntryId', async (req: Request, res: Response) => {
  try {
    const forms = await getTimeEntryForms(req.params.timeEntryId as string);
    res.json({ success: true, forms });
  } catch (error: any) {
    console.error('Get time entry forms error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/forms/submissions/:companyId – get recent submissions for review
router.get('/submissions/:companyId', async (req: Request, res: Response) => {
  try {
    const submissions = await getCompanyFormSubmissions(req.params.companyId as string);
    res.json({ success: true, submissions });
  } catch (error: any) {
    console.error('Get submissions error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;