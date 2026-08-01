import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE || 'https://future-jobs-pro-ai-production.up.railway.app';

function App() {
  const [token, setToken] = useState(localStorage.getItem('agentToken') || '');
  const [isLoggedIn, setIsLoggedIn] = useState(!!token);
  const [tickets, setTickets] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [agentId, setAgentId] = useState('');
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Login
  const handleLogin = () => {
    if (token.trim()) {
      localStorage.setItem('agentToken', token);
      setIsLoggedIn(true);
    }
  };

  useEffect(() => {
    if (!isLoggedIn || !token) return;
    const storedId = localStorage.getItem('agentId');
    if (storedId) setAgentId(storedId);
    else {
      const newId = 'agent-' + Math.random().toString(36).substring(7);
      localStorage.setItem('agentId', newId);
      setAgentId(newId);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !agentId) return;

    const socket = io(API_BASE, {
      transports: ['websocket'],
      auth: { token },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Agent connected');
      socket.emit('join-agent-dashboard');
    });

    // Fetch existing tickets on connect
    axios.get(`${API_BASE}/api/support/tickets`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => {
      if (res.data.tickets) setTickets(res.data.tickets);
    }).catch(console.error);

    socket.on('new-ticket', (ticket) => {
      setTickets((prev) => [...prev, { ...ticket, status: 'open' }]);
    });

    socket.on('ticket-resolved', ({ ticketId }) => {
      setTickets((prev) => prev.filter(t => t.ticketId !== ticketId));
      if (currentRoom && currentRoom.includes(ticketId)) {
        setCurrentRoom(null);
        setMessages([]);
      }
    });

    socket.on('new-message', (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.disconnect();
    };
  }, [isLoggedIn, agentId, token, currentRoom]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleJoinTicket = (ticket) => {
    if (currentRoom) socketRef.current.emit('leave-room', currentRoom);
    setCurrentRoom(ticket.roomId);
    setMessages([]);
    socketRef.current.emit('join-room', ticket.roomId);
    axios
      .get(`${API_BASE}/api/chat/room/${ticket.roomId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        if (res.data.messages) setMessages(res.data.messages);
      })
      .catch(console.error);
  };

  const sendMessage = () => {
    if (!input.trim() || !currentRoom) return;
    const msg = input.trim();
    socketRef.current.emit('chat-message', {
      roomId: currentRoom,
      senderId: agentId,
      sender_name: 'Support Agent',
      message: msg,
      companyId: 'company-id-here', // optional; you can get from ticket
    });
    setMessages((prev) => [
      ...prev,
      {
        sender_id: agentId,
        sender_name: 'Support Agent',
        message: msg,
        created_at: new Date().toISOString(),
      },
    ]);
    setInput('');
  };

  const resolveTicket = async (ticketId) => {
    try {
      await axios.post(
        `${API_BASE}/api/support/resolve`,
        { ticketId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.error('Error resolving ticket:', error);
      alert('Failed to resolve ticket. Please try again.');
    }
  };

  // Login screen
  if (!isLoggedIn) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginBox}>
          <h2>🔐 Agent Login</h2>
          <p>Enter your authentication token from the main app:</p>
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your JWT token"
            style={styles.loginInput}
          />
          <button onClick={handleLogin} style={styles.loginButton}>Login</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.sidebar}>
        <h2 style={styles.title}>🛠 Support Tickets</h2>
        {tickets.length === 0 ? (
          <div style={styles.emptyState}>No open tickets</div>
        ) : (
          tickets.map((ticket) => (
            <div
              key={ticket.ticketId}
              style={{
                ...styles.ticketItem,
                borderColor: currentRoom === ticket.roomId ? '#00D4FF' : 'transparent',
              }}
              onClick={() => handleJoinTicket(ticket)}
            >
              <div style={styles.ticketName}>{ticket.userName || 'User'}</div>
              <div style={styles.ticketCompany}>Ticket #{ticket.ticketId}</div>
              <div style={styles.ticketStatus}>Status: {ticket.status}</div>
            </div>
          ))
        )}
      </div>

      <div style={styles.chatArea}>
        {currentRoom ? (
          <>
            <div style={styles.chatHeader}>
              <div>
                <span style={styles.roomId}>Ticket: {currentRoom}</span>
                <span style={styles.agentBadge}>Agent: You</span>
              </div>
              <button
                style={styles.resolveButton}
                onClick={() => resolveTicket(currentRoom.split('-')[2])}
              >
                ✅ Resolve
              </button>
            </div>

            <div style={styles.messagesContainer}>
              {messages.map((msg, idx) => {
                const isAgent = msg.sender_id === agentId;
                return (
                  <div
                    key={idx}
                    style={{
                      ...styles.message,
                      alignSelf: isAgent ? 'flex-end' : 'flex-start',
                      backgroundColor: isAgent ? '#00D4FF' : '#1A1A1A',
                    }}
                  >
                    <div style={styles.senderName}>{msg.sender_name || msg.sender_id}</div>
                    <div>{msg.message}</div>
                    <div style={styles.messageTime}>
                      {new Date(msg.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div style={styles.inputArea}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                style={styles.input}
              />
              <button style={styles.sendButton} onClick={sendMessage}>Send</button>
            </div>
          </>
        ) : (
          <div style={styles.selectPrompt}>Select a ticket to start chatting</div>
        )}
      </div>
    </div>
  );
}

// (Keep the styles object from before – I’ll reuse them)
const styles = {
  container: { display: 'flex', height: '100vh', backgroundColor: '#0A0A0A', color: '#FFF', fontFamily: 'sans-serif' },
  sidebar: { width: '300px', borderRight: '1px solid #333', padding: '20px', overflowY: 'auto', backgroundColor: '#141414' },
  title: { fontSize: '20px', marginBottom: '16px', color: '#00D4FF' },
  ticketItem: { padding: '12px', marginBottom: '8px', backgroundColor: '#1A1A1A', borderRadius: '8px', cursor: 'pointer', border: '2px solid transparent', transition: 'border 0.2s' },
  ticketName: { fontWeight: 'bold', fontSize: '16px' },
  ticketCompany: { fontSize: '12px', color: '#888', marginTop: '4px' },
  ticketStatus: { fontSize: '12px', color: '#F44336', marginTop: '4px' },
  emptyState: { color: '#666', textAlign: 'center', marginTop: '40px' },
  chatArea: { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#0A0A0A' },
  chatHeader: { padding: '16px 24px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  roomId: { fontWeight: 'bold' },
  agentBadge: { marginLeft: '16px', fontSize: '14px', color: '#4CAF50' },
  resolveButton: { backgroundColor: '#4CAF50', color: '#FFF', border: 'none', padding: '6px 18px', borderRadius: '20px', fontWeight: '600', cursor: 'pointer' },
  messagesContainer: { flex: 1, padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' },
  message: { maxWidth: '70%', padding: '10px 16px', borderRadius: '14px', fontSize: '14px', lineHeight: '1.4', color: '#FFF' },
  senderName: { fontSize: '12px', color: '#AAA', marginBottom: '4px' },
  messageTime: { fontSize: '10px', color: '#888', marginTop: '4px', textAlign: 'right' },
  inputArea: { padding: '16px 24px', borderTop: '1px solid #333', display: 'flex', gap: '12px' },
  input: { flex: 1, padding: '10px 18px', borderRadius: '30px', border: 'none', backgroundColor: '#1A1A1A', color: '#FFF', fontSize: '14px', outline: 'none' },
  sendButton: { backgroundColor: '#00D4FF', border: 'none', borderRadius: '30px', padding: '10px 24px', fontWeight: '600', color: '#0A0A0A', cursor: 'pointer' },
  selectPrompt: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#666', fontSize: '18px' },
  loginContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0A0A0A', color: '#FFF' },
  loginBox: { backgroundColor: '#1A1A1A', padding: '40px', borderRadius: '12px', border: '1px solid #333', width: '400px', textAlign: 'center' },
  loginInput: { width: '100%', padding: '12px', marginTop: '16px', borderRadius: '8px', border: 'none', backgroundColor: '#0A0A0A', color: '#FFF' },
  loginButton: { marginTop: '16px', padding: '12px 24px', backgroundColor: '#00D4FF', border: 'none', borderRadius: '8px', color: '#0A0A0A', fontWeight: 'bold', cursor: 'pointer' },
};

export default App;