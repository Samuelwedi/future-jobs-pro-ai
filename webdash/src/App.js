import MediaAttachment from './MediaAttachment';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import './App.css';
import OwnerOperations from './OwnerOperations';
import LiveMonitoring from './LiveMonitoring';

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
  const [sending, setSending] = useState(false);
  const activeTicket = useRef(null);
  const messageRequest = useRef(0);
  const queueRequest = useRef(0);
  const sessionVersion = useRef(0);
  const sendLock = useRef(false);

  const expireAgentSession = useCallback(() => {
    sessionVersion.current += 1;
    messageRequest.current += 1;
    queueRequest.current += 1;
    activeTicket.current = null;
    setReply('');
    setAgents([]);
    setView('queue');
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
    } else {
      setError('Support updates unavailable. Your last loaded data is shown; retry shortly.');
    }
  }, [expireAgentSession]);

  const client = useCallback(() => axios.create({
    baseURL: API_BASE,
    timeout: 15000,
    headers: { Authorization: `Bearer ${token}` },
  }), [token]);

  const loadTickets = useCallback(async () => {
    if (!token) return;
    const request = ++queueRequest.current;
    const response = await client().get('/api/support-agent/tickets');
    if (request !== queueRequest.current) return;
    const nextTickets = response.data.tickets || [];
    setTickets(nextTickets);
    if (activeTicket.current) {
      const current = nextTickets.find(ticket => ticket.ticketId === activeTicket.current);
      setSelected(current || null);
      if (!current) {
        activeTicket.current = null;
        messageRequest.current += 1;
        setMessages([]);
        setReply('');
      }
    }
  }, [client, token]);

  const loadMessages = useCallback(async (ticketId) => {
    if (!token || !ticketId) return;
    const request = ++messageRequest.current;
    const response = await client().get(`/api/support-agent/tickets/${ticketId}/messages`);
    if (request === messageRequest.current && activeTicket.current === ticketId) {
      setMessages(response.data.messages || []);
    }
  }, [client, token]);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    const version = sessionVersion.current;
    const restore = async () => {
      try {
        const response = await client().get('/api/support-agent/me');
        if (cancelled || version !== sessionVersion.current) return;
        setAgent(response.data.agent);
        if (response.data.agent.role === 'owner') setView('operations');
        await loadTickets();
      } catch (requestError) {
        if (!cancelled && version === sessionVersion.current) handlePollingError(requestError);
      }
    };
    void restore();
    return () => { cancelled = true; };
  }, [client, handlePollingError, loadTickets, token]);
  useEffect(() => {
    if (!agent) return undefined;
    let cancelled = false;
    const version = sessionVersion.current;
    const onError = (requestError) => {
      if (!cancelled && version === sessionVersion.current) handlePollingError(requestError);
    };
    const timer = setInterval(() => {
      void loadTickets().catch(onError);
      if (selected) void loadMessages(selected.ticketId).catch(onError);
    }, 15000);
    return () => { cancelled = true; clearInterval(timer); };
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
    activeTicket.current = ticket.ticketId;
    setSelected(ticket); setMessages([]); setReply(''); setError('');
    try { await loadMessages(ticket.ticketId); return activeTicket.current === ticket.ticketId; }
    catch (requestError) { if (activeTicket.current === ticket.ticketId) setError(requestError.response?.data?.message || 'Could not load the conversation'); }
  };

  const accept = async () => {
    try {
      await client().post(`/api/support-agent/tickets/${selected.ticketId}/accept`);
      await loadTickets();
    } catch (requestError) { setError(requestError.response?.data?.message || 'Could not accept ticket'); }
  };

  const send = async () => {
    const message = reply.trim();
    if (!message || message.length > 5000 || !selected || sendLock.current) return;
    const ticketId = selected.ticketId;
    const version = sessionVersion.current;
    sendLock.current = true; setSending(true); setError('');
    try {
      await client().post(`/api/support-agent/tickets/${ticketId}/reply`, { message });
      if (activeTicket.current === ticketId && version === sessionVersion.current) {
        setReply('');
        await loadMessages(ticketId);
      }
    } catch (requestError) {
      if (activeTicket.current === ticketId && version === sessionVersion.current) {
        if (requestError.response?.status === 401) expireAgentSession();
        else setError(requestError.response?.data?.message || 'Could not confirm reply delivery. Refresh the conversation before retrying.');
      }
    } finally { sendLock.current = false; setSending(false); }
  };

  const resolve = async () => {
    try {
      await client().post(`/api/support-agent/tickets/${selected.ticketId}/resolve`);
      await loadTickets();
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

  const logout = expireAgentSession;

  if (!agent) return (
    <main className="login-shell"><form className="login-card" onSubmit={login}>
      <div className="brand-mark">FJ</div><h1>Future Jobs Pro AI Operations</h1>
      <p>Private workspace for the platform owner and authorized support staff.</p>
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
      <header className="sidebar-header"><div><span className="eyebrow">Future Jobs Pro AI</span><h1>Operations</h1></div></header>
      <div className="agent-card"><strong>{agent.firstName} {agent.lastName}</strong><span>{agent.role}</span></div>
      <nav className="portal-nav">
        {agent.role === 'owner' && <button className={view === 'operations' ? 'selected' : ''} onClick={() => setView('operations')}>Lucy Operations</button>}
        <button className={view === 'queue' ? 'selected' : ''} onClick={() => setView('queue')}>Support queue</button>
        {manager && <button className={view === 'agents' ? 'selected' : ''} onClick={() => void loadAgents()}>Agent management</button>}
        <button className={view === 'reliability' ? 'selected' : ''} onClick={() => setView('reliability')}>Live errors & fixes</button>
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
      {view === 'operations' && agent.role === 'owner' ? <OwnerOperations client={client} onUseDraft={async(job)=>{try{const ticket=tickets.find(t=>String(t.ticketId)===job.ticket_id);if(!ticket){setError('This ticket is no longer in the open queue.');return;}if(await selectTicket(ticket)){setReply(job.result.slice(0,5000));setView('queue');}}catch{setError('Could not open draft.');}}}/> : view === 'reliability' ? <LiveMonitoring client={client} isOwner={agent.role === 'owner'} onUnauthorized={expireAgentSession} /> : view === 'agents' ? <section className="management-panel"><h2>Agent management</h2><p>Create credentials for Future Jobs Pro AI support staff. These accounts cannot enter customer companies.</p>
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
        <div className="messages">{messages.map((message) => <article key={message.id} className={`message ${message.senderType === 'agent' ? 'mine' : ''}`}><span>{message.senderName}</span><p>{message.message}</p>{message.attachment_id&&<MediaAttachment load={async()=>(await client().get(`/api/support-agent/attachments/${message.attachment_id}/content`,{responseType:'blob'})).data} name={message.attachment_name||'attachment'} mime={message.attachment_type||'application/octet-stream'}/>}<time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></article>)}</div>
        <label className="secondary-button">Attach media<input type="file" disabled={busy||!selected?.ticketId} accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;setBusy(true);try{const form=new FormData();form.append('file',file);await client().post(`/api/support-agent/tickets/${selected.ticketId}/attachments`,form);await loadMessages(selected.ticketId);}catch(e){setError(e.response?.data?.message||e.message);}finally{setBusy(false);}}}/></label>
        {agent.role==='owner'&&<button className="secondary-button" disabled={busy} onClick={async()=>{setBusy(true);try{await client().post('/api/owner-operations/jobs',{department:'support',ticketId:String(selected.ticketId),instruction:'Prepare a helpful reply draft based on this ticket. Do not send it.'});setView('operations');}catch(e){setError(e.response?.data?.message||'Could not queue draft');}finally{setBusy(false);}}}>Prepare AI reply draft</button>}
        <footer className="composer"><textarea rows="3" maxLength={5000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={selected.assignedAgentId === agent.id ? 'Write a reply…' : 'Accept the ticket before replying'} disabled={sending || selected.assignedAgentId !== agent.id} /><button className="primary-button send-button" onClick={() => void send()} disabled={sending || !reply.trim() || selected.assignedAgentId !== agent.id}>{sending ? 'Sending…' : 'Send reply'}</button></footer>
      </>}
    </section>
  </main>;
}

export default App;
