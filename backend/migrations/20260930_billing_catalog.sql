ALTER TABLE mobile_subscription_transactions DROP CONSTRAINT IF EXISTS mobile_subscription_transactions_plan_key_check;
ALTER TABLE mobile_subscription_transactions ADD CONSTRAINT mobile_subscription_transactions_plan_key_check
 CHECK(plan_key IN ('basic','professional','enterprise','team_10','team_35','team_50','team_65','team_80','team_95','team_110'));
-- Enforce configured active-account caps on every user creation/reactivation path.
INSERT INTO ops_limits(company_id,employees,monthly_ai_requests,document_bytes)
 SELECT c.id,GREATEST(10,(SELECT count(*) FROM users u WHERE u.company_id=c.id AND COALESCE(u.is_active,true))::integer),100,1048576000
 FROM companies c WHERE c.subscription_tier='trial'
 ON CONFLICT(company_id) DO NOTHING;
-- Existing users remain intact; a downgrade blocks additions until within allowance.
CREATE OR REPLACE FUNCTION enforce_company_account_allowance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowance integer; used integer;
BEGIN
 IF NEW.company_id IS NULL OR NOT COALESCE(NEW.is_active,true) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id AND COALESCE(OLD.is_active,true) THEN RETURN NEW; END IF;
 PERFORM id FROM companies WHERE id=NEW.company_id FOR UPDATE;
 SELECT employees INTO allowance FROM ops_limits WHERE company_id=NEW.company_id;
 IF allowance IS NULL THEN RETURN NEW; END IF;
 SELECT count(*) INTO used FROM users WHERE company_id=NEW.company_id AND COALESCE(is_active,true) AND id<>NEW.id;
 IF used>=allowance THEN RAISE EXCEPTION 'Active account allowance reached; upgrade the company plan'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS company_account_allowance ON users;
CREATE TRIGGER company_account_allowance BEFORE INSERT OR UPDATE OF company_id,is_active ON users
 FOR EACH ROW EXECUTE FUNCTION enforce_company_account_allowance();
