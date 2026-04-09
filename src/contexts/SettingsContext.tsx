import React, { createContext, useContext, useState, useEffect } from 'react';

export type Theme = 'light' | 'dark' | 'colorful';
export type AIModel = 
  | 'gemini-3-flash-preview' 
  | 'gemini-3.1-pro-preview' 
  | 'gemini-3.1-flash-lite-preview'
  | 'claude-3-5-sonnet-latest';

export interface AppSettings {
  theme: Theme;
  aiModel: AIModel;
  timedDuration: number;
  apiKeys: {
    gemini: string;
    anthropic: string;
  };
}

const defaultSettings: AppSettings = {
  theme: 'light',
  aiModel: 'gemini-3-flash-preview',
  timedDuration: 120,
  apiKeys: {
    gemini: '',
    anthropic: '',
  }
};

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (isOpen: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('appSettings');
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('appSettings', JSON.stringify(settings));
    
    // Apply theme classes to body
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-colorful');
    document.body.classList.add(`theme-${settings.theme}`);

    // Apply Tailwind dark mode
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings]);

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, isSettingsOpen, setIsSettingsOpen }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within SettingsProvider');
  return context;
};
