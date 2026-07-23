import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { PayStubPDF, InvoicePDF, PayStubData, InvoiceData } from './pdfTemplates';
import path from 'path';
import fs from 'fs';

const PDF_DIR = path.join(__dirname, '../../pdfs');
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

// ─── Save PDF to file (returns URL) ─────────────────────────────
export async function generatePayStubPDF(data: PayStubData): Promise<string> {
  const filename = `paystub_${Date.now()}.pdf`;
  const filepath = path.join(PDF_DIR, filename);

  const pdfBuffer = await renderToBuffer(
    React.createElement(PayStubPDF, { data }) as React.ReactElement<any>
  );
  fs.writeFileSync(filepath, pdfBuffer);

  return `/pdfs/${filename}`;
}

// ─── Return PDF as Buffer (for email attachments) ──────────────
export async function generatePayStubPDFBuffer(data: PayStubData): Promise<Buffer> {
  return await renderToBuffer(
    React.createElement(PayStubPDF, { data }) as React.ReactElement<any>
  );
}

export async function generateInvoicePDF(data: InvoiceData): Promise<string> {
  const filename = `invoice_${Date.now()}.pdf`;
  const filepath = path.join(PDF_DIR, filename);

  const pdfBuffer = await renderToBuffer(
    React.createElement(InvoicePDF, { data }) as React.ReactElement<any>
  );
  fs.writeFileSync(filepath, pdfBuffer);

  return `/pdfs/${filename}`;
}

export async function generateEstimatePDF(data: any): Promise<string> {
  // Reuse invoice PDF with estimate number
  return generateInvoicePDF({ ...data, invoiceNumber: data.estimateNumber });
}