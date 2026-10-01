CREATE TABLE IF NOT EXISTS company_payroll_rule_versions (
 company_id uuid NOT NULL REFERENCES companies(id),
 revision integer NOT NULL CHECK(revision>0),
 rules jsonb NOT NULL,
 rules_hash text NOT NULL,
 classification text NOT NULL CHECK(classification IN ('reference_rules_review_required','custom_rules_review_required')),
 reason text NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,revision)
);
CREATE OR REPLACE FUNCTION preserve_payroll_rule_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Payroll rule history is immutable; save a new revision'; END $$;
DROP TRIGGER IF EXISTS payroll_rule_history_immutable ON company_payroll_rule_versions;
CREATE TRIGGER payroll_rule_history_immutable BEFORE UPDATE OR DELETE ON company_payroll_rule_versions FOR EACH ROW EXECUTE FUNCTION preserve_payroll_rule_history();
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS calculation_snapshot jsonb;
ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS manual_review jsonb;
CREATE TABLE IF NOT EXISTS manual_payroll_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES companies(id),
 payroll_id uuid NOT NULL REFERENCES payrolls(id),
 payroll_item_id uuid NOT NULL UNIQUE REFERENCES payroll_items(id),
 amount numeric(14,2) NOT NULL CHECK(amount>=0),
 currency text NOT NULL,
 paid_on date NOT NULL,
 reference text NOT NULL,
 recorded_by uuid NOT NULL REFERENCES users(id),
 recorded_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS manual_payment_immutable ON manual_payroll_payments;
CREATE TRIGGER manual_payment_immutable BEFORE UPDATE OR DELETE ON manual_payroll_payments FOR EACH ROW EXECUTE FUNCTION preserve_payroll_rule_history();
CREATE OR REPLACE FUNCTION protect_reviewed_payroll_items() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent uuid; state text;
BEGIN
 parent=CASE WHEN TG_OP='DELETE' THEN OLD.payroll_id ELSE NEW.payroll_id END;
 SELECT status INTO state FROM payrolls WHERE id=parent FOR UPDATE;
 IF TG_OP='DELETE' AND state IS NULL THEN RETURN OLD; END IF;
 IF state IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Reviewed payroll items cannot be changed'; END IF;
 IF TG_OP='UPDATE' AND OLD.payroll_id IS DISTINCT FROM NEW.payroll_id THEN RAISE EXCEPTION 'Payroll items cannot be moved'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DROP TRIGGER IF EXISTS reviewed_payroll_items_immutable ON payroll_items;
CREATE TRIGGER reviewed_payroll_items_immutable BEFORE INSERT OR UPDATE OR DELETE ON payroll_items FOR EACH ROW EXECUTE FUNCTION protect_reviewed_payroll_items();

CREATE OR REPLACE FUNCTION protect_reviewed_payroll() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Only draft payroll can be deleted'; END IF;
  RETURN OLD;
 END IF;
 IF OLD.status IS DISTINCT FROM 'draft' AND
 (NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.period_start IS DISTINCT FROM OLD.period_start OR NEW.period_end IS DISTINCT FROM OLD.period_end OR NEW.total_hours IS DISTINCT FROM OLD.total_hours OR NEW.total_pay IS DISTINCT FROM OLD.total_pay OR NEW.manual_review IS DISTINCT FROM OLD.manual_review OR NEW.status NOT IN (OLD.status,'paid'))
 THEN RAISE EXCEPTION 'Reviewed payroll is immutable'; END IF;
 IF OLD.status='draft' AND NEW.status IS DISTINCT FROM 'draft' THEN
  IF NEW.status IS DISTINCT FROM 'approved' OR NEW.manual_review IS NULL OR NOT EXISTS(SELECT 1 FROM payroll_items WHERE payroll_id=NEW.id) OR EXISTS(SELECT 1 FROM payroll_items WHERE payroll_id=NEW.id AND calculation_snapshot IS NULL)
  THEN RAISE EXCEPTION 'Every item requires calculation and payroll requires review'; END IF;
 END IF;
 IF NEW.status='paid' AND OLD.status IS DISTINCT FROM 'paid' AND
 (OLD.status IS DISTINCT FROM 'approved' OR NEW.manual_review IS NULL OR EXISTS(SELECT 1 FROM payroll_items pi WHERE pi.payroll_id=NEW.id AND NOT EXISTS(SELECT 1 FROM manual_payroll_payments mp WHERE mp.payroll_item_id=pi.id)))
 THEN RAISE EXCEPTION 'Every manual payment must be recorded'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reviewed_payroll_immutable ON payrolls;
CREATE TRIGGER reviewed_payroll_immutable BEFORE UPDATE OR DELETE ON payrolls FOR EACH ROW EXECUTE FUNCTION protect_reviewed_payroll();

CREATE OR REPLACE FUNCTION validate_manual_payroll_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snap jsonb; employer uuid; employee_company uuid; state text; review jsonb;
BEGIN
 SELECT pi.calculation_snapshot,p.company_id,u.company_id,p.status,p.manual_review INTO snap,employer,employee_company,state,review
 FROM payroll_items pi JOIN payrolls p ON p.id=pi.payroll_id JOIN users u ON u.id=pi.employee_id
 WHERE pi.id=NEW.payroll_item_id AND p.id=NEW.payroll_id FOR UPDATE OF p;
 IF snap IS NULL OR review IS NULL OR state NOT IN ('approved','paid') OR employer IS DISTINCT FROM NEW.company_id OR employee_company IS DISTINCT FROM employer
 OR NEW.amount IS DISTINCT FROM (snap->>'net')::numeric OR NEW.currency IS DISTINCT FROM snap->>'currency' OR NEW.paid_on IS DISTINCT FROM (snap->>'payDate')::date
 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.recorded_by AND company_id=employer AND lower(role) IN ('boss','owner','manager','admin'))
 THEN RAISE EXCEPTION 'Payment must match the reviewed company payroll and authorized recorder'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS manual_payment_provenance ON manual_payroll_payments;
CREATE TRIGGER manual_payment_provenance BEFORE INSERT ON manual_payroll_payments FOR EACH ROW EXECUTE FUNCTION validate_manual_payroll_payment();
