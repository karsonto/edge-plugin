import { Bot, Key, Sliders } from 'lucide-react';
import type { AIConfig as AIConfigType } from '@/shared/types';
import { MODEL_OPTIONS } from '@/shared/constants';

interface AIConfigProps {
  config: AIConfigType;
  onChange: (config: Partial<AIConfigType>) => void;
}

export function AIConfig({ config, onChange }: AIConfigProps) {
  const modelOptions = MODEL_OPTIONS[config.provider] || [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Bot size={16} />
          AI 配置
        </h3>
        
        <div className="space-y-4">
          {/* AI Provider */}
          <div>
            <label className="block text-sm text-gray-600 mb-1.5">
              AI 提供商
            </label>
            <select
              value={config.provider}
              onChange={(e) => {
                const nextProvider = e.target.value as any;
                const nextOptions = MODEL_OPTIONS[nextProvider] || [];
                const modelExistsInNextProvider = nextOptions.some(o => o.value === config.model);

                onChange({
                  provider: nextProvider,
                  // 避免切换 provider 后 model 不在选项里导致 select 显示空白
                  ...(nextProvider !== 'custom' && !modelExistsInNextProvider
                    ? { model: nextOptions[0]?.value || config.model }
                    : {}),
                });
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="gemini">Google (Gemini)</option>
              <option value="custom">自定义</option>
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm text-gray-600 mb-1.5 flex items-center gap-1">
              <Key size={14} />
              API Key
            </label>
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => onChange({ apiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary"
            />
            <p className="text-xs text-gray-400 mt-1">
              您的 API Key 将安全存储在本地
            </p>
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm text-gray-600 mb-1.5">
              模型选择
            </label>
            {config.provider === 'custom' ? (
              <>
                <input
                  type="text"
                  value={config.model || ''}
                  onChange={(e) => onChange({ model: e.target.value })}
                  placeholder="输入模型名（例如：qwen3）"
                  list="custom-model-options"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary"
                />
                <datalist id="custom-model-options">
                  {modelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </datalist>
                <p className="text-xs text-gray-400 mt-1">
                  可直接填写任意模型名（会原样传给后端请求体的 model 字段）
                </p>
              </>
            ) : (
              <select
                value={config.model}
                onChange={(e) => onChange({ model: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary"
              >
                {modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Custom Endpoint */}
          {config.provider === 'custom' && (
            <div>
              <label className="block text-sm text-gray-600 mb-1.5">
                自定义端点
              </label>
              <input
                type="text"
                value={config.customEndpoint || ''}
                onChange={(e) => onChange({ customEndpoint: e.target.value })}
                placeholder="http://localhost:8080/v1/chat/completions"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary"
              />
              <p className="text-xs text-gray-400 mt-1">
                输入自定义 API 端点地址
              </p>
            </div>
          )}

          {/* Advanced Settings */}
          <details className="group">
            <summary className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-900">
              <Sliders size={14} />
              高级设置
            </summary>
            <div className="mt-3 space-y-3 pl-5">
              <div>
                <label className="block text-sm text-gray-600 mb-1.5">
                  Temperature (0-1)
                </label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={config.temperature}
                  onChange={(e) => onChange({ temperature: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1.5">
                  Max Tokens
                </label>
                <input
                  type="number"
                  min="100"
                  max="4000"
                  step="100"
                  value={config.maxTokens}
                  onChange={(e) => onChange({ maxTokens: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1.5">
                  Top P (0-1)
                </label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={config.topP || 0.8}
                  onChange={(e) => onChange({ topP: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1.5">
                  Repetition Penalty (1.0-2.0)
                </label>
                <input
                  type="number"
                  min="1"
                  max="2"
                  step="0.05"
                  value={config.repetitionPenalty || 1.05}
                  onChange={(e) => onChange({ repetitionPenalty: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
