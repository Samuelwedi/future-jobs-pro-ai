import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  Container,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Gavel } from "@mui/icons-material";
import { API_BASE } from "../services/api";
import EvidencePackageDialog from "../components/EvidencePackageDialog";
export default function EvidenceCenter() {
  const [entries, setEntries] = useState<any[]>([]),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [offset, setOffset] = useState(0),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setEntries([]);
    setSelected("");
    setError("");
    fetch(`${API_BASE}/api/evidence-bundles/recent?limit=25&offset=${offset}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.message);
        if (!controller.signal.aborted) setEntries(d.entries || []);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [offset]);
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Typography variant="overline" color="primary">
        STORED JOB RECORDS
      </Typography>
      <Typography variant="h3" fontWeight={900}>
        <Gavel sx={{ mr: 1 }} />
        Evidence Center
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Select stored videos, photos, voice notes and documents for an evidence
        package. Every package includes the time record and raw GPS metadata.
        Integrity hashes do not independently prove camera, location or event
        authenticity.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Paper variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Employee / project</TableCell>
              <TableCell>Time entry</TableCell>
              <TableCell>Available evidence</TableCell>
              <TableCell align="right">Package</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <b>{e.employee_name}</b>
                  <br />
                  <small>{e.project_name || "No project"}</small>
                </TableCell>
                <TableCell>
                  {new Date(e.clock_in).toLocaleString()}
                  <br />
                  <small>
                    {e.clock_out
                      ? new Date(e.clock_out).toLocaleString()
                      : "In progress"}
                  </small>
                </TableCell>
                <TableCell>
                  <Stack direction="row" gap={1}>
                    <Chip size="small" label={`${e.gps_count} GPS`} />
                    <Chip size="small" label={`${e.media_count} media`} />
                    <Chip size="small" label={`${e.voice_count} voice`} />
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  <Button
                    disabled={loading}
                    variant="contained"
                    onClick={() => setSelected(e.id)}
                  >
                    Select & download
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
      <Stack direction="row" gap={2}>
        <Button
          disabled={loading || offset === 0}
          onClick={() => setOffset((n) => Math.max(0, n - 25))}
        >
          Previous
        </Button>
        <Button
          disabled={loading || entries.length < 25 || offset >= 100000}
          onClick={() => setOffset((n) => n + 25)}
        >
          Next
        </Button>
      </Stack>
      {selected && (
        <EvidencePackageDialog
          key={selected}
          timeEntryId={selected}
          onClose={() => setSelected("")}
        />
      )}
    </Container>
  );
}
