import React, { useState, useEffect, useCallback } from 'react';
import { Calendar as BigCalendar, momentLocalizer, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import {
  Box, Container, Typography, Paper, Dialog, DialogTitle, DialogContent,
  TextField, Button, Select, MenuItem, FormControl, InputLabel, Chip, IconButton,
  FormControlLabel, Switch, Stack, Alert,
} from '@mui/material';
import { Add, Delete, DragIndicator, Repeat } from '@mui/icons-material';

const localizer = momentLocalizer(moment);
const API_BASE = 'https://future-jobs-pro-ai-production.up.railway.app';

// ---------- Types ----------
interface Shift {
  id: string;
  company_id: string;
  project_id: string;
  name: string;
  date: string;
  start_time: string;
  end_time: string;
  notes?: string;
  attachments?: any[];
  assignments?: any[];
  project_name?: string;
  recurring_shift_id?: string | null;
}

interface RecurringShift {
  id: string;
  company_id: string;
  project_id: string | null;
  title: string;
  employee_id: string;
  day_of_week: number; // 0=Sun,1=Mon...
  start_time: string;
  end_time: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  project_name?: string;
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

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: any;
  recurring?: boolean;
  recurringShiftId?: string | null;
}

// ---------- Draggable Event Component ----------
const DraggableEvent = ({ event }: any) => {
  const isRecurring = event.resource?.recurring_shift_id || event.recurring;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, height: '100%' }}>
      {isRecurring && <Repeat sx={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }} />}
      <DragIndicator sx={{ fontSize: 16, color: 'rgba(255,255,255,0.6)' }} />
      <Typography variant="caption" noWrap>{event.title}</Typography>
    </Box>
  );
};

