export const formTypes = ["T4", "T4A", "RL1"];
export function yearEndSelection(
  employeeId: string,
  taxYear: string,
  formType: string,
) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      employeeId,
    ) ||
    !/^\d{4}$/.test(taxYear) ||
    Number(taxYear) < 2000 ||
    Number(taxYear) > new Date().getFullYear() + 1 ||
    !formTypes.includes(formType)
  )
    throw Error("Choose a valid employee, tax year and form.");
  return { employeeId, taxYear: Number(taxYear), formType };
}
export function yearEndConfirmation(
  selection: { employeeId: string; taxYear: number; formType: string },
  hash: string,
  reference: string,
  confirmed: boolean,
) {
  if (
    !confirmed ||
    !/^[a-f0-9]{64}$/.test(hash) ||
    reference.trim().length < 8 ||
    reference.trim().length > 500
  )
    throw Error(
      "Review the preview and enter an independent review reference.",
    );
  return {
    ...selection,
    previewHash: hash,
    reviewReference: reference.trim(),
    confirmed: true,
  };
}
export const yearEndCompanyFields: Record<string, string> = {
  name: "Operating name",
  legalName: "Legal name",
  businessNumber: "Business number",
  payrollAccountNumber: "Payroll account number",
  address: "Address",
  city: "City",
  province: "Province",
  postalCode: "Postal code",
  phone: "Phone",
  email: "Payroll email",
};
export const companyStorage: Record<string, string> = {
  name: "name",
  legalName: "legal_name",
  businessNumber: "business_number",
  payrollAccountNumber: "payroll_account_number",
  address: "address",
  city: "city",
  province: "province",
  postalCode: "postal_code",
  phone: "phone",
  email: "email",
};
export const yearEndBoxLabels: Record<string, string> = {
  box14_employment_income: "Box 14 — Employment income",
  box16_cpp_withheld: "Box 16 — CPP",
  box16a_cpp2_withheld: "Box 16A — CPP2",
  box18_ei_withheld: "Box 18 — EI",
  box22_income_tax_withheld: "Box 22 — Income tax",
  box24_insurable_earnings: "Box 24 — Insurable earnings",
  box26_pensionable_earnings: "Box 26 — Pensionable earnings",
  employer_cpp_matching: "Employer CPP and CPP2",
  employer_ei_matching: "Employer EI",
};
