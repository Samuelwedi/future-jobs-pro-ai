import React, {
  createContext,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  CssBaseline,
  ThemeProvider,
} from '@mui/material';
import { createFutureJobsTheme } from '../theme';

export type ThemeMode = 'dark' | 'light';

interface ThemeModeContextValue {
  mode: ThemeMode;
  toggle: () => void;
}

const ThemeModeContext =
  createContext<ThemeModeContextValue>({
    mode: 'dark',
    toggle: () => {
      // Default function used only outside the provider.
    },
  });

export function AppThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    return localStorage.getItem('futureJobsTheme') === 'light'
      ? 'light'
      : 'dark';
  });

  const contextValue =
    useMemo<ThemeModeContextValue>(
      () => ({
        mode,
        toggle: (): void => {
          setMode((currentMode) => {
            const nextMode: ThemeMode =
              currentMode === 'dark'
                ? 'light'
                : 'dark';

            localStorage.setItem(
              'futureJobsTheme',
              nextMode,
            );

            return nextMode;
          });
        },
      }),
      [mode],
    );

  const theme = useMemo(
    () => createFutureJobsTheme(mode),
    [mode],
  );

  return (
    <ThemeModeContext.Provider
      value={contextValue}
    >
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useAppTheme(): ThemeModeContextValue {
  return useContext(ThemeModeContext);
}