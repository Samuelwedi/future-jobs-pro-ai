import React, { useState } from 'react';
import {
  Box, Container, Typography, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, Checkbox,
} from '@mui/material';
import { Assignment } from '@mui/icons-material';

const mockTasks = [
  { id: 1, text: 'Inspect HVAC unit before startup', priority: 'High', status: 'In Progress' },
  { id: 2, text: 'Replace water filter', priority: 'Medium', status: 'Done' },
  { id: 3, text: 'Submit timesheet for the week', priority: 'Low', status: 'Pending' },
];

export default function Tasks() {
  const [tasks] = useState(mockTasks);

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
          <Assignment sx={{ mr: 1, verticalAlign: 'middle' }} />
          Tasks
        </Typography>
        <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
          Your job tasks and checklists
        </Typography>

        <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', overflow: 'hidden' }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: '#888' }}>Task</TableCell>
                  <TableCell sx={{ color: '#888' }}>Priority</TableCell>
                  <TableCell sx={{ color: '#888' }}>Status</TableCell>
                  <TableCell sx={{ color: '#888' }}>Done</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id} hover>
                    <TableCell sx={{ color: '#FFF' }}>{task.text}</TableCell>
                    <TableCell>
                      <Chip
                        label={task.priority}
                        size="small"
                        sx={{
                          bgcolor: task.priority === 'High' ? '#F4433620' : task.priority === 'Medium' ? '#FF980020' : '#4CAF5020',
                          color: task.priority === 'High' ? '#F44336' : task.priority === 'Medium' ? '#FF9800' : '#4CAF50',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={task.status}
                        size="small"
                        sx={{
                          bgcolor: task.status === 'Done' ? '#4CAF5020' : '#FF980020',
                          color: task.status === 'Done' ? '#4CAF50' : '#FF9800',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox disabled checked={task.status === 'Done'} sx={{ color: '#00D4FF', '&.Mui-checked': { color: '#00D4FF' } }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Container>
    </Box>
  );
}