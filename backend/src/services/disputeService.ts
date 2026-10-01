// ============================================
// AUTO‑DISPUTE EVIDENCE GENERATOR
// Creates legal‑grade evidence packages
// Created by: Samuel B.
// ============================================

import { pool } from '../config/database';
import * as crypto from 'crypto';
import PDFDocument from 'pdfkit';
import { generateBreadcrumbTrail, getArrivalConfidence } from './gpsService';

interface DisputeEvidencePackage {
  packageId: string;
  generatedAt: Date;
  projectId: string;
  timeEntryId: string;
  riskScore: number;
  evidence: {
    timeCard: any;
    gpsTrail: any;
    photos: any[];
    voiceNotes: any[];
    externalData: any;
  };
  verificationHash: string;
}

// ============================================
// MAIN FUNCTION: Build a dispute evidence package
// ============================================
export async function buildDisputeEvidencePackage(
  timeEntryId: string
): Promise<DisputeEvidencePackage> {

  console.log(`\n🛡️  [Samuel B.] Building dispute evidence for time entry ${timeEntryId}`);

  // 1. Calculate risk score
  const riskScore = await calculateDisputeRisk(timeEntryId);
  console.log(`📊 Dispute Risk Score: ${riskScore}/100`);

  // 2. Gather all evidence
  const timeCard = await gatherTimeCardEvidence(timeEntryId);
  const gpsTrail = await gatherGPSEvidence(timeEntryId);
  const photos = await gatherPhotoEvidence(timeEntryId);
  const voiceNotes = await gatherVoiceNoteEvidence(timeEntryId);
  const externalData = await gatherExternalData(timeEntryId);

  const packageId = crypto.randomUUID();
  const generatedAt = new Date();

  // 3. Create a reproducible integrity hash over the stored evidence snapshot.
  const verificationHash = generatePackageHash({
    packageId,
    generatedAt: generatedAt.toISOString(),
    timeEntryId,
    timeCard,
    gpsTrail,
    photos,
    voiceNotes,
    externalData,
  });

  // 4. Build the package
  const evidencePackage: DisputeEvidencePackage = {
    packageId,
    generatedAt,
    projectId: timeCard.projectId,
    timeEntryId,
    riskScore,
    evidence: { timeCard, gpsTrail, photos, voiceNotes, externalData },
    verificationHash,
  };

  // 5. Save to database
  await saveEvidencePackage(evidencePackage);

  console.log(`✅ Evidence package built – ID: ${evidencePackage.packageId}`);
  return evidencePackage;
}

// ============================================
// Risk Score Calculation
// ============================================
async function calculateDisputeRisk(timeEntryId: string): Promise<number> {
  let riskScore = 0;

  const result = await pool.query(
    `SELECT te.*,
            (SELECT COUNT(*) FROM dispute_evidence WHERE project_id = te.project_id) as client_dispute_history
     FROM time_entries te
     WHERE te.id = $1`,
    [timeEntryId]
  );
  const entry = result.rows[0];
  if (!entry) return 0;

  // Arrival time variance
  if (entry.clock_in) {
    const minutesLate = (new Date(entry.clock_in).getTime() - new Date(entry.created_at).getTime()) / 60000;
    if (minutesLate > 15) riskScore += Math.min(minutesLate * 1.5, 30);
  }

  // Duration variance
  if (entry.clock_out && entry.estimated_hours) {
    const actualHours = (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 3600000;
    const variance = Math.abs(actualHours - entry.estimated_hours) / entry.estimated_hours;
    riskScore += Math.min(variance * 50, 25);
  }

  // Client history
  if (entry.client_dispute_history) {
    riskScore += Math.min(entry.client_dispute_history * 15, 30);
  }

  // GPS confidence
  const gpsConfidence = await getArrivalConfidence(timeEntryId);
  if (gpsConfidence.confidence < 70) riskScore += 15;

  return Math.min(Math.round(riskScore), 100);
}

// ============================================
// Gather individual evidence pieces
// ============================================
async function gatherTimeCardEvidence(timeEntryId: string): Promise<any> {
  const result = await pool.query(
    `SELECT te.*, p.id as project_id, p.estimated_hours
     FROM time_entries te
     JOIN projects p ON te.project_id = p.id
     WHERE te.id = $1`,
    [timeEntryId]
  );
  const entry = result.rows[0];
  return {
    projectId: entry.project_id,
    clockIn: entry.clock_in,
    clockOut: entry.clock_out,
    scheduledStart: entry.created_at,
    totalHours: entry.clock_out
      ? (new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()) / 3600000
      : 0,
  };
}

async function gatherGPSEvidence(timeEntryId: string): Promise<any> {
  const trail = await generateBreadcrumbTrail(timeEntryId);
  const confidence = await getArrivalConfidence(timeEntryId);

  const breadcrumb = trail.points.map((p: any) => ({
    lat: p.latitude,
    lng: p.longitude,
    timestamp: p.timestamp,
  }));

  const timeAtSite = breadcrumb.length > 1
    ? (new Date(breadcrumb[breadcrumb.length - 1].timestamp).getTime()
       - new Date(breadcrumb[0].timestamp).getTime()) / 1000
    : 0;

  const distanceTraveled = (trail as any).totalDistance ?? 0;

  return {
    totalPoints: breadcrumb.length,
    arrivalConfidence: confidence.confidence,
    timeAtSite,
    distanceTraveled,
    geofenceViolations: trail.points.filter((p: any) => p.geofenceStatus === 'outside').length,
    breadcrumb,
  };
}

async function gatherPhotoEvidence(timeEntryId: string): Promise<any[]> {
  const result = await pool.query(
    `SELECT id, s3_key as url, taken_at, compliance_score, verification_hash, ai_tags
     FROM photos WHERE time_entry_id = $1 ORDER BY taken_at ASC`,
    [timeEntryId]
  );
  return result.rows;
}

async function gatherVoiceNoteEvidence(timeEntryId: string): Promise<any[]> {
  const result = await pool.query(
    `SELECT id, transcript, client_summary, duration_seconds
     FROM voice_notes WHERE time_entry_id = $1 ORDER BY created_at ASC`,
    [timeEntryId]
  );
  return result.rows;
}

async function gatherExternalData(timeEntryId: string): Promise<any> {
  return {
    weather: null,
    trafficIncidents: [],
    note: 'No independently verified weather or traffic provider data was attached.',
  };
}

// ============================================
// Hash generation
// ============================================
function generatePackageHash(data: any): string {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(data));
  return hash.digest('hex');
}

