import React, {useId, useState} from 'react';
import {Box, Button, Paper, Stack, Typography} from '@mui/material';
import {ExpandLess, ExpandMore} from '@mui/icons-material';
import {readLucyEvidence, type LucyEvidence} from '../utils/lucyEvidence';

export default function LucySourceEvidence({evidence}: {evidence?: LucyEvidence | null}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const result = readLucyEvidence(evidence);
  if (!result || (!result.sources.length && !result.incomplete)) return null;

  return <Paper variant="outlined" sx={{mt: 1, p: 1, bgcolor: '#0D1B27', color: '#CBD5E1', borderColor: '#21445A'}}>
    <Typography component="h3" variant="subtitle2">
      <Button fullWidth onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-controls={`${id}-sources`} id={`${id}-toggle`} endIcon={expanded ? <ExpandLess/> : <ExpandMore/>} sx={{justifyContent: 'space-between', minHeight: 44, color: '#67E8F9', textTransform: 'none'}}>
        Sources ({result.sources.length})
      </Button>
    </Typography>
    {result.incomplete && <Typography variant="body2" sx={{px: 1, pb: 1, color: '#FDE68A'}}>Source evidence is incomplete. Some records may be missing.</Typography>}
    <Box id={`${id}-sources`} role="region" aria-labelledby={`${id}-toggle`} hidden={!expanded}>
      {expanded && <Box sx={{px: 1, pb: 1}}>
        <Typography variant="caption">Records retrieved for this result.</Typography>
        <Stack component="ul" spacing={1.5} sx={{m: 0, mt: 1, pl: 2.5}}>
          {result.sources.map((source, index) => <Box component="li" key={`${source.kind}-${source.id}-${index}`} sx={{overflowWrap: 'anywhere'}}>
            <Typography variant="body2" sx={{fontWeight: 700}}>{source.title}</Typography>
            <Typography variant="caption" component="p" sx={{m: 0}}>{source.kind} · ID: {source.id}</Typography>
            <Typography variant="body2" sx={{my: 0.5, whiteSpace: 'pre-wrap'}}>{source.excerpt}</Typography>
            {source.date && <Typography variant="caption" component="p" sx={{m: 0}}>Record date: {source.date}</Typography>}
            <Typography variant="caption" component="p" sx={{m: 0}}>Retrieved: {new Date(source.retrievedAt).toLocaleString(undefined, {timeZoneName: 'short'})}</Typography>
          </Box>)}
        </Stack>
      </Box>}
    </Box>
  </Paper>;
}
