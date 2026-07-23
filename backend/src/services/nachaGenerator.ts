interface NachaItem {
  employeeName: string;
  routingNumber: string;
  accountNumber: string;
  accountType: string; // 'checking' or 'savings'
  amount: number;
}

interface NachaOptions {
  companyName: string;
  companyId: string;
  effectiveDate: string; // YYYY-MM-DD
  items: NachaItem[];
}

/**
 * Generate a NACHA file (standard ACH format) for direct deposit.
 * This is a simplified version – you may need to adjust for your bank's requirements.
 */
export function generateNachaFile(options: NachaOptions): string {
  const { companyName, companyId, effectiveDate, items } = options;

  // ─── File Header Record (1) ───
  let nacha = '';
  const fileHeader =
    `101 ${companyId.padStart(10, '0')} ${'0000000000'.padStart(10, '0')} ${effectiveDate.replace(/-/g, '')} ${Date.now().toString().slice(0, 4)} A ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' ' `;
  nacha += fileHeader + '\n';

  // ─── Company/Batch Header Record (5) ───
  const batchHeader =
    `5 ${companyName.padEnd(16)} ${'0000000000'.padStart(10, '0')} ${'PPD'.padEnd(3)} ${'payroll'.padEnd(10)} ${'1'.padStart(4, '0')} `;
  nacha += batchHeader + '\n';

  // ─── Entry Detail Records (6) ───
  let totalAmount = 0;
  let entryCount = 0;
  for (const item of items) {
    const routing = item.routingNumber.padStart(9, '0');
    const account = item.accountNumber.padStart(17, ' ');
    const amount = Math.round(item.amount * 100).toString().padStart(10, '0');
    const name = item.employeeName.substring(0, 16).padEnd(22);
    const transactionCode = item.accountType === 'savings' ? '22' : '22'; // 22 = checking credit, 32 = savings credit
    const entry = `6 ${routing} ${account} ${amount} ${name} ${' '.repeat(8)} ${' '.repeat(15)} ${' '.repeat(3)} `;
    nacha += entry + '\n';
    totalAmount += item.amount;
    entryCount++;
  }

  // ─── Batch Control Record (8) ───
  const batchControl =
    `8 ${entryCount.toString().padStart(6, '0')} ${Math.round(totalAmount * 100).toString().padStart(12, '0')} ${' '.repeat(39)} `;
  nacha += batchControl + '\n';

  // ─── File Control Record (9) ───
  const fileControl =
    `9 ${'1'.padStart(6, '0')} ${entryCount.toString().padStart(6, '0')} ${Math.round(totalAmount * 100).toString().padStart(12, '0')} ${' '.repeat(39)} `;
  nacha += fileControl + '\n';

  return nacha;
}