// ============================================
// Save to database
// ============================================
async function saveEvidencePackage(pkg: DisputeEvidencePackage): Promise<void> {
  await pool.query(
    `INSERT INTO dispute_evidence (project_id, time_entry_id, risk_score, evidence_package, verification_hash, status, expires_at)
     VALUES ($1,$2,$3,$4,$5,'ready', NOW() + INTERVAL '90 days')`,
    [pkg.projectId, pkg.timeEntryId, pkg.riskScore, JSON.stringify(pkg), pkg.verificationHash]
  );
}

// ============================================
// Public helpers
// ============================================
export async function generateDisputePDF(packageId: string, companyId: string): Promise<Buffer> {
  const result = await pool.query(
    `SELECT de.evidence_package, de.verification_hash, de.risk_score, de.created_at
       FROM dispute_evidence de
       JOIN time_entries te ON te.id=de.time_entry_id
       JOIN users u ON u.id=te.user_id
      WHERE u.company_id=$2
        AND (de.id::text=$1 OR de.evidence_package->>'packageId'=$1)
      ORDER BY de.created_at DESC
      LIMIT 1`,
    [packageId, companyId],
  );
  if (!result.rowCount) throw Object.assign(new Error('Evidence package not found'), { status: 404 });
  const row = result.rows[0];
  const evidence = typeof row.evidence_package === 'string'
    ? JSON.parse(row.evidence_package)
    : row.evidence_package;

  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ size: 'LETTER', margin: 54, info: { Title: `Evidence package ${packageId}` } });
    const chunks: Buffer[] = [];
    document.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));

    document.fontSize(20).text('Future Jobs Pro AI', { align: 'center' });
    document.fontSize(15).text('Dispute Evidence Snapshot', { align: 'center' });
    document.moveDown();
    document.fontSize(10).text(`Package ID: ${evidence.packageId || packageId}`);
    document.text(`Generated: ${evidence.generatedAt || row.created_at}`);
    document.text(`Time entry: ${evidence.timeEntryId || 'Unavailable'}`);
    document.text(`Project: ${evidence.projectId || 'Unavailable'}`);
    document.text(`Risk indicator: ${Number(row.risk_score || evidence.riskScore || 0)}/100`);
    document.moveDown();
    document.fontSize(12).text('Recorded time');
    document.fontSize(10).text(`Clock in: ${evidence.evidence?.timeCard?.clockIn || 'Unavailable'}`);
    document.text(`Clock out: ${evidence.evidence?.timeCard?.clockOut || 'Unavailable'}`);
    document.text(`Recorded hours: ${Number(evidence.evidence?.timeCard?.totalHours || 0).toFixed(2)}`);
    document.moveDown();
    document.fontSize(12).text('Attached evidence');
    document.fontSize(10).text(`GPS points: ${Number(evidence.evidence?.gpsTrail?.totalPoints || 0)}`);
    document.text(`Photos: ${Array.isArray(evidence.evidence?.photos) ? evidence.evidence.photos.length : 0}`);
    document.text(`Voice notes: ${Array.isArray(evidence.evidence?.voiceNotes) ? evidence.evidence.voiceNotes.length : 0}`);
    document.moveDown();
    document.fontSize(12).text('Integrity');
    document.fontSize(8).text(String(row.verification_hash || evidence.verificationHash || ''), { width: 500 });
    document.moveDown();
    document.fontSize(9).text('This report is an application-generated snapshot of stored records. It does not replace legal review, and no unverified weather or traffic facts are represented as evidence.');
    document.end();
  });
}

export async function checkHighRiskEntries(companyId: string): Promise<any[]> {
  const result = await pool.query(
    `SELECT te.id, te.clock_in, te.clock_out, p.name as project_name,
            u.first_name || ' ' || u.last_name as employee_name, de.risk_score
     FROM time_entries te
     JOIN projects p ON te.project_id = p.id
     JOIN users u ON te.user_id = u.id
     LEFT JOIN dispute_evidence de ON de.time_entry_id = te.id
     WHERE u.company_id = $1 AND te.clock_out IS NOT NULL
       AND (de.risk_score >= 65 OR de.id IS NULL)
     ORDER BY de.risk_score DESC NULLS LAST
     LIMIT 20`,
    [companyId]
  );
  return result.rows;
}

console.log('🛡️  Dispute Evidence Service loaded – Future Jobs Pro AI by Samuel B.');
