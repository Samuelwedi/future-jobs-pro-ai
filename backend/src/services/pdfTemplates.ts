import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { on } from 'cluster';
import { size } from 'pdfkit/js/page';
import { Tax } from 'stripe';

// ─── Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
    borderBottom: 1,
    borderBottomColor: '#333',
    paddingBottom: 10,
  },
  headerLeft: { flexDirection: 'column' },
  headerRight: { flexDirection: 'column', alignItems: 'flex-end' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#00D4FF' },
  subtitle: { fontSize: 12, color: '#666', marginTop: 4 },
  companyName: { fontSize: 16, fontWeight: 'bold', color: '#0A0A0A' },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 4,
  },
  summaryItem: { width: '25%', padding: 4 },
  summaryLabel: { fontSize: 9, color: '#888' },
  summaryValue: { fontSize: 14, fontWeight: 'bold', color: '#0A0A0A' },
  table: { width: '100%', marginTop: 16, marginBottom: 16 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#00D4FF',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  tableHeaderCell: { fontSize: 10, fontWeight: 'bold', color: '#0A0A0A' },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#EEE',
  },
  tableRowAlt: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#EEE',
    backgroundColor: '#F9F9F9',
  },
  tableCell: { fontSize: 10, color: '#0A0A0A' },
  footer: {
    marginTop: 30,
    borderTop: 1,
    borderTopColor: '#EEE',
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 9, color: '#888' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    paddingTop: 8,
    borderTop: 2,
    borderTopColor: '#333',
  },
  totalLabel: { fontSize: 14, fontWeight: 'bold', color: '#0A0A0A', marginRight: 20 },
  totalValue: { fontSize: 14, fontWeight: 'bold', color: '#00D4FF' },
  flex1: { flex: 1 },
  flex15: { flex: 1.5 },
  flex2: { flex: 2 },
  flex3: { flex: 3 },
  flex4: { flex: 4 },
  textRight: { textAlign: 'right' },
  textCenter: { textAlign: 'center' },
  mt10: { marginTop: 10 },
  mb10: { marginBottom: 10 },
});

// ─── Types ──────────────────────────────────────────────────────
export interface PayStubData {
  employeeName: string;
  employeeEmail: string;
  periodStart: string;
  periodEnd: string;
  hours: number;
  rate: number;
  pay: number;
  adjustments: number;
  finalPay: number;
  companyName: string;
  companyAddress?: string;
}

