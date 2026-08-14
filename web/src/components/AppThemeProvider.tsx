import React,{createContext,useContext,useMemo,useState} from 'react';
import {CssBaseline,ThemeProvider} from '@mui/material';
import {createFutureJobsTheme} from '../theme';
type Mode='dark'|'light';
const ThemeModeContext=createContext({mode:'dark' as Mode,toggle:()=>undefined});
export function AppThemeProvider({children}:{children:React.ReactNode}){const [mode,setMode]=useState<Mode>(()=>localStorage.getItem('futureJobsTheme')==='light'?'light':'dark');const value=useMemo(()=>({mode,toggle:()=>setMode(current=>{const next=current==='dark'?'light':'dark';localStorage.setItem('futureJobsTheme',next);return next;})}),[mode]);return <ThemeModeContext.Provider value={value}><ThemeProvider theme={createFutureJobsTheme(mode)}><CssBaseline/>{children}</ThemeProvider></ThemeModeContext.Provider>}
export const useAppTheme=()=>useContext(ThemeModeContext);
