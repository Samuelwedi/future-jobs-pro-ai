import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Chip, Container, Grid, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { ArrowBack, ArrowForward, AutoAwesome, CameraAlt, CheckCircle, LocationOn, Mic, Schedule, Shield } from '@mui/icons-material';

type ViewKey = 'operations' | 'evidence' | 'lucy';
const views: Array<{ key: ViewKey; label: string; icon: React.ReactNode }> = [
  { key: 'operations', label: 'Operations', icon: <Schedule fontSize="small" /> },
  { key: 'evidence', label: 'Evidence', icon: <Shield fontSize="small" /> },
  { key: 'lucy', label: 'Lucy AI', icon: <AutoAwesome fontSize="small" /> },
];

export default function Demo() {
  const [activeView, setActiveView] = useState<ViewKey>('operations');
  return <Box sx={{ minHeight: '100vh', bgcolor: '#06101D', color: '#FFF' }}>
    <Box sx={{ borderBottom: '1px solid rgba(255,255,255,.09)', bgcolor: '#071524' }}><Container maxWidth="xl"><Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ minHeight: 72 }}>
      <Button component={RouterLink} to="/" startIcon={<ArrowBack />} sx={{ color: '#C6D4E3' }}>Back</Button>
      <Stack direction="row" alignItems="center" spacing={1.2}><Box sx={{ width: 36, height: 36, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: '#6FE7FF', color: '#06101D' }}><AutoAwesome /></Box><Box><Typography fontWeight={900}>Future Jobs Pro AI</Typography><Typography sx={{ color: '#6FE7FF', fontSize: 9, letterSpacing: 1.4, fontWeight: 900 }}>INTERACTIVE PRODUCT TOUR</Typography></Box></Stack>
      <Button component={RouterLink} to="/pricing" variant="contained" endIcon={<ArrowForward />} sx={{ bgcolor: '#6FE7FF', color: '#06101D' }}>Start free trial</Button>
    </Stack></Container></Box>
    <Container maxWidth="xl" sx={{ py: { xs: 5, md: 7 } }}><Grid container spacing={4} alignItems="center">
      <Grid item xs={12} lg={4}>
        <Chip label="READ-ONLY SAMPLE WORKSPACE" sx={{ color: '#8EF5C8', bgcolor: 'rgba(66,232,167,.1)', border: '1px solid rgba(66,232,167,.25)', fontWeight: 900 }} />
        <Typography variant="h2" sx={{ mt: 2.5, fontWeight: 950, letterSpacing: -2.2, lineHeight: 1.02 }}>See the entire workday in one place.</Typography>
        <Typography sx={{ color: '#9EB0C4', lineHeight: 1.75, mt: 2.5, fontSize: 17 }}>Explore a realistic field-service command center. This tour uses sample information and never connects to a customer account.</Typography>
        <Stack spacing={1.2} sx={{ mt: 3 }}>{views.map(view => <Button key={view.key} onClick={() => setActiveView(view.key)} startIcon={view.icon} sx={{ justifyContent: 'flex-start', px: 2, py: 1.35, borderRadius: 2.5, color: activeView === view.key ? '#06101D' : '#C9D6E4', bgcolor: activeView === view.key ? '#6FE7FF' : 'rgba(255,255,255,.045)', border: '1px solid', borderColor: activeView === view.key ? '#6FE7FF' : 'rgba(255,255,255,.1)' }}>{view.label}</Button>)}</Stack>
        <Typography sx={{ color: '#657991', fontSize: 12, mt: 2 }}>No login · No API calls · No production data</Typography>
      </Grid>
      <Grid item xs={12} lg={8}><Paper sx={{ borderRadius: 5, overflow: 'hidden', bgcolor: '#0B1A2C', border: '1px solid #27415D', boxShadow: '0 32px 90px rgba(0,0,0,.38)' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.6, bgcolor: '#0E2137', borderBottom: '1px solid #27415D' }}><Stack direction="row" spacing={1}><Box sx={dot('#FF6B6B')} /><Box sx={dot('#FFC857')} /><Box sx={dot('#42E8A7')} /></Stack><Typography sx={{ color: '#8196AC', fontSize: 11, fontWeight: 800 }}>RIVERSIDE OFFICE · DEMO</Typography><Chip size="small" label="LIVE PREVIEW" sx={{ color: '#8EF5C8', bgcolor: 'rgba(66,232,167,.09)', fontSize: 9, fontWeight: 900 }} /></Stack>
        <Box sx={{ p: { xs: 2, md: 3 } }}>{activeView === 'operations' && <OperationsView />}{activeView === 'evidence' && <EvidenceView />}{activeView === 'lucy' && <LucyView />}</Box>
      </Paper></Grid>
    </Grid></Container>
  </Box>;
}

