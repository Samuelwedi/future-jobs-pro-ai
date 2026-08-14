import { alpha, createTheme } from '@mui/material/styles';

const cyan = '#00D4FF';
const white = '#FFFFFF';
const muted = '#B8C4D4';
const panel = '#10161E';
const field = '#0B1118';
const border = '#344357';

export const createFutureJobsTheme = (mode: 'dark' | 'light' = 'dark') => createTheme({
  palette: {
    mode,
    primary: { main: cyan, contrastText: '#041014' },
    secondary: { main: '#8B5CF6' },
    background: mode === 'dark' ? { default: '#070B10', paper: panel } : { default: '#F4F7FA', paper: '#FFFFFF' },
    text: mode === 'dark' ? { primary: white, secondary: muted, disabled: '#8292A6' } : { primary: '#172033', secondary: '#526174', disabled: '#8A96A6' },
    divider: '#2A3543',
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { colorScheme: mode, backgroundColor: mode === 'dark' ? '#070B10' : '#F4F7FA' },
        body: { color: mode === 'dark' ? white : '#172033', backgroundColor: mode === 'dark' ? '#070B10' : '#F4F7FA' },
        '#root': { minHeight: '100vh', color: white },
        'a': { color: cyan },
        'input, textarea, select, option': { color: white },
        'input::placeholder, textarea::placeholder': { color: '#A8B4C4', opacity: 1 },
        'input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus': {
          WebkitTextFillColor: `${white} !important`,
          WebkitBoxShadow: `0 0 0 1000px ${field} inset !important`,
          caretColor: white,
        },
        '.surface-light, [data-surface="light"]': {
          color: '#111827 !important',
          backgroundColor: '#FFFFFF !important',
        },
        '.surface-light input, .surface-light textarea, .surface-light select, [data-surface="light"] input, [data-surface="light"] textarea, [data-surface="light"] select': {
          color: '#111827 !important',
        },
      },
    },
    MuiTypography: {
      styleOverrides: { root: { color: 'inherit' } },
    },
    MuiFormLabel: {
      styleOverrides: {
        root: {
          color: '#EAF0F7',
          '&.Mui-focused': { color: cyan },
          '&.Mui-disabled': { color: '#8292A6' },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: '#EAF0F7',
          '&.Mui-focused': { color: cyan },
          '&.Mui-error': { color: '#FF8A80' },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          color: white,
          backgroundColor: field,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: border },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#718096' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: cyan, borderWidth: 2 },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: '#FF8A80' },
          '&.Mui-disabled': { color: '#8292A6', backgroundColor: '#121923' },
          '&.Mui-disabled .MuiOutlinedInput-notchedOutline': { borderColor: '#273342' },
        },
        input: {
          color: white,
          '&::placeholder': { color: '#A8B4C4', opacity: 1 },
        },
      },
    },
    MuiFilledInput: {
      styleOverrides: {
        root: { color: white, backgroundColor: field },
        input: { color: white },
      },
    },
    MuiInput: {
      styleOverrides: {
        root: { color: white },
        input: { color: white },
      },
    },
    MuiSelect: {
      styleOverrides: {
        select: { color: white },
        icon: { color: '#DCE5EF' },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: { color: white, backgroundColor: '#121A24', border: '1px solid #2F3B4B' },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          color: white,
          '&:hover': { backgroundColor: alpha(cyan, 0.1) },
          '&.Mui-selected': { backgroundColor: alpha(cyan, 0.16) },
          '&.Mui-selected:hover': { backgroundColor: alpha(cyan, 0.22) },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { color: white, backgroundColor: panel, backgroundImage: 'none', border: '1px solid #2A3543' },
      },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { color: white } },
    },
    MuiDialogContentText: {
      styleOverrides: { root: { color: muted } },
    },
    MuiPaper: {
      styleOverrides: {
        root: { color: white, backgroundImage: 'none' },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { color: white, borderColor: '#2A3543' },
        head: { color: '#EAF0F7', fontWeight: 700, backgroundColor: '#121A24' },
      },
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: { color: '#A8B4C4', '&.Mui-error': { color: '#FF8A80' } },
      },
    },
    MuiCheckbox: { styleOverrides: { root: { color: '#A8B4C4' } } },
    MuiRadio: { styleOverrides: { root: { color: '#A8B4C4' } } },
    MuiIconButton: { styleOverrides: { root: { color: '#EAF0F7' } } },
    MuiTooltip: {
      styleOverrides: { tooltip: { color: white, backgroundColor: '#111827', border: '1px solid #334155' } },
    },
    MuiButton: {
      styleOverrides: {
        root: { fontWeight: 700 },
        text: { color: cyan },
        outlined: { color: white, borderColor: '#526174' },
        contained: { '&.Mui-disabled': { color: '#8292A6', backgroundColor: '#273342' } },
      },
    },
  },
});

const theme = createFutureJobsTheme('dark');
export default theme;