// ---------- Main Component ----------
export default function SchedulePage() {
  const [user, setUser] = useState<any>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [recurringShifts, setRecurringShifts] = useState<RecurringShift[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<moment.Moment | null>(null);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<RecurringShift | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formProjectId, setFormProjectId] = useState('');
  const [formStart, setFormStart] = useState('08:00');
  const [formEnd, setFormEnd] = useState('16:00');
  const [formNotes, setFormNotes] = useState('');
  const [formEmployees, setFormEmployees] = useState<string[]>([]);
  // Recurring fields
  const [formDayOfWeek, setFormDayOfWeek] = useState<number>(1);
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');

  const token = localStorage.getItem('token') || '';
  const companyId = user?.companyId || '';

  // ---------- Fetch Data ----------
  const fetchCalendarData = useCallback(async () => {
    if (!companyId) return;
    const start = moment().startOf('week').format('YYYY-MM-DD');
    const end = moment().endOf('week').format('YYYY-MM-DD');
    try {
      // Fetch one‑off shifts
      const shiftsRes = await fetch(`${API_BASE}/api/schedule/shifts?start=${start}&end=${end}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const shiftsData = await shiftsRes.json();
      setShifts(shiftsData.shifts || []);

      // Fetch recurring rules
      const recRes = await fetch(`${API_BASE}/api/recurring-shifts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const recData = await recRes.json();
      setRecurringShifts(recData.shifts || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [companyId, token]);

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (e) { console.error(e); }
  };

  const fetchEmployees = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/team`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setEmployees(data.members || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) setUser(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    if (companyId) {
      fetchCalendarData();
      fetchProjects();
      fetchEmployees();
    }
  }, [companyId, fetchCalendarData]);

  // ---------- Dialog Controls ----------
  const openCreateDialog = (date: Date) => {
    setEditingShift(null);
    setEditingRecurring(null);
    setSelectedDate(moment(date));
    setFormName('');
    setFormProjectId('');
    setFormStart(moment(date).format('HH:mm'));
    setFormEnd(moment(date).add(8, 'hours').format('HH:mm'));
    setFormNotes('');
    setFormEmployees([]);
    setIsRecurring(false);
    setFormDayOfWeek(moment(date).day());
    setFormStartDate(moment(date).format('YYYY-MM-DD'));
    setFormEndDate(moment(date).add(3, 'months').format('YYYY-MM-DD'));
    setDialogOpen(true);
  };

  const openEditDialog = (event: any) => {
    const resource = event.resource;
    if (resource.recurring_shift_id) {
      // Edit recurring rule
      const rec = recurringShifts.find(r => r.id === resource.recurring_shift_id);
      if (rec) {
        setEditingRecurring(rec);
        setEditingShift(null);
        setFormName(rec.title || '');
        setFormProjectId(rec.project_id || '');
        setFormStart(rec.start_time);
        setFormEnd(rec.end_time);
        setFormNotes('');
        setFormEmployees([rec.employee_id]);
        setIsRecurring(true);
        setFormDayOfWeek(rec.day_of_week);
        setFormStartDate(rec.start_date);
        setFormEndDate(rec.end_date || '');
        setDialogOpen(true);
        return;
      }
    }
    // One‑off shift
    const shift = resource;
    setEditingShift(shift);
    setEditingRecurring(null);
    setFormName(shift.name);
    setFormProjectId(shift.project_id);
    setFormStart(shift.start_time);
    setFormEnd(shift.end_time);
    setFormNotes(shift.notes || '');
    setFormEmployees(shift.assignments?.map((a: any) => a.user_id) || []);
    setIsRecurring(false);
    setDialogOpen(true);
  };

  // ---------- Save / Update ----------
  const handleSave = async () => {
    try {
      if (isRecurring) {
        // Save recurring rule
        const payload = {
          title: formName,
          projectId: formProjectId || null,
          employeeId: formEmployees[0] || '',
          dayOfWeek: formDayOfWeek,
          startTime: formStart + ':00',
          endTime: formEnd + ':00',
          startDate: formStartDate,
          endDate: formEndDate || null,
        };

        if (editingRecurring) {
          await fetch(`${API_BASE}/api/recurring-shifts/${editingRecurring.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
          });
        } else {
          await fetch(`${API_BASE}/api/recurring-shifts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
          });
        }
      } else {
        // Save one‑off shift
        const payload = {
          name: formName,
          date: selectedDate?.format('YYYY-MM-DD'),
          startTime: formStart,
          endTime: formEnd,
          projectId: formProjectId || null,
          notes: formNotes,
          employeeIds: formEmployees,
        };
        if (editingShift) {
          await fetch(`${API_BASE}/api/schedule/shifts/${editingShift.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              name: formName,
              date: editingShift.date,
              startTime: formStart,
              endTime: formEnd,
              notes: formNotes,
              attachmentUrl: null,
              attachmentType: null,
              employeeIds: formEmployees,
            }),
          });
        } else {
          await fetch(`${API_BASE}/api/schedule/shifts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
          });
        }
      }
      setDialogOpen(false);
      fetchCalendarData();
    } catch (e) {
      console.error(e);
      alert('Failed to save shift');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this shift/recurring rule?')) return;
    try {
      if (editingRecurring) {
        await fetch(`${API_BASE}/api/recurring-shifts/${editingRecurring.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } else if (editingShift) {
        await fetch(`${API_BASE}/api/schedule/shifts/${editingShift.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      setDialogOpen(false);
      fetchCalendarData();
    } catch (e) {
      console.error(e);
      alert('Failed to delete');
    }
  };

  // ---------- Build Calendar Events ----------
  const buildEvents = (): CalendarEvent[] => {
    const events: CalendarEvent[] = [];

    // One‑off shifts
    shifts.forEach(s => {
      events.push({
        id: s.id,
        title: `${s.name} (${s.project_name || 'No Project'})`,
        start: moment(`${s.date} ${s.start_time}`).toDate(),
        end: moment(`${s.date} ${s.end_time}`).toDate(),
        resource: s,
        recurring: false,
        recurringShiftId: s.recurring_shift_id || null,
      });
    });

    // Recurring shifts – expand to occurrences within the current view
    const startDate = moment().startOf('week');
    const endDate = moment().endOf('week').add(4, 'weeks'); // show 5 weeks
    recurringShifts.forEach(rule => {
      let current = moment(rule.start_date).startOf('day');
      const ruleEnd = rule.end_date ? moment(rule.end_date) : moment().add(6, 'months');
      while (current.isSameOrBefore(ruleEnd) && current.isSameOrBefore(endDate)) {
        if (current.day() === rule.day_of_week) {
          const start = moment(current);
          const [sh, sm] = rule.start_time.split(':').map(Number);
          start.set({ hour: sh, minute: sm, second: 0 });
          const end = moment(current);
          const [eh, em] = rule.end_time.split(':').map(Number);
          end.set({ hour: eh, minute: em, second: 0 });
          events.push({
            id: `rec-${rule.id}-${current.format('YYYY-MM-DD')}`,
            title: `${rule.title || 'Recurring Shift'} (${rule.project_name || 'No Project'})`,
            start: start.toDate(),
            end: end.toDate(),
            resource: {
              ...rule,
              recurring_shift_id: rule.id,
              project_name: rule.project_name,
              employee_name: rule.employee_name,
            },
            recurring: true,
            recurringShiftId: rule.id,
          });
        }
        current.add(1, 'day');
      }
    });
    return events;
  };

  const events = buildEvents();

  // ---------- Drag & Drop Handler ----------
  const handleEventDrop = async ({ event, start, end }: any) => {
    const resource = event.resource;
    const newDate = moment(start).format('YYYY-MM-DD');
    const newStart = moment(start).format('HH:mm');
    const newEnd = moment(end).format('HH:mm');

    try {
      if (event.recurring) {
        // Update the recurring rule (shift all occurrences)
        const recId = resource.id || resource.recurring_shift_id;
        await fetch(`${API_BASE}/api/recurring-shifts/${recId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            startTime: newStart + ':00',
            endTime: newEnd + ':00',
            // Keep other fields unchanged
          }),
        });
      } else {
        // Update one‑off shift
        await fetch(`${API_BASE}/api/schedule/shifts/${resource.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            date: newDate,
            start_time: newStart,
            end_time: newEnd,
          }),
        });
      }
      fetchCalendarData();
    } catch (e) {
      console.error(e);
      alert('Failed to update shift');
    }
  };

  // ---------- Render ----------
  return (
    <DndProvider backend={HTML5Backend}>
      <Container maxWidth="xl" sx={{ py: 4, bgcolor: '#0A0A0A', minHeight: '100vh' }}>
        <Typography variant="h4" sx={{ color: '#FFF', mb: 2 }}>📅 Schedule</Typography>

        <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 2, p: 2, border: '1px solid #333' }}>
          <BigCalendar
            localizer={localizer}
            events={events}
            defaultView={Views.WEEK}
            views={[Views.WEEK, Views.DAY, Views.MONTH]}
            step={30}
            timeslots={2}
            style={{ height: 650, color: '#FFF' }}
            eventPropGetter={(event) => {
              const isRecurring = event.recurring;
              return {
                style: {
                  backgroundColor: isRecurring ? '#4CAF50' : '#00D4FF',
                  color: '#0A0A0A',
                  borderRadius: 6,
                  border: isRecurring ? '2px dashed #FFF' : 'none',
                  fontSize: 13,
                },
              };
            }}
            onSelectSlot={(slotInfo) => openCreateDialog(slotInfo.start)}
            onSelectEvent={(event) => openEditDialog(event)}
            selectable
            draggableAccessor={() => true}
            onEventDrop={handleEventDrop}
            components={{ event: DraggableEvent }}
          />
        </Paper>

        {/* ===== Dialog ===== */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ bgcolor: '#1A1A1A', color: '#FFF' }}>
            {editingShift || editingRecurring ? 'Edit Shift' : 'New Shift'}
          </DialogTitle>
          <DialogContent sx={{ bgcolor: '#1A1A1A' }}>
            <FormControlLabel
              control={<Switch checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />}
              label="Recurring (weekly)"
              sx={{ mt: 2, color: '#FFF' }}
            />

            <TextField
              fullWidth
              label="Shift Name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              sx={{ mt: 2, input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }}
            />

            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel sx={{ color: '#888' }}>Project</InputLabel>
              <Select value={formProjectId} onChange={(e) => setFormProjectId(e.target.value)}
                sx={{ color: '#FFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}>
                {projects.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
              </Select>
            </FormControl>

            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <TextField label="Start Time" type="time" value={formStart} onChange={(e) => setFormStart(e.target.value)}
                InputLabelProps={{ shrink: true }} sx={{ flex: 1, input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }} />
              <TextField label="End Time" type="time" value={formEnd} onChange={(e) => setFormEnd(e.target.value)}
                InputLabelProps={{ shrink: true }} sx={{ flex: 1, input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }} />
            </Box>

            {!isRecurring ? (
              <TextField
                fullWidth
                label="Date"
                type="date"
                value={selectedDate ? selectedDate.format('YYYY-MM-DD') : ''}
                onChange={(e) => setSelectedDate(moment(e.target.value))}
                InputLabelProps={{ shrink: true }}
                sx={{ mt: 2, input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }}
              />
            ) : (
              <>
                <FormControl fullWidth sx={{ mt: 2 }}>
                  <InputLabel sx={{ color: '#888' }}>Day of Week</InputLabel>
                  <Select value={formDayOfWeek} onChange={(e) => setFormDayOfWeek(Number(e.target.value))}
                    sx={{ color: '#FFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}>
                    <MenuItem value={0}>Sunday</MenuItem>
                    <MenuItem value={1}>Monday</MenuItem>
                    <MenuItem value={2}>Tuesday</MenuItem>
                    <MenuItem value={3}>Wednesday</MenuItem>
                    <MenuItem value={4}>Thursday</MenuItem>
                    <MenuItem value={5}>Friday</MenuItem>
                    <MenuItem value={6}>Saturday</MenuItem>
                  </Select>
                </FormControl>
                <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                  <TextField label="Start Date" type="date" value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)}
                    InputLabelProps={{ shrink: true }} sx={{ flex: 1, input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }} />
                  <TextField label="End Date (optional)" type="date" value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)}
                    InputLabelProps={{ shrink: true }} sx={{ flex: 1, input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }} />
                </Box>
              </>
            )}

            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel sx={{ color: '#888' }}>Employees</InputLabel>
              <Select
                multiple
                value={formEmployees}
                onChange={(e) => setFormEmployees(e.target.value as string[])}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((id) => {
                      const emp = employees.find(e => e.id === id);
                      return <Chip key={id} label={emp ? `${emp.first_name} ${emp.last_name}` : id} size="small" />;
                    })}
                  </Box>
                )}
                sx={{ color: '#FFF', '& .MuiOutlinedInput-notchedOutline': { borderColor: '#333' } }}
              >
                {employees.map(emp => <MenuItem key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</MenuItem>)}
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="Notes"
              multiline
              rows={2}
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              sx={{ mt: 2, input: { color: '#FFF' }, label: { color: '#888' }, '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: '#333' } } }}
            />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
              {(editingShift || editingRecurring) && (
                <Button startIcon={<Delete />} color="error" onClick={handleDelete}>
                  Delete
                </Button>
              )}
              <Button variant="contained" onClick={handleSave} sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', ml: 'auto' }}>
                {editingShift || editingRecurring ? 'Update' : 'Create'}
              </Button>
            </Box>
          </DialogContent>
        </Dialog>
      </Container>
    </DndProvider>
  );
}