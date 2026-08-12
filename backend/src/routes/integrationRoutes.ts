import express, {
  Request,
  Response,
} from 'express';
import { verifyToken } from '../utils/auth';
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
  createSalesReceipt,
  findOrCreateQuickBooksCustomer,
  getQuickBooksCompanyInfo,
  listQuickBooksItems,
} from '../services/quickbooksService';

const router = express.Router();

function authenticatedCompany(
  req: Request,
): {
  companyId: string;
  userId: string;
} {
  const decoded = verifyToken(req);

  if (!decoded.companyId) {
    throw new Error(
      'Your user is not assigned to a company',
    );
  }

  return {
    companyId: decoded.companyId,
    userId: decoded.id,
  };
}

function errorStatus(message: string): number {
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
  async (req: Request, res: Response) => {
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
        .status(errorStatus(error.message))
        .json({
          success: false,
          message: error.message,
        });
    }
  },
);

router.get(
  '/quickbooks/auth',
  async (req: Request, res: Response) => {
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
        .status(errorStatus(error.message))
        .json({
          success: false,
          message: error.message,
        });
    }
  },
);

router.get(
  '/quickbooks/callback',
  async (req: Request, res: Response) => {
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

      const baseUrl = (
        process.env.BASE_URL ||
        `${req.protocol}://${req.get(
          'host',
        )}`
      ).replace(/\/$/, '');

      await handleQuickBooksCallback(
        `${baseUrl}${req.originalUrl}`,
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
 * Safe read-only verification endpoint.
 */
router.get(
  '/quickbooks/company-info',
  async (req: Request, res: Response) => {
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
        .status(errorStatus(error.message))
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
  async (req: Request, res: Response) => {
    try {
      const { companyId } =
        authenticatedCompany(req);

      const items =
        await listQuickBooksItems(companyId);

      res.json({
        success: true,
        count: items.length,
        items,
      });
    } catch (error: any) {
      res
        .status(errorStatus(error.message))
        .json({
          success: false,
          message: error.message,
        });
    }
  },
);

/**
 * Creates exactly one controlled $1.00 test
 * receipt in QuickBooks Sandbox.
 *
 * This endpoint refuses to operate when the
 * QuickBooks environment is production.
 */
router.post(
  '/quickbooks/test-sales-receipt',
  express.json(),
  async (req: Request, res: Response) => {
    try {
      const { companyId } =
        authenticatedCompany(req);

      if (
        process.env.QUICKBOOKS_ENVIRONMENT !==
        'sandbox'
      ) {
        return res.status(403).json({
          success: false,
          message:
            'The QuickBooks test receipt endpoint is disabled outside sandbox',
        });
      }

      if (
        req.body?.confirmation !==
        'CREATE_ONE_DOLLAR_SANDBOX_RECEIPT'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Explicit sandbox confirmation is required',
        });
      }

      const customerId =
        await findOrCreateQuickBooksCustomer(
          companyId,
          'Future Jobs Pro AI Sandbox Test',
          'sandbox-test@futurejobsproai.com',
        );

      const transactionDate = new Date()
        .toISOString()
        .slice(0, 10);

      const response = await createSalesReceipt(
        companyId,
        customerId,
        1,
        'Future Jobs Pro AI controlled sandbox integration test',
        transactionDate,
      );

      const receipt = response?.SalesReceipt;

      if (!receipt?.Id) {
        throw new Error(
          'QuickBooks did not return the test sales receipt ID',
        );
      }

      res.status(201).json({
        success: true,
        environment: 'sandbox',
        message:
          'One $1.00 sandbox sales receipt was created',
        receipt: {
          id: String(receipt.Id),
          documentNumber: receipt.DocNumber
            ? String(receipt.DocNumber)
            : null,
          transactionDate:
            receipt.TxnDate ||
            transactionDate,
          totalAmount:
            typeof receipt.TotalAmt ===
            'number'
              ? receipt.TotalAmt
              : 1,
        },
      });
    } catch (error: any) {
      console.error(
        'QuickBooks sandbox test failed:',
        error,
      );

      res
        .status(errorStatus(error.message))
        .json({
          success: false,
          message: error.message,
        });
    }
  },
);

router.get(
  '/stripe/auth',
  async (req: Request, res: Response) => {
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
        .status(errorStatus(error.message))
        .json({
          success: false,
          message: error.message,
        });
    }
  },
);

router.get(
  '/stripe/callback',
  async (req: Request, res: Response) => {
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
        String(req.query.code || ''),
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
  async (req: Request, res: Response) => {
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
        .status(errorStatus(error.message))
        .json({
          success: false,
          message: error.message,
        });
    }
  },
);

router.post(
  '/sync/stripe-to-quickbooks',
  async (req: Request, res: Response) => {
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
        .status(errorStatus(error.message))
        .json({
          success: false,
          message: error.message,
        });
    }
  },
);

export default router;