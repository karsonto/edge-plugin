import { AIConfig } from './AIConfig';
import { QuickActionsConfig } from './QuickActionsConfig';
import { PreferencesConfig } from './PreferencesConfig';
import { useSettings } from '@/sidepanel/hooks';

export function SettingsPanel() {
  const {
    ai,
    quickActions,
    ui,
    behavior,
    privacy,
    saveSettings,
    updateQuickAction,
    addQuickAction,
    removeQuickAction,
  } = useSettings();

  return (
    <div className="h-full overflow-y-auto p-5 space-y-8 scrollbar-thin">
      <AIConfig
        config={ai}
        onChange={(updates) => saveSettings({ ai: { ...ai, ...updates } })}
      />

      <div className="border-t border-gray-200" />

      <QuickActionsConfig
        actions={quickActions}
        onUpdate={updateQuickAction}
        onAdd={addQuickAction}
        onRemove={removeQuickAction}
      />

      <div className="border-t border-gray-200" />

      <PreferencesConfig
        ui={ui}
        behavior={behavior}
        privacy={privacy}
        onUIChange={(updates) => saveSettings({ ui: { ...ui, ...updates } })}
        onBehaviorChange={(updates) => saveSettings({ behavior: { ...behavior, ...updates } })}
        onPrivacyChange={(updates) => saveSettings({ privacy: { ...privacy, ...updates } })}
      />
    </div>
  );
}
