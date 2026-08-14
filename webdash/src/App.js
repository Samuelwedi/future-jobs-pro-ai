import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import './App.css';

const API_BASE = (process.env.REACT_APP_API_BASE || 'https://future-jobs-pro-ai-production.up.railway.app').replace(/\/$/, '');

function App() {
  const [token, setToken] = useState(localStorage.getItem('agentToken') || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [agent, setAgent] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [currentTicket, setCurrentTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const socketRef = useRef(null);
  const currentRoomRef = useRef(null);
  const messagesEndRef = useRef(null);

  const authHeaders = { Authorization: `Bearer ${token}` };

  const authenticate = async (candidate = token) => {
    const cleanToken = candidate.trim();
    if (!cleanToken) return;
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_BASE}/api/support/tickets`, {
        headers: { Authorization: `Bearer ${cleanToken}` },
      });
      localStorage.setItem('agentToken', cleanToken);
      setToken(cleanToken);
      setAgent(response.data.agent);
      setTickets(response.data.tickets || []);
      setAuthenticated(true);
    } catch (requestError) {
      localStorage.removeItem('agentToken');
      setAuthenticated(false);
      setError(requestError.response?.data?.message || 'Agent authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      const response = await axios.post(`${API_BASE}/api/auth/login`, {
        email: email.trim().toLowerCase(),
        password,
      });
      const newToken = response.data?.token;
      if (!newToken) throw new Error('The server did not return an authentication token');
      await authenticate(newToken);
      setPassword('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Agent sign-in failed');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) void authenticate(token);
    // Authenticate the persisted token once at startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authenticated || !token) return undefined;
    const socket = io(API_BASE, {
      transports: ['websocket'],
      auth: { token },
    });
    socketRef.current = socket;
    socket.on('connect', () => {
      socket.emit('join-agent-dashboard', (result) => {
        if (!result?.success) setError(result?.message || 'Could not join the agent dashboard');
      });
    });
    socket.on('connect_error', (socketError) => setError(socketError.message));
    socket.on('new-ticket', (ticket) => {
      setTickets((current) => current.some((item) => String(item.ticketId) === String(ticket.ticketId))
        ? current
        : [{ ...ticket, status: 'open' }, ...current]);
    });
    socket.on('ticket-resolved', ({ ticketId }) => {
      setTickets((current) => current.filter((ticket) => String(ticket.ticketId) !== String(ticketId)));
      if (currentRoomRef.current === `support-ticket-${ticketId}`) {
        setCurrentTicket(null);
        setMessages([]);
        currentRoomRef.current = null;
      }
    });
    socket.on('new-message', (message) => {
      if (message.room_id && message.room_id !== currentRoomRef.current) return;
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    });
    return () => socket.disconnect();
  }, [authenticated, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const joinTicket = async (ticket) => {
    setError('');
    if (currentRoomRef.current) socketRef.current?.emit('leave-room', currentRoomRef.current);
    setCurrentTicket(ticket);
    currentRoomRef.current = ticket.roomId;
    setMessages([]);
    socketRef.current?.emit('join-room', ticket.roomId, (result) => {
      if (!result?.success) setError(result?.message || 'Could not join the ticket');
    });
    try {
      const response = await axios.get(`${API_BASE}/api/chat/room/${encodeURIComponent(ticket.roomId)}`, {
        headers: authHeaders,
      });
      setMessages(response.data.messages || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load ticket messages');
    }
  };

  const sendMessage = () => {
    const message = input.trim();
    if (!message || !currentTicket) return;
    socketRef.current?.emit('chat-message', { roomId: currentTicket.roomId, message });
    setInput('');
  };

  const resolveTicket = async () => {
    if (!currentTicket) return;
    try {
      await axios.post(`${API_BASE}/api/support/resolve`, { ticketId: currentTicket.ticketId }, { headers: authHeaders });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not resolve the ticket');
    }
  };

  const generateSuggestion = async () => {
    if (!currentTicket) return;
    setLoadingSuggest(true);
    setError('');
    try {
      const response = await axios.post(
        `${API_BASE}/api/support/tickets/${currentTicket.ticketId}/suggest`,
        {},
        { headers: authHeaders },
      );
      setInput(response.data.reply || '');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not generate a suggestion');
    } finally {
      setLoadingSuggest(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('agentToken');
    socketRef.current?.disconnect();
    setAuthenticated(false);
    setAgent(null);
    setTickets([]);
    setCurrentTicket(null);
    setMessages([]);
    setToken('');
  };

  if (!authenticated) {
    return (
      <main className="login-shell">
        <form className="login-card" onSubmit={(event) => { event.preventDefault(); void login(); }}>
          <div className="brand-mark">FJ</div>
          <h1>Support Agent Portal</h1>
          <p>Sign in with an authorized manager, boss, support-agent, or administrator account.</p>
          {error && <div className="error-banner">{error}</div>}
          <label htmlFor="agent-email">Email address</label>
          <input id="agent-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="agent@company.com" />
          <label htmlFor="agent-password">Password</label>
          <input id="agent-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" />
          <button className="primary-button" type="submit" disabled={loading || !email.trim() || !password}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="security-note">Access is limited by your role and company. Every ticket remains tenant-scoped.</p>
        </form>
      </main>
    );
  }

  return (
    <main className="portal-shell">
      <aside className="ticket-sidebar">
        <header className="sidebar-header">
          <div><span className="eyebrow">Future Jobs Pro AI</span><h1>Support queue</h1></div>
          <button className="text-button" onClick={logout}>Sign out</button>
        </header>
        <div className="agent-card"><strong>{agent?.name || 'Support Agent'}</strong><span>{agent?.role || 'agent'}</span></div>
        <div className="queue-count">{tickets.length} open {tickets.length === 1 ? 'ticket' : 'tickets'}</div>
        <div className="ticket-list">
          {tickets.length === 0 && <div className="empty-state">No open tickets</div>}
          {tickets.map((ticket) => (
            <button key={ticket.ticketId} className={`ticket-card ${currentTicket?.ticketId === ticket.ticketId ? 'selected' : ''}`} onClick={() => void joinTicket(ticket)}>
              <strong>{ticket.userName || 'Customer'}</strong>
              <span>Ticket #{ticket.ticketId}</span>
              <p>{ticket.lastMessage || 'No messages'}</p>
            </button>
          ))}
        </div>
      </aside>

      <section className="conversation-panel">
        {error && <div className="error-banner portal-error">{error}<button onClick={() => setError('')}>×</button></div>}
        {!currentTicket ? (
          <div className="empty-conversation"><div className="empty-icon">↗</div><h2>Select a support ticket</h2><p>Choose an open request from the queue to begin.</p></div>
        ) : (
          <>
            <header className="conversation-header">
              <div><span className="eyebrow">Ticket #{currentTicket.ticketId}</span><h2>{currentTicket.userName || 'Customer'}</h2></div>
              <div className="header-actions">
                <button className="secondary-button" onClick={() => void generateSuggestion()} disabled={loadingSuggest}>{loadingSuggest ? 'Drafting…' : 'AI draft'}</button>
                <button className="resolve-button" onClick={() => void resolveTicket()}>Resolve</button>
              </div>
            </header>
            <div className="messages">
              {messages.map((message) => {
                const mine = String(message.sender_id) === String(agent?.id);
                return <article key={message.id || `${message.created_at}-${message.message}`} className={`message ${mine ? 'mine' : ''}`}>
                  <span>{mine ? 'You' : message.sender_name || 'Customer'}</span>
                  <p>{message.message}</p>
                  <time>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                </article>;
              })}
              <div ref={messagesEndRef} />
            </div>
            <footer className="composer">
              <textarea rows="3" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }
              }} placeholder="Write a reply…" />
              <button className="primary-button send-button" onClick={sendMessage} disabled={!input.trim()}>Send reply</button>
            </footer>
          </>
        )}
      </section>
    </main>
  );
}

export default App;
