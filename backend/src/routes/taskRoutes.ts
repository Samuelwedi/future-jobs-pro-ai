import express, { Request, Response } from 'express';
import {
  createTask,
  updateTask,
  getProjectTasks,
  getUserTasks,
} from '../services/taskService';

const router = express.Router();

// POST /api/tasks – create a task
router.post('/', async (req: Request, res: Response) => {
  try {
    const { projectId, companyId, name, description, assignedTo, estimatedHours, createdBy } = req.body;
    if (!projectId || !companyId || !name || !createdBy) {
      return res.status(400).json({ success: false, message: 'projectId, companyId, name, and createdBy are required' });
    }
    const task = await createTask(projectId, companyId, name, createdBy, description, assignedTo, estimatedHours);
    res.status(201).json({ success: true, task });
  } catch (error: any) {
    console.error('Create task error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/tasks/:id – update a task
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const task = await updateTask(req.params.id as string, req.body);
    res.json({ success: true, task });
  } catch (error: any) {
    console.error('Update task error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/tasks/project/:projectId
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const tasks = await getProjectTasks(req.params.projectId as string);
    res.json({ success: true, tasks });
  } catch (error: any) {
    console.error('Get project tasks error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/tasks/user/:userId
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const tasks = await getUserTasks(req.params.userId as string);
    res.json({ success: true, tasks });
  } catch (error: any) {
    console.error('Get user tasks error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;