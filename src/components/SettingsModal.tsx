import React, { useState } from 'react';
import { useSettings, Theme, AIModel } from '../contexts/SettingsContext';
import { testAI } from '../services/geminiService';
import { playSound } from '../utils/sound';
import { 
  CartoonX, 
  CartoonGear, 
  CartoonStar, 
  CartoonAlert, 
  CartoonCheck,
  CartoonRocket,
  CartoonRefresh
} from './CartoonIcons';

const SettingsModal: React.FC = () => {
  const { settings, updateSettings, isSettingsOpen, setIsSettingsOpen } = useSettings();
  const [testStatus, setTestStatus] = useState<{ loading: boolean, result: string | null, success: boolean }>({
    loading: false,
    result: null,
    success: false
  });

  const handleTestAI = async () => {
    playSound('click');
    setTestStatus({ loading: true, result: null, success: false });
    const res = await testAI(settings.aiModel);
    setTestStatus({ loading: false, result: res.message, success: res.success });
    
    // Clear status after 3 seconds
    setTimeout(() => {
      setTestStatus(prev => ({ ...prev, result: null }));
    }, 3000);
  };

  if (!isSettingsOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="vintage-panel w-full max-w-md p-10 relative max-h-[90vh] overflow-y-auto custom-scrollbar rounded-[3rem] border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0px_var(--color-ink-black)] bg-[var(--color-bg-cream)]">
        <button 
          onClick={() => {
            playSound('click');
            setIsSettingsOpen(false);
          }}
          className="absolute top-6 left-6 w-14 h-14 bg-[var(--color-primary-red)] text-white rounded-2xl flex items-center justify-center hover:scale-110 transition-transform border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)] active:translate-y-1 active:shadow-none"
        >
          <CartoonX size={32} />
        </button>
        
        <h2 className="text-4xl font-display text-[var(--color-ink-black)] mb-10 flex items-center gap-4">
          <CartoonGear size={48} className="animate-spin-slow" />
          <span>الإعدادات</span>
        </h2>

        <div className="space-y-10 bg-[var(--color-off-white)] p-8 rounded-[2.5rem] border-4 border-[var(--color-ink-black)] shadow-[inner_4px_4px_0px_rgba(0,0,0,0.1)]">
          {/* Theme Selection */}
          <div className="space-y-4">
            <label className="text-xl font-display text-[var(--color-bg-dark)] bg-[var(--color-primary-gold)] px-4 py-1 rounded-xl border-2 border-[var(--color-ink-black)] inline-block shadow-[2px_2px_0px_var(--color-ink-black)]">مظهر التطبيق</label>
            <div className="grid grid-cols-3 gap-4">
              {(['light', 'dark', 'colorful'] as Theme[]).map(t => (
                <button
                  key={t}
                  onClick={() => {
                    playSound('click');
                    updateSettings({ theme: t });
                  }}
                  className={`py-4 rounded-2xl font-display text-xl border-4 transition-all shadow-[4px_4px_0px_var(--color-ink-black)] active:translate-y-1 active:shadow-none ${
                    settings.theme === t 
                      ? 'bg-[var(--color-primary-gold)] text-[var(--color-ink-black)] border-[var(--color-ink-black)] scale-105' 
                      : 'bg-[var(--color-bg-cream)] text-[var(--color-bg-dark)] border-[var(--color-ink-black)] hover:bg-[var(--color-primary-gold)]/20'
                  }`}
                >
                  {t === 'light' ? 'فاتح' : t === 'dark' ? 'داكن' : 'ملون'}
                </button>
              ))}
            </div>
          </div>

          {/* AI Model Selection */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-xl font-display text-[var(--color-bg-dark)] bg-[var(--color-primary-gold)] px-4 py-1 rounded-xl border-2 border-[var(--color-ink-black)] inline-block shadow-[2px_2px_0px_var(--color-ink-black)]">محرك الذكاء الاصطناعي</label>
              <button 
                onClick={handleTestAI}
                disabled={testStatus.loading}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-xl border-2 border-[var(--color-ink-black)] text-sm font-bold transition-all shadow-[2px_2px_0px_var(--color-ink-black)] active:translate-y-0.5 active:shadow-none ${
                  testStatus.loading ? 'opacity-50 cursor-not-allowed' : 
                  testStatus.result ? (testStatus.success ? 'bg-green-500 text-white' : 'bg-red-500 text-white') :
                  'bg-[var(--color-bg-cream)] hover:bg-[var(--color-primary-gold)]'
                }`}
              >
                {testStatus.loading ? <CartoonRefresh size={16} className="animate-spin" /> : <CartoonRocket size={16} />}
                <span>{testStatus.result || 'اختبار الاتصال'}</span>
              </button>
            </div>
            <div className="flex flex-col gap-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              <div className="text-sm font-display text-[var(--color-bg-dark)] mt-2 mb-1 px-2">Google Gemini</div>
              {(['gemini-3-flash-preview', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite-preview'] as AIModel[]).map(m => (
                <button
                  key={m}
                  onClick={() => {
                    playSound('click');
                    updateSettings({ aiModel: m });
                  }}
                  className={`py-3 px-5 rounded-xl font-display text-lg border-4 transition-all text-right flex justify-between items-center shadow-[2px_2px_0px_var(--color-ink-black)] active:translate-y-0.5 active:shadow-none ${
                    settings.aiModel === m 
                      ? 'bg-[var(--color-primary-blue)] text-white border-[var(--color-ink-black)]' 
                      : 'bg-[var(--color-bg-cream)] text-[var(--color-bg-dark)] border-[var(--color-ink-black)] hover:bg-[var(--color-primary-blue)]/10'
                  }`}
                >
                  <span dir="ltr" className="text-base">{m}</span>
                  {settings.aiModel === m && <CartoonCheck size={24} />}
                </button>
              ))}

              <div className="text-sm font-display text-[var(--color-bg-dark)] mt-4 mb-1 px-2">Anthropic</div>
              {(['claude-3-5-sonnet-latest'] as AIModel[]).map(m => (
                <button
                  key={m}
                  onClick={() => {
                    playSound('click');
                    updateSettings({ aiModel: m });
                  }}
                  className={`py-3 px-5 rounded-xl font-display text-lg border-4 transition-all text-right flex justify-between items-center shadow-[2px_2px_0px_var(--color-ink-black)] active:translate-y-0.5 active:shadow-none ${
                    settings.aiModel === m 
                      ? 'bg-[var(--color-primary-blue)] text-white border-[var(--color-ink-black)]' 
                      : 'bg-[var(--color-bg-cream)] text-[var(--color-bg-dark)] border-[var(--color-ink-black)] hover:bg-[var(--color-primary-blue)]/10'
                  }`}
                >
                  <span dir="ltr" className="text-base">{m}</span>
                  {settings.aiModel === m && <CartoonCheck size={24} />}
                </button>
              ))}
            </div>
          </div>

          {/* API Keys */}
          <div className="space-y-4">
            <label className="text-xl font-display text-[var(--color-bg-dark)] bg-[var(--color-primary-gold)] px-4 py-1 rounded-xl border-2 border-[var(--color-ink-black)] inline-block shadow-[2px_2px_0px_var(--color-ink-black)]">مفاتيح API</label>
            <div className="space-y-6">
              <div>
                <label className="text-sm font-display text-[var(--color-bg-dark)] block mb-2 px-2">Gemini API Key</label>
                <input 
                  type="password" 
                  value={settings.apiKeys?.gemini || ''}
                  onChange={(e) => updateSettings({ apiKeys: { ...settings.apiKeys, gemini: e.target.value } })}
                  className="w-full bg-[var(--color-bg-cream)] border-4 border-[var(--color-ink-black)] rounded-2xl p-4 font-display text-xl shadow-[4px_4px_0px_var(--color-ink-black)] focus:outline-none"
                  placeholder="AIzaSy..."
                  dir="ltr"
                />
              </div>
              <div>
                <label className="text-sm font-display text-[var(--color-bg-dark)] block mb-2 px-2">Anthropic API Key</label>
                <input 
                  type="password" 
                  value={settings.apiKeys?.anthropic || ''}
                  onChange={(e) => updateSettings({ apiKeys: { ...settings.apiKeys, anthropic: e.target.value } })}
                  className="w-full bg-[var(--color-bg-cream)] border-4 border-[var(--color-ink-black)] rounded-2xl p-4 font-display text-xl shadow-[4px_4px_0px_var(--color-ink-black)] focus:outline-none"
                  placeholder="sk-ant-..."
                  dir="ltr"
                />
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-[var(--color-primary-gold)]/10 rounded-2xl border-2 border-[var(--color-primary-gold)]">
              <CartoonAlert size={24} className="text-[var(--color-primary-gold)] shrink-0" />
              <p className="text-sm font-display text-[var(--color-bg-dark)]">
                يتم حفظ مفاتيح API محلياً في متصفحك فقط لضمان الخصوصية.
              </p>
            </div>
          </div>

          {/* Timed Mode Duration */}
          <div className="space-y-4">
            <label className="text-xl font-display text-[var(--color-bg-dark)] bg-[var(--color-primary-gold)] px-4 py-1 rounded-xl border-2 border-[var(--color-ink-black)] inline-block shadow-[2px_2px_0px_var(--color-ink-black)]">مدة "تحدي الوقت" (ثانية)</label>
            <div className="relative">
              <input 
                type="number" 
                min="30" 
                max="300" 
                step="10"
                value={settings.timedDuration}
                onChange={(e) => updateSettings({ timedDuration: parseInt(e.target.value) || 120 })}
                className="w-full bg-[var(--color-bg-cream)] border-4 border-[var(--color-ink-black)] rounded-2xl p-5 font-display text-3xl shadow-[4px_4px_0px_var(--color-ink-black)] focus:outline-none"
              />
              <CartoonRocket size={32} className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--color-primary-red)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
