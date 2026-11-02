import express, { Request, Response } from "express";
import { verifyToken } from "../utils/auth";
import { pool } from "../config/database";
import { manages } from "../middleware/companyActor";
import {
  disconnectIntegration,
  getIntegrationStatus,
  getQuickBooksAuthUrl,
  getStripeConnectUrl,
  handleQuickBooksCallback,
  handleStripeConnectCallback,
  integrationResultUrl,
  syncRecentStripePayments,
} from "../services/integrationService";
import {
  getQuickBooksCompanyInfo,
  listQuickBooksItems,
} from "../services/quickbooksService";

const router = express.Router();

async function authenticatedCompany(
  req: Request,
): Promise<{ companyId: string; userId: string }> {
  const decoded = verifyToken(req),
    r = await pool.query(
      "SELECT id,company_id,LOWER(role) role FROM users WHERE id=$1 AND COALESCE(is_active,true)",
      [decoded.id],
    );
  const actor = r.rows[0];
  if (!actor?.company_id)
    throw Object.assign(new Error("Not authenticated"), { status: 401 });
  if (!manages(actor))
    throw Object.assign(new Error("Manager access required"), { status: 403 });
  return { companyId: actor.company_id, userId: actor.id };
}
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
function errorStatus(message: string): number {
  if (/token|authenticated|company/i.test(message)) {
    return 401;
  }

  if (/not configured/i.test(message)) {
    return 503;
  }

  return 400;
}

function clientMessage(error: any) {
  const message = String(error.message || "");
  return error.status === 401 ||
    error.status === 403 ||
    /not configured|reconnect|Connect Stripe before|Not authenticated|Manager access required|Invalid token|token expired/i.test(
      message,
    )
    ? message
    : "Integration is unavailable. Try again or reconnect.";
}
router.get("/status", async (req: Request, res: Response) => {
  try {
    const { companyId, userId } = await authenticatedCompany(req);

    res.json({
      success: true,
      actorId: userId,
      companyId,
      ...(await getIntegrationStatus(companyId)),
    });
  } catch (error: any) {
    res
      .status(
        error.status === 401 || error.status === 403
          ? error.status
          : errorStatus(error.message),
      )
      .json({
        success: false,
        message: clientMessage(error),
      });
  }
});

router.get("/quickbooks/auth", async (req: Request, res: Response) => {
  try {
    const { companyId, userId } = await authenticatedCompany(req);

    res.json({
      success: true,
      url: await getQuickBooksAuthUrl(companyId, userId),
    });
  } catch (error: any) {
    res
      .status(
        error.status === 401 || error.status === 403
          ? error.status
          : errorStatus(error.message),
      )
      .json({
        success: false,
        message: clientMessage(error),
      });
  }
});

router.get("/quickbooks/callback", async (req: Request, res: Response) => {
  const state = String(req.query.state || "");

  try {
    if (req.query.error) {
      throw new Error(String(req.query.error_description || req.query.error));
    }

    const realmId = String(req.query.realmId || "");

    await handleQuickBooksCallback(
      String(req.query.code || ""),
      state,
      realmId,
    );

    res.redirect(integrationResultUrl("quickbooks", "connected"));
  } catch (error: any) {
    console.warn("QuickBooks callback failed.");

    res.redirect(
      integrationResultUrl(
        "quickbooks",
        "error",
        "Connection failed. Reconnect from integrations.",
      ),
    );
  }
});

/**
 * Safe, read-only verification endpoint.
 */
router.get("/quickbooks/company-info", async (req: Request, res: Response) => {
  try {
    const { companyId } = await authenticatedCompany(req);

    const company = await getQuickBooksCompanyInfo(companyId);

    res.json({
      success: true,
      connected: true,
      environment:
        process.env.QUICKBOOKS_ENVIRONMENT === "production"
          ? "production"
          : "sandbox",
      company,
    });
  } catch (error: any) {
    res
      .status(
        error.status === 401 || error.status === 403
          ? error.status
          : errorStatus(error.message),
      )
      .json({
        success: false,
        connected: false,
        message: clientMessage(error),
      });
  }
});

/**
 * Safely lists active QuickBooks
 * products and services.
 */
router.get("/quickbooks/items", async (req: Request, res: Response) => {
  try {
    const { companyId } = await authenticatedCompany(req);

    const items = await listQuickBooksItems(companyId);

    res.json({
      success: true,
      count: items.length,
      items,
    });
  } catch (error: any) {
    res
      .status(
        error.status === 401 || error.status === 403
          ? error.status
          : errorStatus(error.message),
      )
      .json({
        success: false,
        message: clientMessage(error),
      });
  }
});

router.get("/stripe/auth", async (req: Request, res: Response) => {
  try {
    const { companyId, userId } = await authenticatedCompany(req);

    res.json({
      success: true,
      url: await getStripeConnectUrl(companyId, userId),
    });
  } catch (error: any) {
    res
      .status(
        error.status === 401 || error.status === 403
          ? error.status
          : errorStatus(error.message),
      )
      .json({
        success: false,
        message: clientMessage(error),
      });
  }
});

router.get("/stripe/callback", async (req: Request, res: Response) => {
  const state = String(req.query.state || "");

  try {
    if (req.query.error) {
      throw new Error(String(req.query.error_description || req.query.error));
    }

    await handleStripeConnectCallback(String(req.query.code || ""), state);

    res.redirect(integrationResultUrl("stripe", "connected"));
  } catch (error: any) {
    console.warn("Stripe callback failed.");

    res.redirect(
      integrationResultUrl(
        "stripe",
        "error",
        "Connection failed. Reconnect from integrations.",
      ),
    );
  }
});

router.post("/:provider/disconnect", async (req: Request, res: Response) => {
  try {
    const provider = req.params.provider;

    if (provider !== "quickbooks" && provider !== "stripe") {
      return res.status(400).json({
        success: false,
        message: "Unknown integration provider",
      });
    }

    const { companyId } = await authenticatedCompany(req);

    await disconnectIntegration(companyId, provider);

    res.json({
      success: true,
    });
  } catch (error: any) {
    res
      .status(
        error.status === 401 || error.status === 403
          ? error.status
          : errorStatus(error.message),
      )
      .json({
        success: false,
        message: clientMessage(error),
      });
  }
});

router.post(
  "/sync/stripe-to-quickbooks",
  async (req: Request, res: Response) => {
    try {
      const { companyId } = await authenticatedCompany(req);

      res.json({
        success: true,
        result: await syncRecentStripePayments(companyId),
      });
    } catch (error: any) {
      res
        .status(
          error.status === 401 || error.status === 403
            ? error.status
            : errorStatus(error.message),
        )
        .json({
          success: false,
          message: clientMessage(error),
        });
    }
  },
);

export default router;
