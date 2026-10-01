-- Preserve currency minor units (including three- and four-decimal currencies).
-- Calculation snapshots remain authoritative; legacy two-decimal ledger fields are not relabeled.
ALTER TABLE manual_payroll_payments ALTER COLUMN amount TYPE numeric(20,4);
