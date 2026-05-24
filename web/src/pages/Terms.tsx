import React from 'react';
import { Box, Container, Typography, Paper } from '@mui/material';

export default function Terms() {
  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 6 }}>
      <Container maxWidth="md">
        <Paper sx={{ p: 5, bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333' }}>
          <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 4 }}>Terms of Service</Typography>
          {[
            { title: '1. Acceptance', text: 'By using Future Jobs Pro AI, you agree to these Terms. If you do not agree, do not use our Service.' },
            { title: '2. Account', text: 'You must provide accurate information when creating an account. You are responsible for maintaining the security of your credentials.' },
            { title: '3. Subscription', text: 'Paid plans are billed monthly or annually. Fees are non‑refundable except as required by law.' },
            { title: '4. Acceptable Use', text: 'You agree not to use the Service for any illegal purpose or to interfere with our systems.' },
            { title: '5. Data & Privacy', text: 'Your use is subject to our Privacy Policy. You retain ownership of your data. We never sell your personal data.' },
            { title: '6. GPS & Location', text: 'Location data is collected only during active work hours. It stops when the employee clocks out.' },
            { title: '7. Limitation of Liability', text: 'TO THE MAXIMUM EXTENT PERMITTED BY LAW, FUTURE JOBS PRO AI SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES.' },
            { title: '8. Termination', text: 'We may suspend or terminate your account for violation of these Terms. You may cancel at any time.' },
            { title: '9. Changes', text: 'We may modify these Terms. We will notify you of material changes via email or through the Service.' },
            { title: '10. Contact', text: 'For questions, contact: legal@futurejobspro.com' },
          ].map((section, i) => (
            <Box key={i} sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>{section.title}</Typography>
              <Typography variant="body2" sx={{ color: '#AAA', lineHeight: 1.8 }}>{section.text}</Typography>
            </Box>
          ))}
        </Paper>
      </Container>
    </Box>
  );
}