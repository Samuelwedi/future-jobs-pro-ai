import React, { useState } from 'react';
import {
  Box, Container, Typography, Accordion, AccordionSummary, AccordionDetails, TextField, InputAdornment, Chip,
} from '@mui/material';
import { ExpandMore, Search } from '@mui/icons-material';

const faqs = [
  { q: 'What is Future Jobs Pro AI?', a: 'It is an AI‑powered workforce management platform that combines GPS time tracking, AI photo compliance, voice‑to‑text notes, and automatic dispute evidence generation to help field service businesses prove work and get paid faster.', cat: 'General' },
  { q: 'How does the free trial work?', a: 'Your 14‑day free trial gives you full access to all features. No credit card is required to start. At the end, choose a paid plan to continue.', cat: 'General' },
  { q: 'How does AI photo compliance work?', a: 'Our AI analyzes photos in real‑time for lighting, sharpness, and GPS location, giving an immediate compliance score. Photos scoring 70+ are dispute‑ready.', cat: 'Features' },
  { q: 'Is GPS tracking always on?', a: 'No. GPS is only active when an employee is clocked in. It stops automatically when they clock out. We never track outside of work hours.', cat: 'Features' },
  { q: 'What payment methods do you accept?', a: 'We accept all major credit cards through Stripe, and ACH bank transfers for annual plans.', cat: 'Pricing' },
  { q: 'Can I cancel anytime?', a: 'Yes! Cancel anytime from your account settings. No long‑term contracts or cancellation fees.', cat: 'Pricing' },
  { q: 'Does the mobile app work offline?', a: 'Yes! Employees can clock in/out and take photos without internet. Data syncs automatically when connection is restored.', cat: 'Technical' },
  { q: 'Is my data secure?', a: 'Absolutely. We use bank‑level AES‑256 encryption at rest and TLS 1.3 in transit. All data is stored securely in the cloud.', cat: 'Technical' },
];

export default function FAQ() {
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('All');

  const filtered = faqs.filter(f => (selectedCat === 'All' || f.cat === selectedCat) && (f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase())));

  const cats = ['All', ...Array.from(new Set(faqs.map(f => f.cat)))];

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 6 }}>
      <Container maxWidth="md">
        <Typography variant="h3" align="center" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>FAQ</Typography>
        <Typography variant="h6" align="center" sx={{ color: '#888', mb: 4 }}>Everything you need to know about Future Jobs Pro AI</Typography>

        <TextField fullWidth placeholder="Search for answers..." value={search} onChange={e => setSearch(e.target.value)}
          sx={{ mb: 3, input: { color: '#FFF' }, '& .MuiOutlinedInput-root': { bgcolor: '#1A1A1A', borderRadius: 3, '& fieldset': { borderColor: '#333' } } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ color: '#888' }} /></InputAdornment> }} />

        <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1, mb: 4 }}>
          {cats.map(cat => (
            <Chip key={cat} label={cat} onClick={() => setSelectedCat(cat)}
              sx={{ bgcolor: selectedCat === cat ? '#00D4FF' : '#1A1A1A', color: selectedCat === cat ? '#0A0A0A' : '#888', border: selectedCat === cat ? 'none' : '1px solid #333' }} />
          ))}
        </Box>

        {filtered.map((faq, i) => (
          <Accordion key={i} sx={{ bgcolor: '#1A1A1A', mb: 1, borderRadius: '12px !important', border: '1px solid #333', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMore sx={{ color: '#00D4FF' }} />}><Typography sx={{ color: '#FFF', fontWeight: 500 }}>{faq.q}</Typography></AccordionSummary>
            <AccordionDetails sx={{ borderTop: '1px solid #333' }}><Typography sx={{ color: '#AAA', lineHeight: 1.8 }}>{faq.a}</Typography></AccordionDetails>
          </Accordion>
        ))}
      </Container>
    </Box>
  );
}