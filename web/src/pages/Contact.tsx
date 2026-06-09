import React, { useState } from 'react';
import {
  Box, Container, Typography, Paper, Grid, TextField, Button, Alert, Breadcrumbs, Link,
} from '@mui/material';
import { Email, Phone, Chat } from '@mui/icons-material';

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 6 }}>
      <Container maxWidth="md">
        <Breadcrumbs sx={{ mb: 4, color: '#888' }}>
          <Link href="/" sx={{ color: '#00D4FF' }}>Home</Link>
          <Typography sx={{ color: '#FFF' }}>Contact</Typography>
        </Breadcrumbs>
        <Typography variant="h3" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>Get in Touch</Typography>
        <Typography variant="h6" sx={{ color: '#888', mb: 6 }}>We're here to help.</Typography>

        <Grid container spacing={4}>
          <Grid item xs={12} md={5}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {[
                { icon: <Email sx={{ color: '#00D4FF' }} />, title: 'Email Us', desc: 'support@futurejobsproai.com', sub: 'We respond within 2 hours' },
                { icon: <Phone sx={{ color: '#4CAF50' }} />, title: 'Call Us', desc: '+1 (888) 555-0123', sub: 'Mon‑Fri, 9am‑6pm EST' },
                { icon: <Chat sx={{ color: '#FF9800' }} />, title: 'Live Chat', desc: 'Available 24/7 for Pro & Enterprise', sub: 'Start a conversation' },
              ].map((item, i) => (
                <Paper key={i} sx={{ p: 3, bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333' }}>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    {item.icon}
                    <Box>
                      <Typography variant="h6" sx={{ color: '#FFF' }}>{item.title}</Typography>
                      <Typography variant="body1" sx={{ color: '#00D4FF' }}>{item.desc}</Typography>
                      <Typography variant="body2" sx={{ color: '#888' }}>{item.sub}</Typography>
                    </Box>
                  </Box>
                </Paper>
              ))}
            </Box>
          </Grid>
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 4, bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333' }}>
              {submitted ? (
                <Alert severity="success" sx={{ bgcolor: '#4CAF5020', color: '#4CAF50' }}>Thank you for your message! We'll get back to you shortly.</Alert>
              ) : (
                <Box component="form" onSubmit={handleSubmit}>
                  <TextField fullWidth label="Full Name" name="name" value={form.name} onChange={handleChange} required
                    sx={{ mb: 2, input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }} />
                  <TextField fullWidth label="Email" name="email" type="email" value={form.email} onChange={handleChange} required
                    sx={{ mb: 2, input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }} />
                  <TextField fullWidth label="Message" name="message" value={form.message} onChange={handleChange} required multiline rows={4}
                    sx={{ mb: 3, textarea: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }} />
                  <Button type="submit" variant="contained" fullWidth size="large" sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', py: 1.5 }}>Send Message</Button>
                </Box>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}