function OperationsView() {
  return <><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2.5 }}><Box><Eyebrow>FIELD COMMAND CENTER</Eyebrow><Typography variant="h5" fontWeight={900}>Good morning, Samuel</Typography><Typography sx={{ color: '#8398AE', mt: .5 }}>Six jobs are active across today’s operation.</Typography></Box><StatusPill text="12 CREW ON SHIFT" /></Stack>
    <Grid container spacing={1.5}>{[['12','Crew on shift','#42E8A7'],['6','Active jobs','#6FE7FF'],['3','Tasks due','#FFBE68'],['98%','Photo compliance','#C49BFF']].map(([value,label,color]) => <Grid item xs={6} md={3} key={label}><Metric value={value} label={label} color={color} /></Grid>)}</Grid>
    <Paper sx={panelSx}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}><Box><Eyebrow>ACTIVE SHIFT</Eyebrow><Typography fontWeight={900}>Riverside Office Fit-out</Typography><Typography sx={{ color: '#8297AD', fontSize: 12, mt: .4 }}>Crew 3 · Main floor · Calgary</Typography></Box><Box sx={{ textAlign: { sm: 'right' } }}><Typography sx={{ fontSize: 30, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>04:18:32</Typography><Typography sx={{ color: '#8EF5C8', fontSize: 11 }}>GPS verified · On site</Typography></Box></Stack></Paper>
  </>;
}

function EvidenceView() {
  const cards = [{ icon: <CameraAlt />, title: '18 site photos', copy: '17 passed AI compliance review', color: '#6FE7FF' }, { icon: <LocationOn />, title: 'GPS trail secured', copy: '8h 12m of verified movement', color: '#42E8A7' }, { icon: <Mic />, title: '4 voice notes', copy: 'Transcribed and timestamped', color: '#C49BFF' }];
  return <><Eyebrow>EVIDENCE WORKSPACE</Eyebrow><Typography variant="h5" fontWeight={900}>One defensible record of the job</Typography><Typography sx={{ color: '#8398AE', mt: .6, mb: 2.5 }}>Photos, location, time and voice documentation stay connected to the same shift.</Typography>
    <Grid container spacing={1.5}>{cards.map(card => <Grid item xs={12} md={4} key={card.title}><Paper sx={{ p: 2.1, height: '100%', bgcolor: '#10253D', border: '1px solid #294762', borderRadius: 3 }}><Box sx={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 2.3, color: card.color, bgcolor: `${card.color}18` }}>{card.icon}</Box><Typography fontWeight={900} sx={{ mt: 2 }}>{card.title}</Typography><Typography sx={{ color: '#8398AE', fontSize: 12, mt: .6 }}>{card.copy}</Typography></Paper></Grid>)}</Grid>
    <Paper sx={{ mt: 2, p: 2.2, bgcolor: 'rgba(66,232,167,.07)', border: '1px solid rgba(66,232,167,.25)', borderRadius: 3 }}><Stack direction="row" spacing={1.5} alignItems="center"><CheckCircle sx={{ color: '#42E8A7' }} /><Box sx={{ flex: 1 }}><Typography fontWeight={900}>Evidence package ready</Typography><Typography sx={{ color: '#91A6BB', fontSize: 12 }}>Time-entry PDF, GPS playback and media manifest.</Typography></Box><Chip label="VERIFIED" sx={{ color: '#8EF5C8', fontWeight: 900 }} /></Stack></Paper>
  </>;
}

function LucyView() {
  return <><Stack direction="row" spacing={1.5} alignItems="center"><Box sx={{ width: 50, height: 50, display: 'grid', placeItems: 'center', borderRadius: 3, bgcolor: 'rgba(196,155,255,.17)', color: '#E9D8FF' }}><AutoAwesome /></Box><Box><Eyebrow>LUCY AI OPERATIONS ASSISTANT</Eyebrow><Typography variant="h5" fontWeight={900}>A useful next step, not another dashboard</Typography></Box></Stack>
    <Paper sx={{ mt: 2.5, p: 2.4, bgcolor: 'rgba(196,155,255,.09)', border: '1px solid rgba(196,155,255,.25)', borderRadius: 3 }}><Typography sx={{ color: '#E9D8FF', fontWeight: 900 }}>Lucy’s field briefing</Typography><Typography sx={{ color: '#B7A9C9', lineHeight: 1.75, mt: 1 }}>The west entrance photo is missing, two crew members approach overtime at 3:30 PM, and tomorrow’s delivery has no confirmation document.</Typography></Paper>
    <Grid container spacing={1.5} sx={{ mt: .5 }}>{[['Evidence gap','Capture west entrance before clock-out',72],['Overtime risk','Review Crew 3 before 3:30 PM',86],['Schedule check','Attach delivery confirmation',58]].map(([title,copy,value]) => <Grid item xs={12} md={4} key={String(title)}><Paper sx={{ p: 2, bgcolor: '#10253D', border: '1px solid #294762', borderRadius: 3 }}><Typography fontWeight={900}>{title}</Typography><Typography sx={{ color: '#8398AE', minHeight: 38, fontSize: 11, mt: .5 }}>{copy}</Typography><LinearProgress variant="determinate" value={Number(value)} sx={{ mt: 1.5, height: 5, borderRadius: 5, bgcolor: '#1A334C', '& .MuiLinearProgress-bar': { bgcolor: '#C49BFF' } }} /></Paper></Grid>)}</Grid>
  </>;
}

function Eyebrow({ children }: { children: React.ReactNode }) { return <Typography sx={{ color: '#6FE7FF', fontSize: 9, letterSpacing: 1.3, fontWeight: 900, mb: .6 }}>{children}</Typography>; }
function StatusPill({ text }: { text: string }) { return <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1, bgcolor: 'rgba(66,232,167,.09)', borderRadius: 2.5, height: 'fit-content' }}><Box sx={dot('#42E8A7')} /><Typography sx={{ color: '#8EF5C8', fontSize: 11, fontWeight: 900 }}>{text}</Typography></Stack>; }
function Metric({ value, label, color }: { value: string; label: string; color: string }) { return <Paper sx={{ p: 1.8, bgcolor: '#10253D', border: '1px solid #294762', borderRadius: 3 }}><Typography sx={{ color, fontWeight: 950, fontSize: 24 }}>{value}</Typography><Typography sx={{ color: '#8196AC', fontSize: 10 }}>{label}</Typography></Paper>; }
const dot = (color: string) => ({ width: 9, height: 9, borderRadius: '50%', bgcolor: color });
const panelSx = { mt: 2, p: 2.3, bgcolor: '#10253D', border: '1px solid #294762', borderRadius: 3 };
