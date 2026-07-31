import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, List, ListItem, ListItemText, ListItemAvatar,
  Avatar, Checkbox, Button, CircularProgress,
} from '@mui/material';
import { Search } from '@mui/icons-material';

const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
}

interface SelectEmployeesDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (selectedIds: string[]) => void;
  initialSelected?: string[];
  companyId: string;
  token: string;
}

export default function SelectEmployeesDialog({
  open,
  onClose,
  onSelect,
  initialSelected = [],
  companyId,
  token,
}: SelectEmployeesDialogProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filtered, setFiltered] = useState<Employee[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelected);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (open) {
      fetchEmployees();
    }
  }, [open]);

  useEffect(() => {
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      setFiltered(employees.filter(e =>
        `${e.first_name} ${e.last_name}`.toLowerCase().includes(lower)
      ));
    } else {
      setFiltered(employees);
    }
  }, [searchTerm, employees]);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/team/members/${companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const members = data.members || [];
      setEmployees(members);
      setFiltered(members);
    } catch (e) {
      console.error(e);
      alert('Could not load employees');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleConfirm = () => {
    onSelect(selectedIds);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF' }}>
        Select Employees
      </DialogTitle>
      <DialogContent sx={{ bgcolor: '#0A0A0A' }}>
        <TextField
          fullWidth
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{ startAdornment: <Search sx={{ color: '#888', mr: 1 }} /> }}
          sx={{ mb: 2, input: { color: '#FFF' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }}
        />
        {loading ? (
          <CircularProgress sx={{ color: '#00D4FF' }} />
        ) : (
          <List sx={{ maxHeight: 300, overflow: 'auto' }}>
            {filtered.map((emp) => (
              <ListItem
                key={emp.id}
                button
                onClick={() => toggleSelection(emp.id)}
                sx={{ borderBottom: '1px solid #222' }}
              >
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: '#00D4FF' }}>
                    {emp.first_name[0]}{emp.last_name[0]}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={`${emp.first_name} ${emp.last_name}`}
                  secondary={emp.role}
                  primaryTypographyProps={{ color: '#FFF' }}
                  secondaryTypographyProps={{ color: '#888' }}
                />
                <Checkbox checked={selectedIds.includes(emp.id)} sx={{ color: '#00D4FF' }} />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions sx={{ bgcolor: '#1A1A1A' }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={selectedIds.length === 0}
          sx={{ bgcolor: '#00D4FF', color: '#0A0A0A' }}
        >
          Confirm ({selectedIds.length})
        </Button>
      </DialogActions>
    </Dialog>
  );
}