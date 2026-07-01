import { pool } from '../config/database';

export async function getRulesForContext(userId: string, context: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT rule_text FROM user_rules
     WHERE user_id = $1 AND is_active = TRUE AND $2 LIKE '%' || trigger_context || '%'`,
    [userId, context]
  );
  return result.rows.map(r => r.rule_text);
}

export async function addRule(userId: string, triggerContext: string, ruleText: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_rules (user_id, trigger_context, rule_text) VALUES ($1, $2, $3)`,
    [userId, triggerContext, ruleText]
  );
}