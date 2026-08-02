import { pool } from '../config/database';

interface YearEndData {
  employeeId: number;
  taxYear: number;
}

export async function compileT4Slip(employeeId: number, taxYear: number) {
  // In a real app, you would fetch payroll data from the database.
  // For now, we'll return mock data that includes all required boxes.
  return {
    t4Manifest: {
      box14_employment_income: 52000.00,
      box16_cpp_withheld: 2895.00,
      box18_ei_withheld: 856.00,
      box22_income_tax_withheld: 7800.00,
      box24_insurable_earnings: 52000.00,
      box26_pensionable_earnings: 52000.00,
      box44_union_dues: 0,
      box46_charitable_donations: 0,
      box52_pension_adjustment: 0,
    },
    employerMetrics: {
      employer_cpp_matching: 2895.00,
      employer_ei_matching: 1198.40,
    },
  };
}

export async function compileT4ASlip(employeeId: number, taxYear: number) {
  return {
    t4aManifest: {
      box020_self_employed_fees: 52000.00,
      box022_income_tax_withheld: 0,
    },
  };
}

export async function compileRL1Slip(employeeId: number, taxYear: number) {
  return {
    rl1Manifest: {
      box_a_employment_income: 52000.00,
      box_b_qpp_contribution: 2895.00,
      box_c_qpip_premium: 856.00,
      box_e_quebec_tax_withheld: 7800.00,
      box_g_pensionable_earnings: 52000.00,
      box_i_insurable_earnings: 52000.00,
    },
  };
}