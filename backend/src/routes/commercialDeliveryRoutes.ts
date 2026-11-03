import express from 'express';
import { CommercialKind } from '../services/commercialPdf';
import { deliveryOptions, enqueueCommercialDelivery, changeCommercialDelivery } from '../services/commercialDeliveryService';
export function commercialDeliveryRoutes(kind: CommercialKind) {
    const router = express.Router();
    const fail = (res: any, error: any) => res.status(error.status || 400).json({ message: error.message || 'Email action failed.' });
    router.get('/:id/email', async (req, res) => { try {
        res.json(await deliveryOptions(kind, String(req.params.id), res.locals.actor.company_id));
    }
    catch (error) {
        fail(res, error);
    } });
    router.post('/:id/email', async (req, res) => { try {
        const result = await enqueueCommercialDelivery(kind, String(req.params.id), res.locals.actor, req.body);
        res.status(result.replayed ? 200 : 202).json(result);
    }
    catch (error) {
        fail(res, error);
    } });
    router.post('/:id/email/:jobId', async (req, res) => { try {
        res.json(await changeCommercialDelivery(kind, String(req.params.id), res.locals.actor, String(req.params.jobId), req.body));
    }
    catch (error) {
        fail(res, error);
    } });
    return router;
}
