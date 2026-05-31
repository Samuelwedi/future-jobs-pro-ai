import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  TextField,
  Button,
  Paper,
  Link,
  Alert,
} from '@mui/material';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Login failed');
      }

      // Save token and user info
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Redirect to dashboard
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        bgcolor: '#0A0A0A',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Container maxWidth="xs">
        <Paper
          sx={{
            p: 4,
            bgcolor: '#1A1A1A',
            borderRadius: 3,
            border: '1px solid #333',
          }}
        >
          <Typography
            variant="h5"
            sx={{
              color: '#FFF',
              fontWeight: 'bold',
              mb: 1,
              textAlign: 'center',
            }}
          >
            Sign In
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: '#888', mb: 3, textAlign: 'center' }}
          >
            Welcome back to Future Jobs Pro AI
          </Typography>

          {error && (
            <Alert
              severity="error"
              sx={{ mb: 2, bgcolor: '#F4433620', color: '#F44336' }}
            >
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleLogin}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              sx={{
                mb: 2,
                input: { color: '#FFF' },
                label: { color: '#888' },
                '& .MuiOutlinedInput-root': {
                  '& fieldset': { borderColor: '#333' },
                },
              }}
            />
            <TextField
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              sx={{
                mb: 3,
                input: { color: '#FFF' },
                label: { color: '#888' },
                '& .MuiOutlinedInput-root': {
                  '& fieldset': { borderColor: '#333' },
                },
              }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading}
              sx={{
                bgcolor: '#00D4FF',
                color: '#0A0A0A',
                py: 1.5,
                fontWeight: 'bold',
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </Box>

          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Link href="/register" sx={{ color: '#00D4FF', fontSize: 14 }}>
              Don&apos;t have an account? Start free trial
            </Link>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}