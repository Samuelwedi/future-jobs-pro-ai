import {getLocales} from 'expo-localization';
// ============================================
// LANGUAGE CONTEXT (en, es, fr)
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t, Lang, deviceLanguage } from '../services/i18n';

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => Promise<void>;
  t: (key: string, vars?: Record<string, string>) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'en',
  setLang: async () => {},
  t: (key) => key,
});

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    try { return deviceLanguage(getLocales()[0]?.languageTag); }
    catch { return 'en'; }
  });
  const selected = useRef(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem('language').then((saved) => {
      if (mounted && !selected.current && (saved === 'en' || saved === 'es' || saved === 'fr')) setLangState(saved);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const setLang = async (newLang: Lang) => {
    selected.current = true;
    await AsyncStorage.setItem('language', newLang);
    setLangState(newLang);
  };

  const translate = useCallback((key: string, vars?: Record<string, string>) => t(key, lang, vars), [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: translate }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLang = () => useContext(LanguageContext);

