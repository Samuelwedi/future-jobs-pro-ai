import React from 'react';
import { renderToBuffer, DocumentProps } from '@react-pdf/renderer';
import { PayStubPDF, InvoicePDF, PayStubData, InvoiceData } from './pdfTemplates';
import path from 'path';
import fs from 'fs';

const PDF_DIR = path.join(__dirname, '../../pdfs');
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

export async function generatePayStubPDF(data: PayStubData): Promise<string> {
  const filename = `paystub_${Date.now()}.pdf`;
  const filepath = path.join(PDF_DIR, filename);

  const pdfBuffer = await renderToBuffer(
    React.createElement(PayStubPDF, { data }) as unknown as React.ReactElement<DocumentProps>,
  );
  fs.writeFileSync(filepath, pdfBuffer);

  return `/pdfs/${filename}`;
}

export async function generateInvoicePDF(data: InvoiceData): Promise<string> {
  const filename = `invoice_${Date.now()}.pdf`;
  const filepath = path.join(PDF_DIR, filename);

  const pdfBuffer = await renderToBuffer(
    React.createElement(InvoicePDF, { data }) as unknown as React.ReactElement<DocumentProps>,
  );
  fs.writeFileSync(filepath, pdfBuffer);

  return `/pdfs/${filename}`;
}

export async function generateEstimatePDF(data: any): Promise<string> {
  // Reuse invoice PDF with estimate number
  return generateInvoicePDF({ ...data, invoiceNumber: data.estimateNumber });
}