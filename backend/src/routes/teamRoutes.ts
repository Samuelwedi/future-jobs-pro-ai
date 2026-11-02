import bcrypt from "bcryptjs";
import {
  transaction,
  documentId,
  requireValue,
} from "../services/commercialDocuments";
import {
  canManageCompanyMember,
  privilegedCompanyRole,
} from "../services/companyAdministration";
import { companyActor, manages } from "../middleware/companyActor";
import { verifyToken } from "../utils/auth";
import express, { Request, Response } from "express";
import { pool } from "../config/database";
import {
  inviteEmployee,
  getCompanyMembers,
  updateMemberRole,
  removeMember,
  setPassword,
} from "../services/teamService";

const router = express.Router();
router.use(companyActor);
router.use((req, res, next) => {
  const a = res.locals.actor;
  if (req.method !== "GET" && !manages(a))
    return res.status(403).json({ message: "Manager access required" });
  if (
    req.body?.companyId &&
    String(req.body.companyId) !== String(a.company_id)
  )
    return res.status(403).json({ message: "Company access denied" });
  next();
});

const guarded = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res)).catch(next);
async function managedMember(
  req: any,
  res: any,
  idValue: unknown,
  action: string,
  work: (c: any, a: any, id: string) => Promise<any>,
) {
  const id = documentId(idValue),
    initial = res.locals.actor;
  return transaction(async (c) => {
    const ar = await c.query(
        "SELECT id,company_id,LOWER(role) role FROM users WHERE id=$1 AND company_id=$2 AND COALESCE(is_active,true) FOR SHARE",
        [initial.id, initial.company_id],
      ),
      a = ar.rows[0];
    requireValue(a && manages(a), "Manager access required", 403);
    const lookup = async (lock = false) =>
      (
        await c.query(
          "SELECT id,LOWER(role) role FROM users WHERE id=$1 AND company_id=$2" +
            (lock ? " FOR UPDATE" : ""),
          [id, a.company_id],
        )
      ).rows[0];
    let target = await lookup();
    requireValue(target, "User not found in your company", 404);
    requireValue(
      canManageCompanyMember(a, target),
      "Use ownership transfer or a permitted administrator for this account.",
      403,
    );
    target = await lookup(true);
    requireValue(
      target && canManageCompanyMember(a, target),
      "User access changed. Refresh the team.",
      403,
    );
    const result = await work(c, a, id);
    await c.query(
      "INSERT INTO company_admin_audit_logs(company_id,actor_id,employee_id,action,details) VALUES($1,$2,$3,$4,$5)",
      [a.company_id, a.id, id, action, "{}"],
    );
    return result;
  });
}
// Helper to safely get userId as string
const getUserId = (req: Request): string => {
  return String(req.params.userId);
};

// Helper to safely get companyId as string
const getCompanyId = (req: Request): string => {
  return String(req.params.companyId);
};

// GET /api/team
router.get("/", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT id, email, role, full_name, first_name, last_name FROM users WHERE company_id = $1",
      [res.locals.actor.company_id],
    );
    res.json({ success: true, members: result.rows });
  } catch (error: any) {
    console.error("Team fetch error:", error.message);
    res.status(500).json({ success: false, message: "Failed to load team" });
  }
});

// POST /api/team/invite
router.post("/invite", async (req: Request, res: Response) => {
  try {
    const { companyId, email, firstName, lastName, role, invitedBy } = req.body;
    if (
      !companyId ||
      !email ||
      !firstName ||
      !lastName ||
      !role ||
      !invitedBy
    ) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required" });
    }

    if (String(invitedBy) !== String(res.locals.actor.id)) {
      return res.status(403).json({
        success: false,
        message: "Inviter must match the authenticated manager",
      });
    }

    if (
      !["employee", "manager"].includes(role) ||
      (role === "manager" &&
        !["boss", "owner", "admin"].includes(res.locals.actor.role))
    )
      return res
        .status(403)
        .json({ message: "This role cannot be assigned by your account" });
    const result = await inviteEmployee(
      companyId,
      email,
      firstName,
      lastName,
      role,
      invitedBy,
    );
    res.status(201).json({
      success: true,
      user: result.user,
      emailSent: result.emailSent,
      tempPassword: result.tempPassword,
      message: `${result.emailSent ? "Employee created and invitation sent." : "Employee created, but email delivery failed. Share the temporary password securely."} Temporary password: ${result.tempPassword}`,
    });
  } catch (error: any) {
    console.warn("Employee invitation failed.");
    if (error.message.includes("already exists")) {
      return res.status(400).json({
        success: false,
        message: "A user with this email already exists",
      });
    }
    if (error.message.includes("Inviter not found")) {
      return res
        .status(400)
        .json({ success: false, message: "Inviter not found" });
    }
    if (error.message.includes("does not belong to this company")) {
      return res.status(403).json({
        success: false,
        message: "Inviter does not belong to this company",
      });
    }
    res.status(error.status || 503).json({
      success: false,
      message: error.status
        ? error.message
        : "Employee creation failed. Refresh the team before retrying.",
    });
  }
});

