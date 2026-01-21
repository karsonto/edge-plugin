import { create } from 'zustand';
import type { AppConfig, QuickAction } from '@/shared/types';
import { DEFAULT_CONFIG } from '@/shared/constants';
import { sendToBackground, createMessage } from '@/shared/utils';

interface SettingsStore extends AppConfig {
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  saveSettings: (config: Partial<AppConfig>) => Promise<void>;
  updateQuickAction: (id: string, updates: Partial<QuickAction>) => void;
  addQuickAction: (action: QuickAction) => void;
  removeQuickAction: (id: string) => void;
  setApiKey: (apiKey: string) => void;
  setModel: (model: string) => void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULT_CONFIG,
  isLoaded: false,

  loadSettings: async () => {
    try {
      const response = await sendToBackground(
        createMessage('LOAD_SETTINGS')
      );
      
      if (response?.payload) {
        set({
          ...response.payload,
          isLoaded: true,
        });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ isLoaded: true });
    }
  },

  saveSettings: async (config: Partial<AppConfig>) => {
    const currentState = get();
    const newConfig = {
      ai: { ...currentState.ai, ...config.ai },
      quickActions: config.quickActions || currentState.quickActions,
      ui: { ...currentState.ui, ...config.ui },
      behavior: { ...currentState.behavior, ...config.behavior },
      privacy: { ...currentState.privacy, ...config.privacy },
    };

    set(newConfig);

    try {
      await sendToBackground(
        createMessage('SAVE_SETTINGS', newConfig)
      );
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  },

  updateQuickAction: (id: string, updates: Partial<QuickAction>) => {
    const { quickActions, saveSettings } = get();
    const updated = quickActions.map(action =>
      action.id === id ? { ...action, ...updates } : action
    );
    saveSettings({ quickActions: updated });
  },

  addQuickAction: (action: QuickAction) => {
    const { quickActions, saveSettings } = get();
    saveSettings({ quickActions: [...quickActions, action] });
  },

  removeQuickAction: (id: string) => {
    const { quickActions, saveSettings } = get();
    saveSettings({ quickActions: quickActions.filter(a => a.id !== id) });
  },

  setApiKey: (apiKey: string) => {
    const { saveSettings } = get();
    saveSettings({ ai: { ...get().ai, apiKey } });
  },

  setModel: (model: string) => {
    const { saveSettings } = get();
    saveSettings({ ai: { ...get().ai, model } });
  },
}));
