import React, { useState, useEffect } from 'react';
import {
  Box, Container, Typography, Grid, Card, CardContent, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Chip, CircularProgress, Alert,
} from '@mui/material';
import { PictureAsPdf, Download, Description, Assessment } from '@mui/icons-material';

export default function Reports() {
  const [photos, setPhotos] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [reportUrl, setReportUrl] = useState('');

  useEffect(() => {
    // Fetch photos for the demo project
    fetchPhotos();
  }, []);

  const fetchPhotos = async () => {
    try {
      // In production, use your actual API
      const res = await fetch('/api/photos/project/65aba618-d0e8-424d-a7da-bb9b5cb06df3');
      const data = await res.json();
      setPhotos(data.photos || []);
    } catch (e) {
      console.error('Failed to load photos:', e);
    }
  };

  const togglePhoto = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const generateReport = async () => {
    if (selectedIds.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/photos/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoIds: selectedIds,
          reportTitle: 'Job Evidence Report',
        }),
      });
      const data = await res.json();
      setReportUrl(data.reportUrl || '');
    } catch (e) {
      console.error('Report generation failed:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ bgcolor: '#0A0A0A', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>
          📄 Reports
        </Typography>
        <Typography variant="body1" sx={{ color: '#888', mb: 4 }}>
          Generate evidence reports, timesheets, and payroll summaries.
        </Typography>

        {/* Quick Actions */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {[
            { icon: <PictureAsPdf sx={{ fontSize: 40 }} />, title: 'Evidence Report', desc: 'Generate a tamper‑proof PDF with photos, GPS trails, and voice notes for any project.', action: 'Select Photos Below' },
            { icon: <Assessment sx={{ fontSize: 40 }} />, title: 'Timesheet Export', desc: 'Export weekly timesheets as PDF or CSV for payroll processing.', action: 'Coming Soon' },
            { icon: <Description sx={{ fontSize: 40 }} />, title: 'Dispute Evidence', desc: 'One‑click dispute package with all supporting documentation.', action: 'Select Photos Below' },
          ].map((card, i) => (
            <Grid item xs={12} md={4} key={i}>
              <Card sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', height: '100%' }}>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ color: '#00D4FF', mb: 2 }}>{card.icon}</Box>
                  <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 'bold', mb: 1 }}>{card.title}</Typography>
                  <Typography variant="body2" sx={{ color: '#AAA', lineHeight: 1.6, mb: 2 }}>{card.desc}</Typography>
                  <Chip label={card.action} size="small" sx={{ bgcolor: '#00D4FF20', color: '#00D4FF' }} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Photo Selection Table */}
        <Paper sx={{ bgcolor: '#1A1A1A', borderRadius: 3, border: '1px solid #333', overflow: 'hidden' }}>
          <Box sx={{ p: 3, borderBottom: '1px solid #333' }}>
            <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 'bold' }}>
              Select Photos for Evidence Report
            </Typography>
            <Typography variant="body2" sx={{ color: '#888', mt: 1 }}>
              {selectedIds.length} photo{selectedIds.length !== 1 ? 's' : ''} selected
            </Typography>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: '#888' }}>Select</TableCell>
                  <TableCell sx={{ color: '#888' }}>Photo</TableCell>
                  <TableCell sx={{ color: '#888' }}>Date Taken</TableCell>
                  <TableCell sx={{ color: '#888' }}>Compliance Score</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {photos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ color: '#888', textAlign: 'center', py: 4 }}>
                      No photos found. Take some photos first!
                    </TableCell>
                  </TableRow>
                ) : (
                  photos.map((photo: any) => (
                    <TableRow key={photo.id} hover>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(photo.id)}
                          onChange={() => togglePhoto(photo.id)}
                          style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#00D4FF' }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Box
                            component="img"
                            src={photo.s3_key}
                            alt="Job photo"
                            sx={{ width: 60, height: 60, borderRadius: 2, objectFit: 'cover', bgcolor: '#0A0A0A' }}
                          />
                          <Typography variant="body2" sx={{ color: '#FFF' }}>
                            {photo.taken_by || 'Field Worker'}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: '#CCC' }}>
                        {photo.taken_at ? new Date(photo.taken_at).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={`${photo.compliance_score || 0}/100`}
                          size="small"
                          sx={{
                            bgcolor: (photo.compliance_score || 0) >= 70 ? '#4CAF5020' : '#F4433620',
                            color: (photo.compliance_score || 0) >= 70 ? '#4CAF50' : '#F44336',
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ p: 3, borderTop: '1px solid #333', display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              onClick={generateReport}
              disabled={selectedIds.length === 0 || loading}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Download />}
              sx={{ bgcolor: '#00D4FF', color: '#0A0A0A', px: 4, py: 1.5, fontWeight: 'bold' }}
            >
              {loading ? 'Generating...' : 'Generate PDF Report'}
            </Button>
          </Box>
        </Paper>

        {reportUrl && (
          <Alert severity="success" sx={{ mt: 3, bgcolor: '#4CAF5020', color: '#4CAF50' }}>
            Report generated successfully!{' '}
            <a href={reportUrl} target="_blank" rel="noreferrer" style={{ color: '#00D4FF' }}>
              Open PDF
            </a>
          </Alert>
        )}
      </Container>
    </Box>
  );
}