// POST /api/team/set-password
router.post(
  "/set-password",
  guarded(async (req: any, res: any) => {
    const password = req.body?.newPassword;
    requireValue(
      typeof password === "string" &&
        password.length >= 12 &&
        Buffer.byteLength(password, "utf8") <= 72,
      "Use a temporary password of at least 12 characters and at most 72 UTF-8 bytes.",
    );
    await managedMember(
      req,
      res,
      req.body?.userId,
      "employee.password_reset",
      async (c, a, id) => {
        await c.query(
          "UPDATE users SET password_hash=$1,must_change_password=true,updated_at=NOW() WHERE id=$2 AND company_id=$3",
          [await bcrypt.hash(password, 12), id, a.company_id],
        );
      },
    );
    res.json({
      success: true,
      message:
        "Temporary password set. The employee must change it after signing in.",
    });
  }),
);

// GET /api/team/members/:companyId
router.get("/members/:companyId", async (req: Request, res: Response) => {
  try {
    const companyId = getCompanyId(req);
    if (companyId !== String(res.locals.actor.company_id))
      return res.status(403).json({ message: "Company access denied" });
    const members = await getCompanyMembers(companyId);
    res.json({ success: true, members });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/team/:userId/role
router.put(
  "/:userId/role",
  guarded(async (req: any, res: any) => {
    const role = String(req.body?.role || "").toLowerCase();
    requireValue(
      ["employee", "manager"].includes(role),
      "Role must be employee or manager",
    );
    const user = await managedMember(
      req,
      res,
      req.params.userId,
      "employee.role_updated",
      async (c, a, id) => {
        requireValue(
          privilegedCompanyRole(a.role),
          "Only the owner or administrator can change roles",
          403,
        );
        return (
          await c.query(
            "UPDATE users SET role=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3 RETURNING id,email,first_name,last_name,role",
            [role, id, a.company_id],
          )
        ).rows[0];
      },
    );
    res.json({ success: true, user });
  }),
);

// POST /api/team/:userId/transfer-ownership
// There must be exactly one company owner. Only the current boss may transfer
// ownership, and only to an active manager in the same company.
router.post(
  "/:userId/transfer-ownership",
  async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const decoded = verifyToken(req);
      const targetId = getUserId(req);
      if (String(req.body.confirmation || "") !== "TRANSFER OWNERSHIP") {
        return res.status(400).json({
          success: false,
          message: "Ownership transfer confirmation is required",
        });
      }
      await client.query("BEGIN");
      const actorResult = await client.query(
        `SELECT id, company_id, role FROM users
       WHERE id = $1 AND COALESCE(is_active, TRUE) = TRUE FOR UPDATE`,
        [decoded.id],
      );
      const actor = actorResult.rows[0];
      if (
        !actor ||
        !["boss", "owner"].includes(String(actor.role).toLowerCase()) ||
        !actor.company_id
      ) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          success: false,
          message: "Only the current Boss can transfer company ownership",
        });
      }
      if (actor.id === targetId) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Select a manager to become the new Boss",
        });
      }
      const targetResult = await client.query(
        `SELECT id, role, first_name, last_name FROM users
       WHERE id = $1 AND company_id = $2 AND COALESCE(is_active, TRUE) = TRUE FOR UPDATE`,
        [targetId, actor.company_id],
      );
      const target = targetResult.rows[0];
      if (!target || String(target.role).toLowerCase() !== "manager") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "The new Boss must be an active manager in your company",
        });
      }

      await client.query(
        "UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2",
        ["manager", actor.id],
      );
      await client.query(
        "UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2",
        ["boss", target.id],
      );
      await client.query(
        `INSERT INTO company_admin_audit_logs(company_id, actor_id, employee_id, action, details)
       VALUES($1,$2,$3,'company.ownership_transferred',$4)`,
        [
          actor.company_id,
          actor.id,
          target.id,
          JSON.stringify({ previousBossId: actor.id, newBossId: target.id }),
        ],
      );
      await client.query("COMMIT");
      res.json({
        success: true,
        message:
          `${target.first_name || ""} ${target.last_name || ""}`.trim() +
          " is now the company Boss",
        currentUserRole: "manager",
        newBossId: target.id,
      });
    } catch (error: any) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      console.error("Ownership transfer error:", error.message);
      res.status(500).json({
        success: false,
        message: "Company ownership could not be transferred",
      });
    } finally {
      client.release();
    }
  },
);

// DELETE /api/team/:userId
router.delete(
  "/:userId",
  guarded(async (req: any, res: any) => {
    await managedMember(
      req,
      res,
      req.params.userId,
      "employee.deactivated",
      async (c, a, id) => {
        await c.query(
          "UPDATE users SET is_active=false,updated_at=NOW() WHERE id=$1 AND company_id=$2",
          [id, a.company_id],
        );
      },
    );
    res.json({
      success: true,
      message: "Member deactivated. Historical records are retained.",
    });
  }),
);
router.use((e: any, _req: any, res: any, _next: any) =>
  res.status(e.status || 503).json({
    success: false,
    message: e.status
      ? e.message
      : "Team administration is unavailable. Refresh or contact support.",
  }),
);

export default router;
