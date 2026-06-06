import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import Reports from './pages/Reports';
import Pricing from './pages/Pricing';
import AdminDashboard from './pages/AdminDashboard';
import Contact from './pages/Contact';
import FAQ from './pages/FAQ';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import VoiceAssistant from './pages/VoiceAssistant';
import Team from './pages/Team';
import Projects from './pages/Projects';
import Timesheet from './pages/Timesheet';
import Chat from './pages/Chat';
import Tasks from './pages/Tasks';
import PTO from './pages/PTO';
import Kiosk from './pages/Kiosk';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';
import Register from './pages/Register';
import PaymentRequired from './pages/PaymentRequired';
import Integrations from './pages/Integrations';
import AskLucy from './pages/AskLucy';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/voice-assistant" element={<VoiceAssistant />} />
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/team" element={<Team />} />
<Route path="/projects" element={<Projects />} />
<Route path="/timesheet" element={<Timesheet />} />
<Route path="/chat" element={<Chat />} />
<Route path="/tasks" element={<Tasks />} />
<Route path="/pto" element={<PTO />} />
<Route path="/kiosk" element={<Kiosk />} />
<Route path="/settings" element={<Settings />} />
<Route path="*" element={<NotFound />} />
<Route path="/register" element={<Register />} />
<Route path="/payment-required" element={<PaymentRequired />} />
<Route path="/integrations" element={<Integrations />} />
<Route path="/ask-lucy" element={<AskLucy />} />
      </Routes>
    </Router>
  );
}