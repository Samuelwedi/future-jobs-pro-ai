import React, { useState, useEffect, useCallback } from 'react';
import { Calendar as BigCalendar, momentLocalizer, Views, Event, stringOrDate } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { DndProvider, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import {
  Box, Container, Typography, Paper, Dialog, DialogTitle, DialogContent,
  TextField, Button, Select, MenuItem, FormControl, InputLabel, Chip, IconButton, Alert,
} from '@mui/material';
import { Add, Delete, DragIndicator } from '@mui/icons-material';
import { api } from '../services/api';   // <-- same Axios client as other web pages

const localizer = momentLocalizer(moment);

// ---------- Type Definitions ----------
interface Shift {
  id: string;
  company_id: string;
  project_id: string;
  name: string;
  date: string;
  start_time: string;
  end_time: string;
  notes?: string;
  assignments?: Assignment[];
  project_name?: string;
}
interface Assignment {
  id: string;
  user_id: string;
  user_name: string;
}
interface Project {
  id: string;
  name: string;
}
interface Employee {
  id: string;
  first_name: string;
  last_name: string;
}

// ---------- Drag-and-Drop Event Wrapper ----------
const DraggableEvent = ({ event }: any) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, height: '100%' }}>
    <DragIndicator sx={{ fontSize: 16, color: 'rgba(255,255,255,0.6)' }} />
    <Typography variant="caption" noWrap>{event.title}</Typography>
  </Box>
);

