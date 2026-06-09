import React, { useState } from 'react';
import { Box, Container, Typography, Paper, TextField, Button, Alert, Grid } from '@mui/material';
import { PlayCircleOutline } from '@mui/icons-material';

export default function Demo() {
  const [form, setForm] = useState({ name: '', email: '', company: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 8 }}>
      <Container maxWidth="md">
        <Typography variant="h3" align="center" sx={{ color: '#FFF', fontWeight: 'bold', mb: 2 }}>
          Request a Demo
        </Typography>
        <Typography variant="h6" align="center" sx={{ color: '#888', mb: 6 }}>
          See how Future Jobs Pro AI can transform your field service business.
        </Typography>

        <Paper sx={{ p: 5, bgcolor: '#1A1A1A', borderRadius: 4, border: '1px solid #333' }}>
          {submitted ? (
            <Alert severity="success" sx={{ bgcolor: '#4CAF5020', color: '#4CAF50' }}>Thank you! We'll reach out to schedule your demo shortly.</Alert>
          ) : (
            <Box component="form" onSubmit={handleSubmit}>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <TextField fullWidth label="Full Name" name="name" value={form.name} onChange={handleChange} required
                    sx={{ input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth label="Work Email" name="email" type="email" value={form.email} onChange={handleChange} required
                    sx={{ input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth label="Company Name" name="company" value={form.company} onChange={handleChange} required
                    sx={{ input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }} />
                </Grid>
              </Grid>
              <Button type="submit" variant="contained" fullWidth size="large" sx={{ mt: 4, bgcolor: '#00D4FF', color: '#0A0A0A', py: 1.5 }}>
                Schedule Demo
              </Button>
            </Box>
          )}
        </Paper>

        <Box sx={{ mt: 8, textAlign: 'center' }}>
          <PlayCircleOutline sx={{ fontSize: 60, color: '#00D4FF', mb: 2 }} />
          <Typography variant="h5" sx={{ color: '#FFF', mb: 1 }}>Want a quick overview?</Typography>
          <Typography variant="body1" sx={{ color: '#AAA' }}>
            Check out our <a href="/features" style={{ color: '#00D4FF' }}>Features</a> page or <a href="/pricing" style={{ color: '#00D4FF' }}>start a free trial</a> to explore on your own.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}