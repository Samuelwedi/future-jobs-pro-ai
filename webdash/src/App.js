import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE = (process.env.REACT_APP_API_BASE || 'https://future-jobs-pro-ai-production.up.railway.app').replace(/\/$/, '');

function App() {
  const [token, setToken] = useState(localStorage.getItem('supportAgentToken') || '');
  const [agent, setAgent] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [view, setView] = useState('queue');
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [agents, setAgents] = useState([]);
  const [newAgent, setNewAgent] = useState({ firstName: '', lastName: '', email: '', password: '', role: 'agent' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const expireAgentSession = useCallback(() => {
    localStorage.removeItem('supportAgentToken');
    setToken('');
    setAgent(null);
    setTickets([]);
    setSelected(null);
    setMessages([]);
  }, []);

  const handlePollingError = useCallback((requestError) => {
    if (requestError?.response?.status === 401) {
      expireAgentSession();
    }
  }, [expireAgentSession]);

  const client = useCallback(() => axios.create({
    baseURL: API_BASE,
    headers: { Authorization: `Bearer ${token}` },
  }), [token]);

  const loadTickets = useCallback(async () => {
    if (!token) return;
    const response = await client().get('/api/support-agent/tickets');
    setTickets(response.data.tickets || []);
  }, [client, token]);

  const loadMessages = useCallback(async (ticketId) => {
    if (!token || !ticketId) return;
    const response = await client().get(`/api/support-agent/tickets/${ticketId}/messages`);
    setMessages(response.data.messages || []);
  }, [client, token]);

  const restore = useCallback(async () => {
    if (!token) return;
    try {
      const response = await client().get('/api/support-agent/me');
      setAgent(response.data.agent);
      await loadTickets();
    } catch (requestError) {
      localStorage.removeItem('supportAgentToken');
      setToken('');
      setAgent(null);
    }
  }, [client, loadTickets, token]);

  useEffect(() => { void restore(); }, [restore]);
  useEffect(() => {
    if (!agent) return undefined;
    const timer = setInterval(() => {
      void loadTickets().catch(handlePollingError);
      if (selected) void loadMessages(selected.ticketId).catch(handlePollingError);
    }, 15000);
    return () => clearInterval(timer);
  }, [agent, handlePollingError, loadMessages, loadTickets, selected]);

  const login = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await axios.post(`${API_BASE}/api/support-agent/auth/login`, { email: email.trim().toLowerCase(), password });
      localStorage.setItem('supportAgentToken', response.data.token);
      setToken(response.data.token); setAgent(response.data.agent); setPassword('');
    } catch (requestError) { setError(requestError.response?.data?.message || 'Agent login failed'); }
    finally { setBusy(false); }
  };

  const selectTicket = async (ticket) => {
    setSelected(ticket); setError('');
    try { await loadMessages(ticket.ticketId); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Could not load the conversation'); }
  };

  const accept = async () => {
    try {
      await client().post(`/api/support-agent/tickets/${selected.ticketId}/accept`);
      await loadTickets(); setSelected({ ...selected, assignedAgentId: agent.id, assignedAgentName: `${agent.firstName} ${agent.lastName}`, status: 'open' });
    } catch (requestError) { setError(requestError.response?.data?.message || 'Could not accept ticket'); }
  };

  const send = async () => {
    const message = reply.trim(); if (!message || !selected) return;
    try {
      await client().post(`/api/support-agent/tickets/${selected.ticketId}/reply`, { message });
      setReply(''); await loadMessages(selected.ticketId);
    } catch (requestError) { setError(requestError.response?.data?.message || 'Could not send reply'); }
  };

  const resolve = async () => {
    try {
      await client().post(`/api/support-agent/tickets/${selected.ticketId}/resolve`);
      setSelected(null); setMessages([]); await loadTickets();
    } catch (requestError) { setError(requestError.response?.data?.message || 'Could not resolve ticket'); }
  };

  const loadAgents = async () => {
    try { const response = await client().get('/api/support-agent/agents'); setAgents(response.data.agents || []); setView('agents'); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Could not load agents'); }
  };

  const createAgent = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await client().post('/api/support-agent/agents', newAgent);
      setNewAgent({ firstName: '', lastName: '', email: '', password: '', role: 'agent' });
      await loadAgents();
    } catch (requestError) { setError(requestError.response?.data?.message || 'Could not create agent'); }
    finally { setBusy(false); }
  };

  const toggleAgent = async (item) => {
    try { await client().patch(`/api/support-agent/agents/${item.id}`, { isActive: !item.isActive }); await loadAgents(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Could not update agent'); }
  };

  const logout = () => { localStorage.removeItem('supportAgentToken'); setToken(''); setAgent(null); setTickets([]); setSelected(null); };

  if (!agent) return (
    <main className="login-shell"><form className="login-card" onSubmit={login}>
      <div className="brand-mark">FJ</div><h1>Support Agent Portal</h1>
      <p>This login is only for Future Jobs Pro AI customer-service agents.</p>
      {error && <div className="error-banner">{error}</div>}
      <label>Email address</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <button className="primary-button" disabled={busy}>{busy ? 'Signing in…' : 'Agent sign in'}</button>
      <p className="security-note">Customer and company-manager credentials cannot access this portal.</p>
    </form></main>
  );

  const manager = ['owner', 'supervisor'].includes(agent.role);
  return <main className="portal-shell">
    <aside className="ticket-sidebar">
      <header className="sidebar-header"><div><span className="eyebrow">Future Jobs Pro AI</span><h1>Customer support</h1></div></header>
      <div className="agent-card"><strong>{agent.firstName} {agent.lastName}</strong><span>{agent.role}</span></div>
      <nav className="portal-nav">
        <button className={view === 'queue' ? 'selected' : ''} onClick={() => setView('queue')}>Support queue</button>
        {manager && <button className={view === 'agents' ? 'selected' : ''} onClick={() => void loadAgents()}>Agent management</button>}
        <button onClick={logout}>Sign out</button>
      </nav>
      {view === 'queue' && <><div className="queue-count">{tickets.length} active tickets</div><div className="ticket-list">
        {tickets.map((ticket) => <button key={ticket.ticketId} className={`ticket-card ${selected?.ticketId === ticket.ticketId ? 'selected' : ''}`} onClick={() => void selectTicket(ticket)}>
          <strong>{ticket.userName || 'Customer'}</strong><span>Ticket #{ticket.ticketId}</span><p>{ticket.lastMessage || 'Waiting for assistance'}</p>
        </button>)}
      </div></>}
    </aside>
    <section className="conversation-panel">
      {error && <div className="error-banner portal-error">{error}<button onClick={() => setError('')}>×</button></div>}
      {view === 'agents' ? <section className="management-panel"><h2>Agent management</h2><p>Create credentials for Future Jobs Pro AI support staff. These accounts cannot enter customer companies.</p>
        <form className="agent-form" onSubmit={createAgent}>
          <input placeholder="First name" value={newAgent.firstName} onChange={(e) => setNewAgent({ ...newAgent, firstName: e.target.value })} required />
          <input placeholder="Last name" value={newAgent.lastName} onChange={(e) => setNewAgent({ ...newAgent, lastName: e.target.value })} required />
          <input type="email" placeholder="Agent email" value={newAgent.email} onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })} required />
          <input type="password" placeholder="Temporary password (12+ characters)" value={newAgent.password} onChange={(e) => setNewAgent({ ...newAgent, password: e.target.value })} minLength="12" required />
          <select value={newAgent.role} onChange={(e) => setNewAgent({ ...newAgent, role: e.target.value })}><option value="agent">Agent</option>{agent.role === 'owner' && <option value="supervisor">Supervisor</option>}</select>
          <button className="primary-button" disabled={busy}>Create agent login</button>
        </form>
        <div className="agent-list">{agents.map((item) => <article key={item.id}><div><strong>{item.firstName} {item.lastName}</strong><span>{item.email} · {item.role}</span></div><button className="secondary-button" onClick={() => void toggleAgent(item)}>{item.isActive ? 'Disable' : 'Enable'}</button></article>)}</div>
      </section> : !selected ? <div className="empty-conversation"><h2>Select a customer request</h2><p>Accept a ticket to begin human support after Lucy's handoff.</p></div> : <>
        <header className="conversation-header"><div><span className="eyebrow">Ticket #{selected.ticketId}</span><h2>{selected.userName}</h2></div><div className="header-actions">
          {!selected.assignedAgentId && <button className="primary-button" onClick={() => void accept()}>Accept ticket</button>}
          {selected.assignedAgentId === agent.id && <button className="resolve-button" onClick={() => void resolve()}>Resolve</button>}
        </div></header>
        {selected.lucySummary && <div className="lucy-summary"><strong>Lucy handoff summary</strong><p>{selected.lucySummary}</p></div>}
        <div className="messages">{messages.map((message) => <article key={message.id} className={`message ${message.senderType === 'agent' ? 'mine' : ''}`}><span>{message.senderName}</span><p>{message.message}</p><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></article>)}</div>
        <footer className="composer"><textarea rows="3" value={reply} onChange={(e) => setReply(e.target.value)} placeholder={selected.assignedAgentId === agent.id ? 'Write a reply…' : 'Accept the ticket before replying'} disabled={selected.assignedAgentId !== agent.id} /><button className="primary-button send-button" onClick={() => void send()} disabled={!reply.trim() || selected.assignedAgentId !== agent.id}>Send reply</button></footer>
      </>}
    </section>
  </main>;
}

export default App;