export interface InvoiceData {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  clientName: string;
  clientEmail: string;
  items: { description: string; quantity: number; unitPrice: number; total: number }[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes?: string;
  companyName: string;
  companyAddress?: string;
}

// ─── Pay Stub PDF ──────────────────────────────────────────────
// This file is intentionally .ts, so use the element API rather than JSX.
const el = React.createElement;
const PdfText = Text as unknown as React.ComponentType<any>;
const text = (style: React.ComponentProps<typeof Text>['style'], value: React.ReactNode) => el(PdfText, { style }, value);

export const PayStubPDF: React.FC<{ data: PayStubData }> = ({ data }) => el(Document, null,
  el(Page, { size: 'A4', style: styles.page },
    el(View, { style: styles.header },
      el(View, { style: styles.headerLeft }, text(styles.title, 'PAY STUB'), text(styles.subtitle, data.companyName), data.companyAddress && text(styles.subtitle, data.companyAddress)),
      el(View, { style: styles.headerRight }, text(styles.companyName, data.employeeName), text(styles.subtitle, data.employeeEmail), text(styles.subtitle, `Period: ${data.periodStart} – ${data.periodEnd}`))
    ),
    el(View, { style: styles.summaryGrid },
      ...([['Total Hours', data.hours.toFixed(2)], ['Hourly Rate', `$${data.rate.toFixed(2)}`], ['Gross Pay', `$${data.pay.toFixed(2)}`], ['Final Pay', `$${data.finalPay.toFixed(2)}`]].map(([label, value], i) => el(View, { key: i, style: styles.summaryItem }, text(styles.summaryLabel, label), text(i === 3 ? [styles.summaryValue, { color: '#00D4FF' }] : styles.summaryValue, value)))
    ),
    el(View, { style: styles.table },
      el(View, { style: styles.tableHeader }, ...([
        ['Description', styles.flex3],
        ['Hours', [styles.flex1, styles.textRight]],
        ['Rate', [styles.flex1, styles.textRight]],
        ['Pay', [styles.flex15, styles.textRight]],
        ['Adjustments', [styles.flex15, styles.textRight]],
        ['Final Pay', [styles.flex15, styles.textRight]],
      ] as [string, React.ComponentProps<typeof Text>['style']][]).map(([label, style]) =>
        text([styles.tableHeaderCell, style] as React.ComponentProps<typeof Text>['style'], label)
      )),
      el(View, { style: styles.tableRow }, ...([
        ['Regular Hours', styles.flex3],
        [data.hours.toFixed(2), [styles.flex1, styles.textRight]],
        [`$${data.rate.toFixed(2)}`, [styles.flex1, styles.textRight]],
        [`$${data.pay.toFixed(2)}`, [styles.flex15, styles.textRight]],
        [`$${data.adjustments.toFixed(2)}`, [styles.flex15, styles.textRight]],
        [`$${data.finalPay.toFixed(2)}`, [styles.flex15, styles.textRight, { fontWeight: 'bold' }]],
      ] as [string, React.ComponentProps<typeof Text>['style']][]).map(([value, style]) => text([styles.tableCell, style] as React.ComponentProps<typeof Text>['style'], value))))
    ),
    el(View, { style: styles.footer }, text(styles.footerText, `Generated on ${new Date().toLocaleDateString()}`), text(styles.footerText, `© ${new Date().getFullYear()} ${data.companyName}`))
  )
);

// ─── Invoice PDF ────────────────────────────────────────────────
export const InvoicePDF: React.FC<{ data: InvoiceData }> = ({ data }) => el(Document, null,
  el(Page, { size: 'A4', style: styles.page },
    el(View, { style: styles.header },
      el(View, { style: styles.headerLeft },
        text(styles.title, 'INVOICE'),
        text(styles.subtitle, data.companyName),
        data.companyAddress && text(styles.subtitle, data.companyAddress)
      ),
      el(View, { style: styles.headerRight },
        text(styles.companyName, `#${data.invoiceNumber}`),
        text(styles.subtitle, `Date: ${data.date}`),
        text(styles.subtitle, `Due: ${data.dueDate}`)
      )
    ),
    el(View, { style: { marginBottom: 16 } },
      text([styles.subtitle, { fontWeight: 'bold' }], 'Bill To:'),
      text(styles.companyName, data.clientName),
      text(styles.subtitle, data.clientEmail)
    ),
    el(View, { style: styles.table },
      el(View, { style: styles.tableHeader },
        text([styles.tableHeaderCell, styles.flex4], 'Description'),
        text([styles.tableHeaderCell, styles.flex1, styles.textRight], 'Qty'),
        text([styles.tableHeaderCell, styles.flex15, styles.textRight], 'Unit Price'),
        text([styles.tableHeaderCell, styles.flex15, styles.textRight], 'Total')
      ),
      ...data.items.map((item, idx) => el(View, { key: idx, style: idx % 2 === 0 ? styles.tableRow : styles.tableRowAlt },
        text([styles.tableCell, styles.flex4], item.description),
        text([styles.tableCell, styles.flex1, styles.textRight], item.quantity),
        text([styles.tableCell, styles.flex15, styles.textRight], `$${item.unitPrice.toFixed(2)}`),
        text([styles.tableCell, styles.flex15, styles.textRight], `$${item.total.toFixed(2)}`)
      ))
    ),
    el(View, { style: styles.totalRow }, text(styles.totalLabel, 'Subtotal'), text(styles.totalValue, `$${data.subtotal.toFixed(2)}`)),
    data.taxRate > 0 && el(View, { style: [styles.totalRow, { borderTop: 'none', paddingTop: 0 }] },
      text(styles.totalLabel, `Tax (${data.taxRate}%)`), text(styles.totalValue, `$${data.taxAmount.toFixed(2)}`)
    ),
    el(View, { style: [styles.totalRow, { borderTop: '2px solid #00D4FF' }] },
      text([styles.totalLabel, { fontSize: 16, color: '#00D4FF' }], 'Total'),
      text([styles.totalValue, { fontSize: 18 }], `$${data.total.toFixed(2)}`)
    ),
    data.notes && el(View, { style: { marginTop: 20 } },
      text([styles.subtitle, { fontWeight: 'bold' }], 'Notes:'), text(styles.subtitle, data.notes)
    ),
    el(View, { style: [styles.footer, { marginTop: 40 }] },
      text(styles.footerText, `Generated on ${new Date().toLocaleDateString()}`),
      text(styles.footerText, `© ${new Date().getFullYear()} ${data.companyName}`)
    )
  )
);