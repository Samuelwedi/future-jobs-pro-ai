import { Router } from 'express';
import { companyActor } from '../middleware/companyActor';
import { deleteLucyPreference, listLucyPreferences, saveLucyPreference, LucyMemoryError, LUCY_PREFERENCE_OPTIONS, LUCY_PREFERENCE_LIMIT } from '../services/lucyMemoryService';

const router = Router();
router.use(companyActor);
router.get('/', async (_req, res) => {
  try {
    res.json({ preferences: await listLucyPreferences(res.locals.actor), options: LUCY_PREFERENCE_OPTIONS,
      limit: LUCY_PREFERENCE_LIMIT, policy: 'Explicit personal presentation preferences only; never approval or authorization.' });
  } catch { res.status(503).json({ message: 'Saved preferences are temporarily unavailable.' }); }
});
router.put('/:key', async (req, res) => {
  try { res.json({ preference: await saveLucyPreference(res.locals.actor, req.params.key, req.body) }); }
  catch (error) {
    res.status(error instanceof LucyMemoryError ? error.status : 503).json({ message: error instanceof LucyMemoryError ? error.message : 'Saved preferences are temporarily unavailable.' });
  }
});
router.delete('/:key', async (req, res) => {
  try { await deleteLucyPreference(res.locals.actor, req.params.key); res.status(204).end(); }
  catch (error) {
    res.status(error instanceof LucyMemoryError ? error.status : 503).json({ message: error instanceof LucyMemoryError ? error.message : 'Saved preferences are temporarily unavailable.' });
  }
});
export default router;
