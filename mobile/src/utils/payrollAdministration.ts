import { payrollAmount, payrollDate } from "./manualPayroll";
export type PayrollSettings = {
  payroll_schedule: string;
  payroll_day: string;
  payroll_time: string;
  default_hourly_rate: string;
  overtime_multiplier: string;
  tax_rate: string;
};
export function settingsPayload(input: PayrollSettings) {
  if (!["weekly", "biweekly", "monthly"].includes(input.payroll_schedule))
    throw Error("Choose a supported payroll schedule.");
  const day = payrollAmount(input.payroll_day),
    monthly = input.payroll_schedule === "monthly";
  if (
    !Number.isInteger(day) ||
    day < (monthly ? 1 : 0) ||
    day > (monthly ? 31 : 6)
  )
    throw Error("Enter a valid payroll day for this schedule.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.payroll_time))
    throw Error("Enter a valid payroll time (HH:mm).");
  const rate = payrollAmount(input.default_hourly_rate),
    multiplier = payrollAmount(input.overtime_multiplier),
    tax = payrollAmount(input.tax_rate);
  if (
    rate <= 0 ||
    rate > 1000000 ||
    multiplier < 1 ||
    multiplier > 10 ||
    tax > 100
  )
    throw Error(
      "Check the rate, overtime multiplier and legacy tax percentage.",
    );
  return {
    ...input,
    payroll_day: day,
    default_hourly_rate: rate,
    overtime_multiplier: multiplier,
    tax_rate: tax,
  };
}
export function compensationPayload(
  ids: string[],
  permitted: string[],
  kind: string,
  value: string,
  effective: string,
) {
  const employeeIds = [...new Set(ids)];
  if (!employeeIds.length || employeeIds.some((id) => !permitted.includes(id)))
    throw Error("Select employees from the current company list.");
  const amount = payrollAmount(value);
  if (amount <= 0 || amount > 1000000)
    throw Error("Enter a positive compensation value.");
  const effectiveDate = payrollDate(effective);
  if (kind === "absolute") {
    if (employeeIds.length !== 1)
      throw Error("An exact rate requires exactly one employee.");
    return {
      path: "/payroll/employees/rate",
      body: { employeeId: employeeIds[0], hourlyRate: amount, effectiveDate },
    };
  }
  if (!["percentage", "fixed"].includes(kind))
    throw Error("Choose a supported compensation change.");
  return {
    path: "/payroll/employees/compensation",
    body: { employeeIds, raiseType: kind, raiseValue: amount, effectiveDate },
  };
}
export function compensationScenario(
  ids: string[],
  permitted: string[],
  type: string,
  value: string,
) {
  if (!["raise_percent", "raise_fixed", "hire_count"].includes(type))
    throw Error("Choose a supported scenario.");
  const selected = [...new Set(ids)];
  if (!selected.length || selected.some((id) => !permitted.includes(id)))
    throw Error("Select employees from the current company list.");
  const amount = payrollAmount(value);
  if (
    amount <= 0 ||
    amount > 1000000 ||
    (type === "hire_count" && !Number.isInteger(amount))
  )
    throw Error(
      "Enter a positive scenario value; hiring counts must be whole numbers.",
    );
  return { employeeIds: selected, scenarioType: type, scenarioValue: amount };
}
