import { Palette, Type, ToggleLeft, Shield } from 'lucide-react';
import type { UIPreferences, BehaviorSettings, PrivacySettings } from '@/shared/types';

interface PreferencesConfigProps {
  ui: UIPreferences;
  behavior: BehaviorSettings;
  privacy: PrivacySettings;
  onUIChange: (ui: Partial<UIPreferences>) => void;
  onBehaviorChange: (behavior: Partial<BehaviorSettings>) => void;
  onPrivacyChange: (privacy: Partial<PrivacySettings>) => void;
}

export function PreferencesConfig({
  ui,
  behavior,
  privacy,
  onUIChange,
  onBehaviorChange,
  onPrivacyChange,
}: PreferencesConfigProps) {
  return (
    <div className="space-y-6">
      {/* UI Preferences */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Palette size={16} />
          界面设置
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1.5">主题</label>
            <select
              value={ui.theme}
              onChange={(e) => onUIChange({ theme: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary"
            >
              <option value="light">浅色</option>
              <option value="dark">深色</option>
              <option value="auto">跟随系统</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1.5 flex items-center gap-1">
              <Type size={14} />
              字体大小
            </label>
            <select
              value={ui.fontSize}
              onChange={(e) => onUIChange({ fontSize: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary"
            >
              <option value="small">小</option>
              <option value="medium">中</option>
              <option value="large">大</option>
            </select>
          </div>
        </div>
      </div>

      {/* Behavior Settings */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ToggleLeft size={16} />
          行为设置
        </h3>
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={behavior.autoCapture}
              onChange={(e) => onBehaviorChange({ autoCapture: e.target.checked })}
              className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
            />
            <span className="text-sm text-gray-700">自动捕获页面内容</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={behavior.showFloatingButton}
              onChange={(e) => onBehaviorChange({ showFloatingButton: e.target.checked })}
              className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
            />
            <span className="text-sm text-gray-700">显示悬浮按钮</span>
          </label>
        </div>
      </div>

      {/* Privacy Settings */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Shield size={16} />
          隐私设置
        </h3>
        <div>
          <label className="block text-sm text-gray-600 mb-1.5">
            排除域名（不捕获内容）
          </label>
          <textarea
            value={privacy.excludeDomains.join('\n')}
            onChange={(e) => {
              const domains = e.target.value
                .split('\n')
                .map(d => d.trim())
                .filter(Boolean);
              onPrivacyChange({ excludeDomains: domains });
            }}
            rows={3}
            placeholder="example.com&#10;bank.com"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary resize-none"
          />
          <p className="text-xs text-gray-400 mt-1">
            每行一个域名
          </p>
        </div>
      </div>
    </div>
  );
}
