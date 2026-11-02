import express, { Response } from "express";
import {
  downloadEvidenceMedia,
  evidenceFilename,
} from "../services/evidenceDownload";
import { chatFileType } from "../services/chatFiles";
import { pool } from "../config/database";
import { companyActor, manages } from "../middleware/companyActor";
import { documentId, requireValue } from "../services/commercialDocuments";
import {
  buildEvidenceZip,
  evidenceOptions,
} from "../services/evidenceBundleService";
import {
  generateGpsTrailVideo,
  generateTimeEntryPdf,
  generateVoiceCaptionVideo,
} from "../services/evidenceMediaService";
const router = express.Router();
router.use(companyActor, (_req, res, next) =>
  manages(res.locals.actor)
    ? next()
    : res
        .status(403)
        .json({ success: false, message: "Manager access required" }),
);
const route = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res)).catch(next);
router.get(
  "/recent",
  route(async (req: any, res: any) => {
    const a = res.locals.actor,
      limit = Number(req.query.limit ?? 25),
      offset = Number(req.query.offset ?? 0);
    requireValue(
      Number.isInteger(limit) &&
        limit > 0 &&
        limit <= 100 &&
        Number.isInteger(offset) &&
        offset >= 0 &&
        offset <= 100000,
      "Choose a valid evidence page.",
    );
    const r = await pool.query(
      `SELECT te.id,te.clock_in,te.clock_out,concat_ws(' ',u.first_name,u.last_name) employee_name,p.name project_name,(SELECT count(*) FROM photos ph WHERE ph.time_entry_id=te.id AND ph.company_id=$1) media_count,(SELECT count(*) FROM voice_notes vn WHERE vn.time_entry_id=te.id AND vn.company_id=$1) voice_count,(SELECT count(*) FROM gps_tracking g WHERE g.time_entry_id=te.id) gps_count FROM time_entries te JOIN users u ON u.id=te.user_id LEFT JOIN projects p ON p.id=te.project_id AND p.company_id=u.company_id WHERE u.company_id=$1 ORDER BY te.clock_in DESC,te.id DESC LIMIT $2 OFFSET $3`,
      [a.company_id, limit, offset],
    );
    res.json({
      success: true,
      actorId: a.id,
      companyId: a.company_id,
      entries: r.rows,
      limit,
      offset,
    });
  }),
);
router.get(
  "/time-entry/:id",
  route(async (req: any, res: any) => {
    const a = res.locals.actor;
    res.json({
      success: true,
      actorId: a.id,
      companyId: a.company_id,
      ...(await evidenceOptions(a.company_id, documentId(req.params.id))),
    });
  }),
);
router.get(
  "/:kind/:id/content",
  route(async (req: any, res: any) => {
    const kind = req.params.kind,
      id = documentId(req.params.id),
      tables: Record<string, { table: string; url: string; name: string }> = {
        photos: { table: "photos", url: "s3_key", name: "NULL::text" },
        "voice-notes": {
          table: "voice_notes",
          url: "audio_url",
          name: "NULL::text",
        },
        attachments: {
          table: "attachments",
          url: "file_url",
          name: "file_name",
        },
      };
    const config = tables[kind];
    requireValue(config, "Unsupported evidence file.");
    const r = await pool.query(
      `SELECT id,${config.url} url,${config.name} filename FROM ${config.table} WHERE id=$1 AND company_id=$2`,
      [id, res.locals.actor.company_id],
    );
    requireValue(r.rows[0], "Evidence file not found.", 404);
    const file = r.rows[0],
      bytes = await downloadEvidenceMedia(file.url, 25 * 1024 * 1024),
      extension =
        String(file.url)
          .split("?")[0]
          .match(/\.[A-Za-z0-9]{2,5}$/)?.[0] || ".bin",
      name = evidenceFilename(file.filename || id + extension),
      mime = chatFileType(name, bytes);
    res
      .set("Content-Type", mime)
      .set("Content-Disposition", `inline; filename="${name}"`)
      .set("X-Content-Type-Options", "nosniff")
      .send(bytes);
  }),
);
const sendArtifact = (
  res: Response,
  artifact: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    verificationHash: string;
  },
) => {
  res.setHeader("Content-Type", artifact.mimeType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${artifact.fileName}"`,
  );
  res.setHeader("X-Evidence-SHA256", artifact.verificationHash);
  res.send(artifact.buffer);
};
router.get(
  "/time-entry/:id/gps-video",
  route(async (req: any, res: any) =>
    sendArtifact(
      res,
      await generateGpsTrailVideo(
        res.locals.actor.company_id,
        documentId(req.params.id),
      ),
    ),
  ),
);
router.get(
  "/time-entry/:id/time-entry-pdf",
  route(async (req: any, res: any) =>
    sendArtifact(
      res,
      await generateTimeEntryPdf(
        res.locals.actor.company_id,
        documentId(req.params.id),
      ),
    ),
  ),
);
router.get(
  "/voice-note/:id/caption-video",
  route(async (req: any, res: any) =>
    sendArtifact(
      res,
      await generateVoiceCaptionVideo(
        res.locals.actor.company_id,
        documentId(req.params.id),
      ),
    ),
  ),
);
router.post(
  "/time-entry/:id/download",
  route(async (req: any, res: any) => {
    const a = res.locals.actor;
    requireValue(
      !req.query.encoding || req.query.encoding === "base64",
      "Unsupported package encoding.",
    );
    const encoded = req.query.encoding === "base64",
      result = await buildEvidenceZip(
        a.company_id,
        a.id,
        documentId(req.params.id),
        req.body || {},
        encoded ? 20 * 1024 * 1024 : 250 * 1024 * 1024,
      );
    if (encoded)
      return res.json({
        success: true,
        actorId: a.id,
        companyId: a.company_id,
        timeEntryId: req.params.id,
        fileName: result.fileName,
        mimeType: "application/zip",
        size: result.buffer.length,
        base64: result.buffer.toString("base64"),
        canonicalHash: result.hash,
        zipSha256: result.zipHash,
      });
    res
      .set("Content-Type", "application/zip")
      .set("Content-Disposition", `attachment; filename="${result.fileName}"`)
      .set("X-Evidence-SHA256", result.hash)
      .set("X-Evidence-ZIP-SHA256", result.zipHash)
      .send(result.buffer);
  }),
);
router.use((e: any, _req: any, res: any, _next: any) =>
  res
    .status(e.status || 503)
    .json({
      success: false,
      message: e.status
        ? e.message
        : "Evidence could not be generated. Check the original records or contact support.",
    }),
);
export default router;
