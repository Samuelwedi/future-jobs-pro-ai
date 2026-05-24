// ============================================
// LANGUAGE CONTEXT (en, es, fr)
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t, Lang } from '../services/i18n';

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
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    AsyncStorage.getItem('language').then((saved) => {
      if (saved === 'en' || saved === 'es' || saved === 'fr') setLangState(saved);
    });
  }, []);

  const setLang = async (newLang: Lang) => {
    await AsyncStorage.setItem('language', newLang);
    setLangState(newLang);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: (key, vars) => t(key, lang, vars) }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLang = () => useContext(LanguageContext);