import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import translations from './translations';
import type { Lang } from './translations';

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: any;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  t: translations['en'],
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem('app_lang');
    return (stored === 'tr' || stored === 'en') ? stored : 'en';
  });

  const setLang = (newLang: Lang) => {
    localStorage.setItem('app_lang', newLang);
    setLangState(newLang);
  };

  const t = translations[lang];

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
