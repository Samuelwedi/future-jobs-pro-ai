import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Pricing from './pages/Pricing';
import AdminDashboard from './pages/AdminDashboard';
import Reports from './pages/Reports';
import Contact from './pages/Contact';
import FAQ from './pages/FAQ';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import Schedule from './pages/Schedule';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#00D4FF' },
    background: { default: '#0A0A0A', paper: '#1A1A1A' },
  },
});

function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;