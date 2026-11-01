import express from "express";
import { pool } from "../config/database";
import { companyActor } from "../middleware/companyActor";
import {
  employeePayStatement,
  employeePayStatements,
  employeeStatementPdfData,
} from "../services/employeePayStatements";
import { generatePayStubPDFBuffer } from "../services/pdfService";
const router = express.Router();
router.use(companyActor);
router.get("/", async (_req, res) => {
  try {
    const actor = res.locals.actor;
    res.json({
      success: true,
      actorId: actor.id,
      companyId: actor.company_id,
      statements: await employeePayStatements(pool, actor),
      moneyMovement: false,
      bankSettlementVerified: false,
    });
  } catch {
    res
      .status(503)
      .json({
        success: false,
        message: "Reviewed pay statements are unavailable. Try again later.",
      });
  }
});
router.get("/:id/download", async (req, res) => {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      String(req.params.id),
    )
  )
    return res
      .status(400)
      .json({ success: false, message: "Invalid pay statement identifier" });
  try {
    const item = await employeePayStatement(
      pool,
      res.locals.actor,
      String(req.params.id),
    );
    if (!item)
      return res
        .status(404)
        .json({ success: false, message: "Reviewed pay statement not found" });
    const pdf = await generatePayStubPDFBuffer(employeeStatementPdfData(item));
    res.set("Content-Type", "application/pdf");
    res.set(
      "Content-Disposition",
      `attachment; filename=paystub_${req.params.id}.pdf`,
    );
    res.send(pdf);
  } catch {
    res
      .status(503)
      .json({
        success: false,
        message: "Reviewed pay statement could not be generated",
      });
  }
});
export default router;
