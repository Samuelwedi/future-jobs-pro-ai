import React from 'react';
import { Box, Container, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';

export default function Privacy() {
  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 6 }}>
      <Container maxWidth="md">
        <Paper sx={{ p: 5, bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333' }}>
          <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 4 }}>Privacy Policy</Typography>
          {[
            { title: '1. Information We Collect', text: 'We collect account information (name, email), payment information (processed securely by Stripe), GPS location data (only during work hours), job site photos, voice notes, and usage data.' },
            { title: '2. How We Use It', text: 'We use your data to provide and improve our Service, process payments, generate work verification evidence, and send important updates.' },
            { title: '3. Location Data', text: 'GPS tracking is ONLY active when an employee is clocked in. It stops automatically when they clock out. Employees can see when tracking is active via a visible indicator.' },
            { title: '4. Data Sharing', text: 'We do NOT sell your personal data. We share data only within your company (boss/manager can view employee data) and with service providers (Stripe, OpenAI, cloud storage).' },
            { title: '5. Data Security', text: 'We use AES‑256 encryption at rest, TLS 1.3 in transit, secure API authentication, and regular security audits.' },
            { title: '6. Data Retention', text: 'Account information is retained until deletion. Time entries, GPS data, and job photos are retained for 7 years for legal/compliance purposes.' },
            { title: '7. Your Rights', text: 'You have the right to access, correct, delete, and export your personal data. You may opt out of marketing emails at any time.' },
            { title: '8. Contact', text: 'For privacy questions: privacy@futurejobspro.com' },
          ].map((section, i) => (
            <Box key={i} sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>{section.title}</Typography>
              <Typography variant="body2" sx={{ color: '#AAA', lineHeight: 1.8 }}>{section.text}</Typography>
            </Box>
          ))}

          <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2, mt: 4 }}>Data Retention Periods</Typography>
          <TableContainer sx={{ bgcolor: '#0A0A0A', borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: '#FFF' }}>Data Type</TableCell>
                  <TableCell sx={{ color: '#FFF' }}>Retention Period</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[
                  ['Account Information', 'Until account deletion'],
                  ['Time Entries & GPS', '7 years'],
                  ['Job Photos', '7 years'],
                  ['Voice Notes', '7 years'],
                ].map((row, i) => (
                  <TableRow key={i}>
                    <TableCell sx={{ color: '#AAA' }}>{row[0]}</TableCell>
                    <TableCell sx={{ color: '#AAA' }}>{row[1]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Container>
    </Box>
  );
}