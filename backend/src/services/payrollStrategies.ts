import Big from 'big.js';

// ─── Types ────────────────────────────────────────────────────────
interface Constants {
  CPP_RATE?: number;
  CPP_MAX_EARNINGS?: number;
  CPP_EXEMPTION_ANNUAL?: number;
  EI_RATE?: number;
  EI_MAX_EARNINGS?: number;
  EI_EMPLOYER_MULTIPLIER?: number;
  SS_WAGE_BASE?: number;
  SOCIAL_SECURITY_RATE?: number;
  MEDICARE_RATE?: number;
  [key: string]: any;
}

interface Bracket {
  threshold_floor: string;
  marginal_rate: string;
}

interface Balances {
  accumulated_gross: number;
  accumulated_pensionable: number;
  accumulated_insurable: number;
}

interface PayrollResult {
  netPayout: string;
  breakdown: {
    employeeWithholdings: Record<string, string>;
    employerContributions: Record<string, string>;
  };
}

// ─── Progressive Tax Calculator ─────────────────────────────────
function calculateProgressiveTax(annualizedIncome: Big, brackets: Bracket[]): Big {
  let tax = new Big(0);
  let remaining = new Big(annualizedIncome);
  if (remaining.lte(0) || brackets.length === 0) return tax;

  const sorted = [...brackets].sort((a, b) =>
    parseFloat(a.threshold_floor) - parseFloat(b.threshold_floor)
  );

  for (let i = 0; i < sorted.length; i++) {
    const floor = new Big(sorted[i].threshold_floor);
    const rate = new Big(sorted[i].marginal_rate);
    const nextFloor = sorted[i + 1] ? new Big(sorted[i + 1].threshold_floor) : null;

    if (remaining.gt(floor)) {
      const taxable = nextFloor
        ? (remaining.minus(floor).lt(nextFloor.minus(floor))
            ? remaining.minus(floor)
            : nextFloor.minus(floor))
        : remaining.minus(floor);
      tax = tax.plus(taxable.times(rate));
      remaining = remaining.minus(taxable);
    }
    if (remaining.lte(0)) break;
  }
  return tax;
}

// ─── Canada Strategy ─────────────────────────────────────────────
function runCanadaStrategy(
  gross: Big,
  constants: Constants,
  brackets: Bracket[],
  balances: Balances,
  payPeriods: number,
  personalExemption: number
): PayrollResult {
  const ytdPension = new Big(balances.accumulated_pensionable || 0);
  const ytdInsurable = new Big(balances.accumulated_insurable || 0);

  // 1. CPP
  let cppEmployee = new Big(0);
  const cppLimit = new Big(constants.CPP_MAX_EARNINGS || 74600);
  if (ytdPension.lt(cppLimit)) {
    const annualExempt = new Big(constants.CPP_EXEMPTION_ANNUAL || 3500);
    const periodExempt = annualExempt.div(payPeriods);
    const pensionable = gross.minus(periodExempt);
    if (pensionable.gt(0)) {
      const rate = new Big(constants.CPP_RATE || 0.0595);
      let calc = pensionable.times(rate);
      const remaining = cppLimit.minus(ytdPension).times(rate);
      cppEmployee = calc.gt(remaining) ? remaining : calc;
    }
  }

  // 2. EI
  let eiEmployee = new Big(0);
  const eiLimit = new Big(constants.EI_MAX_EARNINGS || 68900);
  if (ytdInsurable.lt(eiLimit)) {
    const rate = new Big(constants.EI_RATE || 0.0163);
    let calc = gross.times(rate);
    const remaining = eiLimit.minus(ytdInsurable).times(rate);
    eiEmployee = calc.gt(remaining) ? remaining : calc;
  }

  // 3. Income Tax (progressive)
  const annualized = gross.times(payPeriods).minus(new Big(personalExemption || 0));
  let annualTax = calculateProgressiveTax(annualized, brackets);
  let periodTax = annualTax.div(payPeriods);
  if (periodTax.lt(0)) periodTax = new Big(0);

  // 4. Employer contributions
  const cppEmployer = cppEmployee;
  const eiEmployer = eiEmployee.times(new Big(constants.EI_EMPLOYER_MULTIPLIER || 1.4));

  const totalDeductions = cppEmployee.plus(eiEmployee).plus(periodTax);
  const netPay = gross.minus(totalDeductions);

  return {
    netPayout: netPay.toFixed(2),
    breakdown: {
      employeeWithholdings: {
        cpp: cppEmployee.toFixed(2),
        ei: eiEmployee.toFixed(2),
        incomeTax: periodTax.toFixed(2),
      },
      employerContributions: {
        cpp: cppEmployer.toFixed(2),
        ei: eiEmployer.toFixed(2),
      },
    },
  };
}

// ─── US Strategy ─────────────────────────────────────────────────
function runUSStrategy(
  gross: Big,
  constants: Constants,
  brackets: Bracket[],
  balances: Balances,
  payPeriods: number
): PayrollResult {
  const ytdGross = new Big(balances.accumulated_gross || 0);

  // 1. Social Security
  let ssEmployee = new Big(0);
  const ssLimit = new Big(constants.SS_WAGE_BASE || 176100);
  if (ytdGross.lt(ssLimit)) {
    const rate = new Big(constants.SOCIAL_SECURITY_RATE || 0.062);
    let calc = gross.times(rate);
    const remaining = ssLimit.minus(ytdGross).times(rate);
    ssEmployee = calc.gt(remaining) ? remaining : calc;
  }

  // 2. Medicare
  const medRate = new Big(constants.MEDICARE_RATE || 0.0145);
  let medicareEmployee = gross.times(medRate);

  // 3. Income Tax (progressive – using same function)
  const annualized = gross.times(payPeriods);
  let annualTax = calculateProgressiveTax(annualized, brackets);
  let periodTax = annualTax.div(payPeriods);
  if (periodTax.lt(0)) periodTax = new Big(0);

  // 4. Employer matching (1:1 for SS and Medicare)
  const ssEmployer = ssEmployee;
  const medicareEmployer = medicareEmployee;

  const totalDeductions = ssEmployee.plus(medicareEmployee).plus(periodTax);
  const netPay = gross.minus(totalDeductions);

  return {
    netPayout: netPay.toFixed(2),
    breakdown: {
      employeeWithholdings: {
        socialSecurity: ssEmployee.toFixed(2),
        medicare: medicareEmployee.toFixed(2),
        federalIncomeTax: periodTax.toFixed(2),
      },
      employerContributions: {
        socialSecurity: ssEmployer.toFixed(2),
        medicare: medicareEmployer.toFixed(2),
      },
    },
  };
}

// ─── Dispatcher ──────────────────────────────────────────────────
export function executePayrollStrategy(
  countryCode: string,
  grossAmount: number | string,
  constants: Constants,
  brackets: Bracket[],
  balances: Balances,
  payPeriods: number,
  personalExemption: number = 0
): PayrollResult {
  const gross = new Big(grossAmount);
  switch (countryCode.toUpperCase()) {
    case 'CA':
      return runCanadaStrategy(gross, constants, brackets, balances, payPeriods, personalExemption);
    case 'US':
      return runUSStrategy(gross, constants, brackets, balances, payPeriods);
    default:
      throw new Error(`Unsupported country code: ${countryCode}`);
  }
}