const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

// Exercise the real generator without loading database configuration or opening connections.
function loadRecurringGenerator(pool) {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/recurringShiftGenerator.ts'), 'utf8');
  const script = stripTypeScriptTypes(source)
    .replace("import { pool } from '../config/database';", '')
    .replace('export async function', 'async function');
  return vm.runInNewContext(`${script}\ngenerateShiftsForRecurringRule;`, { pool, Date });
}

test('recurring generation preserves ISO calendar dates across server timezones and DST', async () => {
  const previousTimezone = process.env.TZ;
  try {
    for (const timezone of ['UTC', 'America/Los_Angeles', 'Pacific/Auckland']) {
      process.env.TZ = timezone;
      for (const [start, end, weekday, expected] of [
        ['2026-10-26', '2026-10-26', 1, ['2026-10-26']],
        ['2026-03-01', '2026-03-15', 0, ['2026-03-01', '2026-03-08', '2026-03-15']],
        ['2026-10-25', '2026-11-08', 0, ['2026-10-25', '2026-11-01', '2026-11-08']],
      ]) {
        const insertedDates = [];
        const checkedDates = [];
        const pool = { async query(sql, values) {
          if (sql.includes('SELECT * FROM recurring_shifts')) return { rows: [{
            day_of_week: weekday, start_time: '09:00:00', end_time: '17:00:00', employee_id: 'employee',
          }] };
          if (sql.includes('SELECT id FROM shifts')) {
            checkedDates.push(values[0]);
            return { rows: [] };
          }
          if (sql.includes('INSERT INTO shifts')) {
            insertedDates.push(values[1]);
            return { rows: [{ id: `shift-${insertedDates.length}` }] };
          }
          if (sql.includes('INSERT INTO shift_assignments')) return { rows: [] };
          throw new Error(`Unexpected query: ${sql}`);
        } };
        const generate = loadRecurringGenerator(pool);
        const count = await generate({ recurringShiftId: 'rule', startDate: new Date(start),
          endDate: new Date(end), companyId: 'company', createdBy: 'manager' });
        assert.deepEqual(insertedDates, expected, `${timezone}: ${start} through ${end}`);
        assert.deepEqual(checkedDates, expected);
        assert.equal(count, expected.length);
      }
    }
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('recurring generation cannot use a rule belonging to another company', async () => {
  let queries = 0;
  const pool = { async query(sql, values) {
    queries++;
    assert.match(sql, /company_id = \$2/);
    assert.deepEqual(Array.from(values), ['other-company-rule', 'current-company']);
    return { rows: [] };
  } };
  const generate = loadRecurringGenerator(pool);
  await assert.rejects(generate({ recurringShiftId: 'other-company-rule',
    startDate: new Date('2026-10-26'), endDate: new Date('2026-10-26'),
    companyId: 'current-company', createdBy: 'manager' }), /not found or inactive/);
  assert.equal(queries, 1);
});
