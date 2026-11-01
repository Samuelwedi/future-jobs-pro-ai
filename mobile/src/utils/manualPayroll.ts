export type PayrollLine = {
  id: string;
  label: string;
  method: string;
  annualCap: number | null;
};
export type PayrollRules = {
  engine?: string;
  country: string;
  subdivision: string;
  currency: string;
  lines?: PayrollLine[];
};
export type PayrollInput = Record<string, unknown> & {
  manualAmounts?: Record<string, string>;
  ytd?: Record<string, string>;
};
export const regularFields = [
  "gross",
  "cppYtd",
  "cpp2Ytd",
  "eiYtd",
  "pensionableYtd",
  "additionalTax",
] as const;
export function payrollDate(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value + "T00:00:00Z")) ||
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value
  )
    throw Error("Enter a valid date (YYYY-MM-DD).");
  return value;
}
export function payrollPeriod(start: string, end: string) {
  payrollDate(start);
  payrollDate(end);
  if (end < start) throw Error("The period end must be on or after its start.");
  return { periodStart: start, periodEnd: end };
}
export function payrollAmount(value: unknown) {
  const raw = String(value ?? "").trim();
  if (
    !/^\d+(?:\.\d+)?$/.test(raw) ||
    !Number.isFinite(Number(raw)) ||
    Number(raw) > 1000000000
  )
    throw Error(
      "Enter every required amount, including zero where appropriate.",
    );
  return Number(raw);
}
export function newPayrollInput(
  rules: PayrollRules,
  gross: string,
): PayrollInput {
  return rules.engine === "company_rules_v1"
    ? {
        payDate: "",
        gross,
        taxable: "",
        manualAmounts: Object.fromEntries(
          (rules.lines || [])
            .filter((l) => l.method === "manual")
            .map((l) => [l.id, ""]),
        ),
        ytd: Object.fromEntries(
          (rules.lines || [])
            .filter((l) => l.annualCap !== null)
            .map((l) => [l.id, ""]),
        ),
        reviewReference: "",
        companyRulesConfirmed: false,
      }
    : {
        payDate: "",
        gross,
        cppYtd: "",
        cpp2Ytd: "",
        eiYtd: "",
        pensionableYtd: "",
        additionalTax: "",
        federalClaim: "",
        provincialClaim: "",
        standardCaseConfirmed: false,
      };
}
export function payrollCalculationInput(
  rules: PayrollRules,
  input: PayrollInput,
) {
  const payDate = payrollDate(String(input.payDate || ""));
  if (rules.engine === "company_rules_v1") {
    if (
      input.companyRulesConfirmed !== true ||
      String(input.reviewReference || "").trim().length < 8
    )
      throw Error(
        "Confirm the calculation scope and provide the review reference.",
      );
    return {
      payDate,
      gross: payrollAmount(input.gross),
      taxable: payrollAmount(input.taxable),
      manualAmounts: Object.fromEntries(
        (rules.lines || [])
          .filter((l) => l.method === "manual")
          .map((l) => [l.id, payrollAmount(input.manualAmounts?.[l.id])]),
      ),
      ytd: Object.fromEntries(
        (rules.lines || [])
          .filter((l) => l.annualCap !== null)
          .map((l) => [l.id, payrollAmount(input.ytd?.[l.id])]),
      ),
      reviewReference: String(input.reviewReference).trim(),
      companyRulesConfirmed: true,
    };
  }
  if (input.standardCaseConfirmed !== true)
    throw Error("Confirm calculation scope");
  const claims = Object.fromEntries(
    ["federalClaim", "provincialClaim"]
      .filter((k) => String(input[k] ?? "").trim() !== "")
      .map((k) => [k, payrollAmount(input[k])]),
  );
  return {
    payDate,
    ...Object.fromEntries(
      regularFields.map((k) => [k, payrollAmount(input[k])]),
    ),
    ...claims,
    standardCaseConfirmed: true,
  };
}
// Financial mutations require an explicit online action; they must never replay later.
export const isPayrollMutation = (url: string) =>
  /^\/(payroll|payroll-rules|manual-payroll)(\/|$)/.test(url);
