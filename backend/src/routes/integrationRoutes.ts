import {companyActor,manages} from '../middleware/companyActor';
import express, {
  Request,
  Response,
} from 'express';
import {
  disconnectIntegration,
  getIntegrationStatus,
  getQuickBooksAuthUrl,
  getStripeConnectUrl,
  handleQuickBooksCallback,
  handleStripeConnectCallback,
  integrationResultUrl,
  syncRecentStripePayments,
} from '../services/integrationService';
import {
  getQuickBooksCompanyInfo,
  listQuickBooksItems,
} from '../services/quickbooksService';

const router = express.Router();
router.use((req,res,next)=>{
  if(req.method==='GET'&&['/quickbooks/callback','/stripe/callback'].includes(req.path))return next();
  return companyActor(req,res,()=>{if(!manages(res.locals.actor))return res.status(403).json({message:'Manager access required'});(req as any).integrationActor=res.locals.actor;next();});
});

function authenticatedCompany(
  req: Request,
): {
  companyId: string;
  userId: string;
} {
  const actor=(req as any).integrationActor;
  if(!actor?.company_id)throw new Error('Not authenticated');
  return {companyId:String(actor.company_id),userId:String(actor.id)};
}

function errorStatus(
  message: string,
): number {
  if (
    /token|authenticated|company/i.test(
      message,
    )
  ) {
    return 401;
  }

  if (/not configured/i.test(message)) {
    return 503;
  }

  return 400;
}

router.get(
  '/status',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const { companyId } =
        authenticatedCompany(req);

      res.json({
        success: true,
        ...(await getIntegrationStatus(
          companyId,
        )),
      });
    } catch (error: any) {
      res
        .status(
          errorStatus(error.message),
        )
        .json({
          success: false,
          message: error.message,
        });
    }
  },
);

router.get(
  '/quickbooks/auth',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const { companyId, userId } =
        authenticatedCompany(req);

      res.json({
        success: true,
        url: await getQuickBooksAuthUrl(
          companyId,
          userId,
        ),
      });
    } catch (error: any) {
      res
        .status(
          errorStatus(error.message),
        )
        .json({
          success: false,
          message: error.message,
        });
    }
  },
);

router.get(
  '/quickbooks/callback',
  async (
    req: Request,
    res: Response,
  ) => {
    const state = String(
      req.query.state || '',
    );

    try {
      if (req.query.error) {
        throw new Error(
          String(
            req.query.error_description ||
              req.query.error,
          ),
        );
      }

      const realmId = String(
        req.query.realmId || '',
      );

      await handleQuickBooksCallback(
        String(req.query.code || ''),
        state,
        realmId,
      );

      res.redirect(
        integrationResultUrl(
          'quickbooks',
          'connected',
        ),
      );
    } catch (error: any) {
      console.error(
        'QuickBooks callback failed:',
        error,
      );

      res.redirect(
        integrationResultUrl(
          'quickbooks',
          'error',
          error.message,
        ),
      );
    }
  },
);

/**
 * Safe, read-only verification endpoint.
 */
router.get(
  '/quickbooks/company-info',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const { companyId } =
        authenticatedCompany(req);

      const company =
        await getQuickBooksCompanyInfo(
          companyId,
        );

      res.json({
        success: true,
        connected: true,
        environment:
          process.env
            .QUICKBOOKS_ENVIRONMENT ===
          'production'
            ? 'production'
            : 'sandbox',
        company,
      });
    } catch (error: any) {
      res
        .status(
          errorStatus(error.message),
        )
        .json({
          success: false,
          connected: false,
          message: error.message,
        });
    }
  },
);

/**
 * Safely lists active QuickBooks
 * products and services.
 */
router.get(
  '/quickbooks/items',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const { companyId } =
        authenticatedCompany(req);

      const items =
        await listQuickBooksItems(
          companyId,
        );

      res.json({
        success: true,
        count: items.length,
        items,
      });
    } catch (error: any) {
      res
        .status(
          errorStatus(error.message),
        )
        .json({
          success: false,
          message: error.message,
        });
    }
  },
);

router.get(
  '/stripe/auth',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const { companyId, userId } =
        authenticatedCompany(req);

      res.json({
        success: true,
        url: await getStripeConnectUrl(
          companyId,
          userId,
        ),
      });
    } catch (error: any) {
      res
        .status(
          errorStatus(error.message),
        )
        .json({
          success: false,
          message: error.message,
        });
    }
  },
);

router.get(
  '/stripe/callback',
  async (
    req: Request,
    res: Response,
  ) => {
    const state = String(
      req.query.state || '',
    );

    try {
      if (req.query.error) {
        throw new Error(
          String(
            req.query.error_description ||
              req.query.error,
          ),
        );
      }

      await handleStripeConnectCallback(
        String(
          req.query.code || '',
        ),
        state,
      );

      res.redirect(
        integrationResultUrl(
          'stripe',
          'connected',
        ),
      );
    } catch (error: any) {
      console.error(
        'Stripe callback failed:',
        error,
      );

      res.redirect(
        integrationResultUrl(
          'stripe',
          'error',
          error.message,
        ),
      );
    }
  },
);

router.post(
  '/:provider/disconnect',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const provider =
        req.params.provider;

      if (
        provider !== 'quickbooks' &&
        provider !== 'stripe'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Unknown integration provider',
        });
      }

      const { companyId } =
        authenticatedCompany(req);

      await disconnectIntegration(
        companyId,
        provider,
      );

      res.json({
        success: true,
      });
    } catch (error: any) {
      res
        .status(
          errorStatus(error.message),
        )
        .json({
          success: false,
          message: error.message,
        });
    }
  },
);

router.post(
  '/sync/stripe-to-quickbooks',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const { companyId } =
        authenticatedCompany(req);

      res.json({
        success: true,
        result:
          await syncRecentStripePayments(
            companyId,
          ),
      });
    } catch (error: any) {
      res
        .status(
          errorStatus(error.message),
        )
        .json({
          success: false,
          message: error.message,
        });
    }
  },
);

export default router;
