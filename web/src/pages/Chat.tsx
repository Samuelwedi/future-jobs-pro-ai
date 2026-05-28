import React from 'react';
import { Box, Container, Typography, Paper, Avatar, List, ListItem, ListItemAvatar, ListItemText, TextField, Button } from '@mui/material';
import { ChatBubble } from '@mui/icons-material';

const mockMessages = [
  { sender: 'John Bossman', message: 'How is the HVAC install going?', time: '10:30 AM', isMe: false },
  { sender: 'You', message: 'On track. Should wrap by 4 PM.', time: '10:32 AM', isMe: true },
  { sender: 'Sarah Tech', message: 'I need a part for the plumbing repair.', time: '11:05 AM', isMe: false },
];

export default function Chat() {
  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="md">
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
          <ChatBubble sx={{ mr: 1, verticalAlign: 'middle' }} />
          Team Chat
        </Typography>
        <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
          Real‑time messaging (demo)
        </Typography>

        <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', p: 2, mb: 2 }}>
          <List>
            {mockMessages.map((msg, i) => (
              <ListItem key={i} sx={{ flexDirection: msg.isMe ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
                <ListItemAvatar sx={{ minWidth: 40 }}>
                  <Avatar sx={{ bgcolor: msg.isMe ? '#00D4FF' : '#555', width: 32, height: 32, fontSize: 14 }}>
                    {msg.sender[0]}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={msg.sender}
                  secondary={msg.message}
                  primaryTypographyProps={{ color: '#FFF', fontSize: 14 }}
                  secondaryTypographyProps={{ color: '#AAA', fontSize: 13 }}
                  sx={{ textAlign: msg.isMe ? 'right' : 'left', mr: msg.isMe ? 0 : 2, ml: msg.isMe ? 2 : 0 }}
                />
              </ListItem>
            ))}
          </List>
        </Paper>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField fullWidth placeholder="Type a message..." variant="outlined"
            sx={{ input: { color: '#FFF' }, '& .MuiOutlinedInput-root': { bgcolor: '#1A1A1A', borderRadius: 2, '& fieldset': { borderColor: '#333' } } }} />
          <Button variant="contained" sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', px: 4 }}>Send</Button>
        </Box>
      </Container>
    </Box>
  );
}