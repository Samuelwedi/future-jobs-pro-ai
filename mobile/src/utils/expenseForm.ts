export type ExpenseForm = {vendor:string;amount:string;currency:string;spentOn:string;notes:string};
export function localExpenseDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
export function expenseInputError(form: ExpenseForm): string | null {
  if (!form.vendor.trim() || form.vendor.trim().length > 200) return 'Enter a vendor name up to 200 characters.';
  if (!/^\d+(\.\d{1,2})?$/.test(form.amount.trim()) || Number(form.amount) <= 0 || Number(form.amount) > 1000000) return 'Enter an amount between 0.01 and 1000000, with up to two decimals.';
  if (!['CAD','USD'].includes(form.currency)) return 'Choose CAD or USD.';
  if (form.spentOn.startsWith('0000') || !/^\d{4}-\d{2}-\d{2}$/.test(form.spentOn)) return 'Use a valid date in YYYY-MM-DD format.';
  const date = new Date(`${form.spentOn}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== form.spentOn) return 'Use a valid date in YYYY-MM-DD format.';
  if (form.notes.length > 4000) return 'Keep notes under 4000 characters.';
  return null;
}