// ---------- Main Component ----------
export default function SchedulePage() {
  // ----- State -----
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<moment.Moment | null>(null);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formProjectId, setFormProjectId] = useState('');
  const [formStart, setFormStart] = useState('08:00');
  const [formEnd, setFormEnd] = useState('16:00');
  const [formNotes, setFormNotes] = useState('');
  const [formEmployees, setFormEmployees] = useState<string[]>([]);

  const companyId = '967483e9-dd14-4c97-92d4-841182d4359d';   // TODO: get from auth context
  const userId = '8d4a3818-06e2-4e11-9cc8-9770f4c0e15c';     // TODO: get from auth context

  // ----- Data Fetching -----
  const fetchShifts = useCallback(async () => {
    const start = moment().startOf('week').format('YYYY-MM-DD');
    const end = moment().endOf('week').format('YYYY-MM-DD');
    try {
      const res = await api.get<{ success: boolean; shifts: Shift[] }>(
        `/schedule/shifts?companyId=${companyId}&start=${start}&end=${end}`
      );
      setShifts(res.shifts || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await api.get<{ success: boolean; projects: Project[] }>('/projects/active');
      setProjects(res.projects || []);
    } catch (e) { console.error(e); }
  };

  const fetchEmployees = async () => {
    try {
      const res = await api.get<{ success: boolean; users: Employee[] }>(`/users/company/${companyId}`);
      setEmployees(res.users || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchShifts(); fetchProjects(); fetchEmployees(); }, [fetchShifts]);

  // ----- Dialog Handlers -----
  const openCreateDialog = (date: Date) => {
    setEditingShift(null);
    setSelectedDate(moment(date));
    setFormName(''); setFormProjectId(''); setFormStart('08:00'); setFormEnd('16:00');
    setFormNotes(''); setFormEmployees([]);
    setDialogOpen(true);
  };

  const openEditDialog = (shift: Shift) => {
    setEditingShift(shift);
    setFormName(shift.name);
    setFormProjectId(shift.project_id);
    setFormStart(shift.start_time);
    setFormEnd(shift.end_time);
    setFormNotes(shift.notes || '');
    setFormEmployees(shift.assignments?.map(a => a.user_id) || []);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingShift) {
        await api.put(`/schedule/shifts/${editingShift.id}`, {
          name: formName, start_time: formStart, end_time: formEnd, notes: formNotes
        });
      } else {
        await api.post('/schedule/shifts', {
          companyId, projectId: formProjectId, name: formName,
          date: selectedDate?.format('YYYY-MM-DD'), startTime: formStart,
          endTime: formEnd, notes: formNotes, createdBy: userId,
          employeeIds: formEmployees,
        });
      }
      setDialogOpen(false);
      fetchShifts();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (shiftId: string) => {
    if (!window.confirm('Delete this shift?')) return;
    await api.delete(`/schedule/shifts/${shiftId}`);
    fetchShifts();
  };

  // ----- Convert shifts to calendar events -----
  const events: Event[] = shifts.map(s => ({
    id: s.id,
    title: `${s.name} (${s.project_name || 'Project'})`,
    start: moment(`${s.date} ${s.start_time}`).toDate(),
    end: moment(`${s.date} ${s.end_time}`).toDate(),
    resource: s,
  }));

  // ----- Calendar Drag‑and‑Drop (move event = change date/time) -----
  const handleEventDrop = async ({ event, start, end }: any) => {
    const shift = event.resource as Shift;
    const newDate = moment(start).format('YYYY-MM-DD');
    const newStart = moment(start).format('HH:mm');
    const newEnd = moment(end).format('HH:mm');
    await api.put(`/schedule/shifts/${shift.id}`, { date: newDate, start_time: newStart, end_time: newEnd });
    fetchShifts();
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <Container maxWidth="xl" sx={{ py: 4, bgcolor: '#0A0A0A', minHeight: '100vh' }}>
        <Typography variant="h4" sx={{ color: '#FFF', mb: 2 }}>📅 Schedule</Typography>

        <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 2, p: 2, border: '1px solid #333' }}>
          <BigCalendar
            localizer={localizer}
            events={events}
            defaultView={Views.WEEK}
            views={[Views.WEEK, Views.DAY]}
            step={30}
            timeslots={2}
            style={{ height: 650, color: '#FFF' }}
            eventPropGetter={() => ({ style: { backgroundColor: '#00D4FF', color: '#0A0A0A', borderRadius: 6, border: 'none', fontSize: 13 } })}
            onSelectSlot={(slotInfo) => openCreateDialog(slotInfo.start)}
            onSelectEvent={(event) => openEditDialog(event.resource as Shift)}
            selectable
            draggableAccessor={() => true}
            onEventDrop={handleEventDrop}
            components={{ event: DraggableEvent }}
          />
        </Paper>

        {/* Create / Edit Dialog */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF' }}>
            {editingShift ? 'Edit Shift' : 'New Shift'}
          </DialogTitle>
          <DialogContent sx={{ bgcolor: '#1A1A1A' }}>
            <TextField fullWidth label="Shift Name" value={formName} onChange={e => setFormName(e.target.value)}
              sx={{ mt: 2, input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }} />
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel sx={{ color: '#888' }}>Project</InputLabel>
              <Select value={formProjectId} onChange={e => setFormProjectId(e.target.value)}
                sx={{ color: '#FFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}>
                {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <TextField label="Start Time" type="time" value={formStart} onChange={e => setFormStart(e.target.value)}
                InputLabelProps={{ shrink: true }} sx={{ flex: 1, input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }} />
              <TextField label="End Time" type="time" value={formEnd} onChange={e => setFormEnd(e.target.value)}
                InputLabelProps={{ shrink: true }} sx={{ flex: 1, input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }} />
            </Box>
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel sx={{ color: '#888' }}>Employees</InputLabel>
              <Select multiple value={formEmployees} onChange={e => setFormEmployees(e.target.value as string[])}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((id) => {
                      const emp = employees.find(e => e.id === id);
                      return <Chip key={id} label={emp ? `${emp.first_name} ${emp.last_name}` : id} size="small" />;
                    })}
                  </Box>
                )}
                sx={{ color: '#FFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}>
                {employees.map(emp => <MenuItem key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField fullWidth label="Notes" multiline rows={2} value={formNotes} onChange={e => setFormNotes(e.target.value)}
              sx={{ mt: 2, input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
              {editingShift && (
                <Button startIcon={<Delete />} color="error" onClick={() => { handleDelete(editingShift.id); setDialogOpen(false); }}>
                  Delete
                </Button>
              )}
              <Button variant="contained" onClick={handleSave} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', ml: 'auto' }}>
                {editingShift ? 'Update' : 'Create'}
              </Button>
            </Box>
          </DialogContent>
        </Dialog>
      </Container>
    </DndProvider>
  );
}