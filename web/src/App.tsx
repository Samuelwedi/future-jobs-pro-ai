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
import Features from './pages/Features';
import Demo from './pages/Demo';
import About from './pages/About';
import Blog from './pages/Blog';
import Security from './pages/Security';
import Payroll from './pages/Payroll';
import Invoices from './pages/Invoices';
import Estimates from './pages/Estimates';
import EmployeePortal from './pages/EmployeePortal';
import YearEnd from './pages/YearEnd';
import DirectDeposit from './pages/DirectDeposit';
import MediaFolders from './pages/MediaFolders';
import Support from './pages/Support';
import ProjectMedia from './pages/ProjectMedia';
import MonthMedia from './pages/MonthMedia';
import MonthMediaType from './pages/MonthMediaType';
import Layout from './components/Layout';

// ✅ NEW PAGES
import CompanySettings from './pages/CompanySettings';
import CrewClock from './pages/CrewClock';
import CrewTracking from './pages/CrewTracking';
import GPSPlayback from './pages/GPSPlayback';
import NewChat from './pages/NewChat';
import Subscription from './pages/Subscription';

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/features" element={<Features />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/about" element={<About />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/payment-required" element={<PaymentRequired />} />

        {/* Protected routes with sidebar (Layout) */}
        <Route path="/" element={<Layout />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="team" element={<Team />} />
          <Route path="employee-portal" element={<EmployeePortal />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="timesheet" element={<Timesheet />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="pto" element={<PTO />} />
          <Route path="projects" element={<Projects />} />
          <Route path="media" element={<MediaFolders />} />
          <Route path="media/project/:projectId" element={<ProjectMedia />} />
          <Route path="media/project/:projectId/month/:yearMonth" element={<MonthMedia />} />
          <Route path="media/project/:projectId/month/:yearMonth/type/:mediaType" element={<MonthMediaType />} />
          <Route path="chat" element={<Chat />} />
          <Route path="support" element={<Support />} />
          <Route path="payroll" element={<Payroll />} />
          <Route path="direct-deposit" element={<DirectDeposit />} />
          <Route path="year-end" element={<YearEnd />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="estimates" element={<Estimates />} />
          <Route path="reports" element={<Reports />} />
          <Route path="admin-dashboard" element={<AdminDashboard />} />
          <Route path="kiosk" element={<Kiosk />} />
          <Route path="ask-lucy" element={<AskLucy />} />
          <Route path="voice-assistant" element={<VoiceAssistant />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="settings" element={<Settings />} />
          <Route path="security" element={<Security />} />

          {/* ✅ NEW ROUTES */}
          <Route path="company-settings" element={<CompanySettings />} />
          <Route path="crew-clock" element={<CrewClock />} />
          <Route path="crew-tracking" element={<CrewTracking />} />
          <Route path="gps-playback" element={<GPSPlayback />} />
          <Route path="new-chat" element={<NewChat />} />
          <Route path="subscription" element={<Subscription />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}