import React, {lazy,Suspense} from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Reports = lazy(() => import('./pages/Reports'));
const Pricing = lazy(() => import('./pages/Pricing'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Contact = lazy(() => import('./pages/Contact'));
const FAQ = lazy(() => import('./pages/FAQ'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const VoiceAssistant = lazy(() => import('./pages/VoiceAssistant'));
const Team = lazy(() => import('./pages/Team'));
const Projects = lazy(() => import('./pages/Projects'));
const Timesheet = lazy(() => import('./pages/Timesheet'));
const Chat = lazy(() => import('./pages/Chat'));
const ChatList = lazy(() => import('./pages/ChatList'));
const Tasks = lazy(() => import('./pages/Tasks'));
const PTO = lazy(() => import('./pages/PTO'));
const Kiosk = lazy(() => import('./pages/Kiosk'));
const KioskClock = lazy(() => import('./pages/KioskClock'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Register = lazy(() => import('./pages/Register'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const PaymentRequired = lazy(() => import('./pages/PaymentRequired'));
const Integrations = lazy(() => import('./pages/Integrations'));
const AskLucy = lazy(() => import('./pages/AskLucy'));
const Features = lazy(() => import('./pages/Features'));
const Demo = lazy(() => import('./pages/Demo'));
const About = lazy(() => import('./pages/About'));
const Blog = lazy(() => import('./pages/Blog'));
const Security = lazy(() => import('./pages/Security'));
const Payroll = lazy(() => import('./pages/Payroll'));
const Invoices = lazy(() => import('./pages/Invoices'));
const Estimates = lazy(() => import('./pages/Estimates'));
const EmployeePortal = lazy(() => import('./pages/EmployeePortal'));
const YearEnd = lazy(() => import('./pages/YearEnd'));
const FinalizedSlips = lazy(() => import('./pages/FinalizedSlips'));
const DirectDeposit = lazy(() => import('./pages/ManualPayroll'));
const PayrollRules = lazy(() => import('./pages/PayrollRules'));
const MediaFolders = lazy(() => import('./pages/MediaFolders'));
const Support = lazy(() => import('./pages/Support'));
const ProjectMedia = lazy(() => import('./pages/ProjectMedia'));
const MonthMedia = lazy(() => import('./pages/MonthMedia'));
const MonthMediaType = lazy(() => import('./pages/MonthMediaType'));
import Layout from './components/Layout';

// âœ… NEW PAGES
const CompanySettings = lazy(() => import('./pages/CompanySettings'));
const CrewClock = lazy(() => import('./pages/CrewClock'));
const CrewTracking = lazy(() => import('./pages/CrewTracking'));
const GPSPlayback = lazy(() => import('./pages/GPSPlayback'));
const NewChat = lazy(() => import('./pages/NewChat'));
const Subscription = lazy(() => import('./pages/Subscription'));
const EvidenceCenter = lazy(() => import('./pages/EvidenceCenter'));

const CommandCenter = lazy(()=>import('./pages/CommandCenter'));
const Expenses = lazy(()=>import('./pages/Expenses'));
const WorkPreferences=lazy(()=>import('./pages/WorkPreferences'));
const Operations=lazy(()=>import('./pages/Operations'));
const AcceptInvite=lazy(()=>import('./pages/AcceptInvite'));
const WorkerTools=lazy(()=>import('./pages/WorkerTools'));
export default function App() {
  return (
    <Router>
      <Suspense fallback={<div role="status" style={{padding:32}}>Loading workspaceâ€¦</div>}><Routes>
        {/* Public routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/register" element={<Register />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/features" element={<Features />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/kiosk-clock" element={<KioskClock />} />
        <Route path="/about" element={<About />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/payment-required" element={<PaymentRequired />} />

        {/* Protected routes with sidebar (Layout) */}
        <Route path="/" element={<Layout />}>
          <Route path="dashboard" element={<CommandCenter />} />
          <Route path="classic-dashboard" element={<Dashboard />} />
          <Route path="work-preferences" element={<WorkPreferences />} />
          <Route path="operations" element={<Operations />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="team" element={<Team />} />
          <Route path="employee-portal" element={<EmployeePortal />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="timesheet" element={<Timesheet />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="worker-tools" element={<WorkerTools />} />
          <Route path="worker-tools/:calculatorId" element={<WorkerTools />} />
          <Route path="pto" element={<PTO />} />
          <Route path="projects" element={<Projects />} />
          <Route path="media" element={<MediaFolders />} />
          <Route path="media/project/:projectId" element={<ProjectMedia />} />
          <Route path="media/project/:projectId/month/:yearMonth" element={<MonthMedia />} />
          <Route path="media/project/:projectId/month/:yearMonth/type/:mediaType" element={<MonthMediaType />} />
          <Route path="chat" element={<ChatList />} />
          <Route path="chat/:roomId" element={<Chat />} />
          <Route path="support" element={<Support />} />
          <Route path="payroll" element={<Payroll />} />
          <Route path="direct-deposit" element={<DirectDeposit />} />
          <Route path="payroll-rules" element={<PayrollRules />} />
          <Route path="year-end" element={<YearEnd />} />
          <Route path="year-end/finalized" element={<FinalizedSlips />} />
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

          {/* âœ… NEW ROUTES */}
          <Route path="company-settings" element={<CompanySettings />} />
          <Route path="crew-clock" element={<CrewClock />} />
          <Route path="crew-tracking" element={<CrewTracking />} />
          <Route path="gps-playback" element={<GPSPlayback />} />
          <Route path="new-chat" element={<NewChat />} />
      <Route path="subscription" element={<Subscription />} />
      <Route path="evidence" element={<EvidenceCenter />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes></Suspense>
    </Router>
  );
}

