import { createHash } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { pool as applicationPool } from '../config/database';
import { decrypt, encrypt } from './encryptionService';
import {
  IdempotencyRecord,
  PayoutAccountSummary,
  PayoutError,
  PayoutEvent,
  PayoutRepository,
  PayoutSettings,
  PayrollSnapshot,
  PayrollSummary,
  StoredBatchItem,
  StoredPayoutBatch,
  assertNoRawBankingData,
} from './nativePayoutService';

type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value || '');
}

function dateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

function safeInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new PayoutError(`${label} is outside the supported range.`, 422, 'INVALID_PAYOUT_AMOUNT');
  }
  return parsed;
}

function mapSettings(row: any): PayoutSettings {
  return {
    companyId: String(row.company_id),
    country: String(row.country).trim(),
    currency: String(row.currency).trim(),
    adapterId: row.adapter_id ? String(row.adapter_id) : null,
    updatedAt: iso(row.updated_at),
  };
}

function mapBatch(row: any): StoredPayoutBatch {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    payrollId: String(row.payroll_id),
    country: String(row.country).trim(),
    currency: String(row.currency).trim(),
    adapterId: String(row.adapter_id),
    adapterConfigurationVersion: String(row.adapter_configuration_version),
    calculationEngine: String(row.calculation_engine),
    calculationVersion: String(row.calculation_version),
    calculationCertifiedAt: iso(row.calculation_certified_at),
    status: row.status,
    employeeCount: Number(row.employee_count),
    totalMinor: safeInteger(row.total_minor, 'Batch total'),
    createdBy: String(row.created_by),
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    approvedAt: row.approved_at ? iso(row.approved_at) : null,
    providerReference: row.provider_reference ? String(row.provider_reference) : null,
    executionKeyHash: row.execution_key_hash ? String(row.execution_key_hash) : null,
    failureCode: row.failure_code ? String(row.failure_code) : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapEvent(row: any): PayoutEvent {
  const details = row.details && typeof row.details === 'object' ? row.details : {};
  assertNoRawBankingData(details, 'stored payout event');
  return {
    id: String(row.id),
    type: String(row.event_type),
    actorId: row.actor_id ? String(row.actor_id) : null,
    details,
    createdAt: iso(row.created_at),
  };
}

function fingerprint(adapterId: string, recipientReference: string): string {
  return createHash('sha256').update(`${adapterId}:${recipientReference}`).digest('hex');
}

export function encryptPayoutRecipientReference(recipientReference: string): string {
  const value = String(recipientReference || '').trim();
  if (!value || value.length > 2048) {
    throw new PayoutError('Payout recipient reference is invalid.', 400, 'INVALID_RECIPIENT_REFERENCE');
  }
  return encrypt(value);
}

function decryptPayoutRecipientReference(ciphertext: string): string {
  try {
    return decrypt(ciphertext);
  } catch {
    throw new PayoutError(
      'The tokenized payout destination cannot be opened. Re-enroll this employee.',
      409,
      'PAYOUT_DESTINATION_NOT_READY',
    );
  }
}

export class PostgresPayoutRepository implements PayoutRepository {
  constructor(
    private readonly executor: Queryable = applicationPool,
    private readonly rootPool: Pool = applicationPool,
    private readonly insideTransaction = false,
  ) {}

  async transaction<T>(work: (repository: PayoutRepository) => Promise<T>): Promise<T> {
    if (this.insideTransaction) return work(this);
    const client = await this.rootPool.connect();
    try {
      await client.query('BEGIN');
      const transactional = new PostgresPayoutRepository(client, this.rootPool, true);
      const result = await work(transactional);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async acquireLock(scope: string): Promise<void> {
    if (!this.insideTransaction) {
      throw new Error('Payout advisory locks require a transaction');
    }
    await this.executor.query('SELECT pg_advisory_xact_lock(hashtext($1))', [scope]);
  }

  async getSettings(companyId: string): Promise<PayoutSettings | null> {
    const result = await this.executor.query(
      `SELECT company_id,country,currency,adapter_id,updated_at
       FROM payout_company_settings WHERE company_id=$1`,
      [companyId],
    );
    return result.rows[0] ? mapSettings(result.rows[0]) : null;
  }

  async saveSettings(input: {
    companyId: string;
    country: string;
    currency: string;
    adapterId: string | null;
    actorId: string;
  }): Promise<PayoutSettings> {
    const result = await this.executor.query(
      `INSERT INTO payout_company_settings(company_id,country,currency,adapter_id,updated_by)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(company_id) DO UPDATE SET
         country=EXCLUDED.country,currency=EXCLUDED.currency,
         adapter_id=EXCLUDED.adapter_id,updated_by=EXCLUDED.updated_by,updated_at=NOW()
       RETURNING company_id,country,currency,adapter_id,updated_at`,
      [input.companyId, input.country, input.currency, input.adapterId, input.actorId],
    );
    return mapSettings(result.rows[0]);
  }

  async isAccountingSyncConfigured(companyId: string): Promise<boolean> {
    const result = await this.executor.query(
      `SELECT 1 FROM integrations
       WHERE company_id=$1 AND provider='quickbooks' AND is_active=TRUE
         AND access_token IS NOT NULL AND refresh_token IS NOT NULL LIMIT 1`,
      [companyId],
    );
    return Boolean(result.rowCount);
  }

  async listAccounts(companyId: string, settings: PayoutSettings | null): Promise<PayoutAccountSummary[]> {
    const result = await this.executor.query(
      `SELECT u.id,u.first_name,u.last_name,u.full_name,u.email,COALESCE(u.is_active,TRUE) is_active,
              pa.id account_id,pa.status destination_status,pa.destination_last4,pa.destination_label
       FROM users u
       LEFT JOIN payout_accounts pa
         ON pa.company_id=u.company_id AND pa.employee_id=u.id
        AND pa.provider=$2 AND pa.country=$3 AND pa.currency=$4
       WHERE u.company_id=$1 AND LOWER(COALESCE(u.role,'employee')) NOT IN ('boss','owner')
       ORDER BY COALESCE(NULLIF(u.last_name,''),NULLIF(u.full_name,''),u.email),u.first_name`,
      [
        companyId,
        settings?.adapterId || '__unconfigured__',
        settings?.country || 'ZZ',
        settings?.currency || 'ZZZ',
      ],
    );
    return result.rows.map((row: any) => {
      const configured = Boolean(row.account_id && row.destination_status === 'active' && row.is_active);
      const status: PayoutAccountSummary['status'] = !settings
        ? 'unsupported_country'
        : !row.is_active || (row.account_id && row.destination_status !== 'active')
          ? 'inactive'
          : configured
            ? 'ready'
            : 'missing_destination';
      return {
        employeeId: String(row.id),
        employeeName: String(row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email || 'Employee'),
        email: row.email ? String(row.email) : null,
        country: settings?.country || '',
        currency: settings?.currency || '',
        status,
        destination: {
          configured,
          last4: configured && row.destination_last4 ? String(row.destination_last4) : null,
          label: configured && row.destination_label ? String(row.destination_label) : null,
        },
      };
    });
  }

  async assertEmployee(companyId: string, employeeId: string): Promise<void> {
    const result = await this.executor.query(
      `SELECT 1 FROM users
       WHERE id=$1 AND company_id=$2 AND COALESCE(is_active,TRUE)=TRUE
         AND LOWER(COALESCE(role,'employee')) NOT IN ('boss','owner')`,
      [employeeId, companyId],
    );
    if (!result.rowCount) throw new PayoutError('Employee was not found in your company.', 404, 'EMPLOYEE_NOT_FOUND');
  }

  async listPayrolls(
    companyId: string,
    _settings: PayoutSettings | null,
  ): Promise<Array<Omit<PayrollSummary, 'eligible' | 'reason' | 'totalFormatted'>>> {
    const result = await this.executor.query(
      `SELECT p.id,p.period_start,p.period_end,COALESCE(p.status,'draft') status,
              p.payout_country,p.payout_currency,p.payout_calculation_engine,
              p.payout_calculation_version,p.payout_certified_at,
              COUNT(DISTINCT pi.employee_id)::integer employee_count,
              COALESCE(ROUND(SUM(GREATEST(COALESCE(pi.final_pay,0),0))*100),0)::bigint total_minor,
              EXISTS(SELECT 1 FROM payout_batches pb WHERE pb.company_id=p.company_id AND pb.payroll_id=p.id) has_batch
       FROM payrolls p
       LEFT JOIN payroll_items pi ON pi.payroll_id=p.id
       WHERE p.company_id=$1
       GROUP BY p.id,p.period_start,p.period_end,p.status,p.created_at,
                p.payout_country,p.payout_currency,p.payout_calculation_engine,
                p.payout_calculation_version,p.payout_certified_at
       ORDER BY p.period_end DESC,p.created_at DESC LIMIT 100`,
      [companyId],
    );
    return result.rows.map((row: any) => {
      const payoutCountry = row.payout_country ? String(row.payout_country).trim() : null;
      const payoutCurrency = row.payout_currency ? String(row.payout_currency).trim() : null;
      return {
        id: String(row.id),
        periodStart: dateOnly(row.period_start),
        periodEnd: dateOnly(row.period_end),
        status: String(row.status),
        payoutCountry,
        payoutCurrency,
        payoutCalculationEngine: row.payout_calculation_engine
          ? String(row.payout_calculation_engine)
          : null,
        payoutCalculationVersion: row.payout_calculation_version
          ? String(row.payout_calculation_version)
          : null,
        payoutCertifiedAt: row.payout_certified_at ? iso(row.payout_certified_at) : null,
        // Compatibility fields intentionally reflect payroll provenance, never company settings.
        country: payoutCountry || '',
        currency: payoutCurrency || '',
        employeeCount: Number(row.employee_count),
        totalMinor: safeInteger(row.total_minor, 'Payroll total'),
        hasBatch: Boolean(row.has_batch),
      };
    }) as any;
  }

  async getPayrollSnapshot(input: {
    companyId: string;
    payrollId: string;
    country: string;
    currency: string;
    adapterId: string;
    lock?: boolean;
  }): Promise<PayrollSnapshot | null> {
    const payroll = await this.executor.query(
      `SELECT id,company_id,period_start,period_end,COALESCE(status,'draft') status,
              payout_country,payout_currency,payout_calculation_engine,
              payout_calculation_version,payout_certified_at
       FROM payrolls WHERE id=$1 AND company_id=$2${input.lock ? ' FOR UPDATE' : ''}`,
      [input.payrollId, input.companyId],
    );
    if (!payroll.rowCount) return null;
    const lines = await this.executor.query(
      `SELECT u.id employee_id,u.first_name,u.last_name,u.full_name,u.email,
              ROUND(SUM(GREATEST(COALESCE(pi.final_pay,0),0))*100)::bigint amount_minor,
              pa.provider_recipient_ref,pa.status destination_status
       FROM payroll_items pi
       JOIN users u ON u.id=pi.employee_id AND u.company_id=$2
       LEFT JOIN payout_accounts pa
         ON pa.company_id=u.company_id AND pa.employee_id=u.id
        AND pa.provider=$3 AND pa.country=$4 AND pa.currency=$5
       WHERE pi.payroll_id=$1
       GROUP BY u.id,u.first_name,u.last_name,u.full_name,u.email,
                pa.provider_recipient_ref,pa.status
       HAVING SUM(GREATEST(COALESCE(pi.final_pay,0),0))>0
       ORDER BY u.id`,
      [input.payrollId, input.companyId, input.adapterId, input.country, input.currency],
    );
    const row = payroll.rows[0];
    const payoutCountry = row.payout_country ? String(row.payout_country).trim() : null;
    const payoutCurrency = row.payout_currency ? String(row.payout_currency).trim() : null;
    return {
      payrollId: String(row.id),
      companyId: String(row.company_id),
      periodStart: dateOnly(row.period_start),
      periodEnd: dateOnly(row.period_end),
      payrollStatus: String(row.status),
      payoutCountry,
      payoutCurrency,
      payoutCalculationEngine: row.payout_calculation_engine
        ? String(row.payout_calculation_engine)
        : null,
      payoutCalculationVersion: row.payout_calculation_version
        ? String(row.payout_calculation_version)
        : null,
      payoutCertifiedAt: row.payout_certified_at ? iso(row.payout_certified_at) : null,
      country: payoutCountry || '',
      currency: payoutCurrency || '',
      lines: lines.rows.map((line: any) => {
        const encryptedReference = line.provider_recipient_ref ? String(line.provider_recipient_ref) : null;
        const recipientReference = encryptedReference
          ? decryptPayoutRecipientReference(encryptedReference)
          : null;
        return {
          employeeId: String(line.employee_id),
          employeeName: String(line.full_name || `${line.first_name || ''} ${line.last_name || ''}`.trim() || line.email || 'Employee'),
          email: line.email ? String(line.email) : null,
          amountMinor: safeInteger(line.amount_minor, 'Employee payout'),
          recipientReference,
          destinationFingerprint: recipientReference ? fingerprint(input.adapterId, recipientReference) : null,
          destinationStatus: line.destination_status ? String(line.destination_status) : null,
        };
      }),
    };
  }

  async listBatches(companyId: string, limit: number): Promise<StoredPayoutBatch[]> {
    const result = await this.executor.query(
      `SELECT * FROM payout_batches WHERE company_id=$1 ORDER BY created_at DESC LIMIT $2`,
      [companyId, limit],
    );
    return result.rows.map(mapBatch);
  }

  async getBatch(companyId: string, batchId: string, lock = false): Promise<StoredPayoutBatch | null> {
    const result = await this.executor.query(
      `SELECT * FROM payout_batches WHERE id=$1 AND company_id=$2${lock ? ' FOR UPDATE' : ''}`,
      [batchId, companyId],
    );
    return result.rows[0] ? mapBatch(result.rows[0]) : null;
  }

  async createBatch(batch: StoredPayoutBatch, items: StoredBatchItem[]): Promise<StoredPayoutBatch> {
    if (!this.insideTransaction) throw new Error('Payout batches must be created in a transaction');
    const created = await this.executor.query(
      `INSERT INTO payout_batches
         (id,company_id,payroll_id,country,currency,adapter_id,adapter_configuration_version,
          calculation_engine,calculation_version,calculation_certified_at,status,employee_count,total_minor,
          created_by,approved_by,approved_at,provider_reference,execution_key_hash,failure_code,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [
        batch.id,batch.companyId,batch.payrollId,batch.country,batch.currency,batch.adapterId,
        batch.adapterConfigurationVersion,batch.calculationEngine,batch.calculationVersion,
        batch.calculationCertifiedAt,batch.status,batch.employeeCount,batch.totalMinor,batch.createdBy,
        batch.approvedBy,batch.approvedAt,batch.providerReference,batch.executionKeyHash,
        batch.failureCode,batch.createdAt,batch.updatedAt,
      ],
    );
    for (const item of items) {
      await this.executor.query(
        `INSERT INTO payout_batch_items(company_id,batch_id,employee_id,amount_minor,currency,destination_fingerprint)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [batch.companyId, batch.id, item.employeeId, item.amountMinor, item.currency, item.destinationFingerprint],
      );
    }
    return mapBatch(created.rows[0]);
  }

  async updateBatch(
    companyId: string,
    batchId: string,
    patch: Partial<StoredPayoutBatch>,
  ): Promise<StoredPayoutBatch> {
    const columns: Array<[keyof StoredPayoutBatch, string]> = [
      ['status', 'status'],
      ['approvedBy', 'approved_by'],
      ['approvedAt', 'approved_at'],
      ['providerReference', 'provider_reference'],
      ['executionKeyHash', 'execution_key_hash'],
      ['failureCode', 'failure_code'],
    ];
    const selected = columns.filter(([key]) => patch[key] !== undefined);
    if (!selected.length) {
      const existing = await this.getBatch(companyId, batchId);
      if (!existing) throw new PayoutError('Payout batch was not found.', 404, 'PAYOUT_BATCH_NOT_FOUND');
      return existing;
    }
    const values = selected.map(([key]) => patch[key]);
    const setters = selected.map(([, column], index) => `${column}=$${index + 3}`);
    const result = await this.executor.query(
      `UPDATE payout_batches SET ${setters.join(',')},updated_at=NOW()
       WHERE id=$1 AND company_id=$2 RETURNING *`,
      [batchId, companyId, ...values],
    );
    if (!result.rowCount) throw new PayoutError('Payout batch was not found.', 404, 'PAYOUT_BATCH_NOT_FOUND');
    return mapBatch(result.rows[0]);
  }

  async listExecutionItems(companyId: string, batchId: string): Promise<StoredBatchItem[]> {
    const result = await this.executor.query(
      `SELECT bi.employee_id,bi.amount_minor,bi.currency,bi.destination_fingerprint,b.adapter_id,
              pa.provider_recipient_ref
       FROM payout_batches b
       JOIN payout_batch_items bi ON bi.batch_id=b.id AND bi.company_id=b.company_id
       JOIN users u ON u.id=bi.employee_id AND u.company_id=b.company_id AND COALESCE(u.is_active,TRUE)=TRUE
       LEFT JOIN payout_accounts pa
         ON pa.company_id=b.company_id AND pa.employee_id=bi.employee_id
        AND pa.provider=b.adapter_id AND pa.country=b.country AND pa.currency=b.currency
        AND pa.status='active'
       WHERE b.id=$1 AND b.company_id=$2 ORDER BY bi.employee_id`,
      [batchId, companyId],
    );
    return result.rows.map((row: any) => {
      const encryptedReference = row.provider_recipient_ref ? String(row.provider_recipient_ref) : null;
      const recipientReference = encryptedReference
        ? decryptPayoutRecipientReference(encryptedReference)
        : null;
      return {
        employeeId: String(row.employee_id),
        amountMinor: safeInteger(row.amount_minor, 'Employee payout'),
        currency: String(row.currency).trim(),
        destinationFingerprint: String(row.destination_fingerprint),
        currentDestinationFingerprint: recipientReference
          ? fingerprint(String(row.adapter_id), recipientReference)
          : null,
        // Plaintext is transient and is never persisted in a batch or API response.
        recipientReference,
      };
    });
  }

  async appendEvent(input: {
    companyId: string;
    batchId: string;
    type: string;
    actorId: string | null;
    details?: Record<string, unknown>;
  }): Promise<PayoutEvent> {
    assertNoRawBankingData(input.details || {}, 'payout event');
    const result = await this.executor.query(
      `INSERT INTO payout_events(company_id,batch_id,event_type,actor_id,details)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [input.companyId, input.batchId, input.type, input.actorId, input.details || {}],
    );
    return mapEvent(result.rows[0]);
  }

  async listEvents(companyId: string, batchId: string): Promise<PayoutEvent[]> {
    const result = await this.executor.query(
      `SELECT id,event_type,actor_id,details,created_at FROM payout_events
       WHERE company_id=$1 AND batch_id=$2 ORDER BY created_at ASC,id ASC`,
      [companyId, batchId],
    );
    return result.rows.map(mapEvent);
  }

  async getIdempotency(companyId: string, scope: string, key: string): Promise<IdempotencyRecord | null> {
    const result = await this.executor.query(
      `SELECT request_hash,batch_id FROM payout_idempotency
       WHERE company_id=$1 AND scope=$2 AND idempotency_key=$3`,
      [companyId, scope, key],
    );
    return result.rows[0]
      ? { requestHash: String(result.rows[0].request_hash), batchId: String(result.rows[0].batch_id) }
      : null;
  }

  async saveIdempotency(input: {
    companyId: string;
    scope: string;
    key: string;
    requestHash: string;
    batchId: string;
  }): Promise<void> {
    await this.executor.query(
      `INSERT INTO payout_idempotency(company_id,scope,idempotency_key,request_hash,batch_id)
       VALUES($1,$2,$3,$4,$5)`,
      [input.companyId, input.scope, input.key, input.requestHash, input.batchId],
    );
  }
}
