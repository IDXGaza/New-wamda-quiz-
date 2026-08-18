import React from 'react';
import { motion } from 'framer-motion';

interface LoginScreenProps {
  onLogin: () => void;
  isLoading: boolean;
  onSkip?: () => void; // Optional skip button for users who wish to stay offline
  errorMessage?: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, isLoading, onSkip, errorMessage }) => {
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-slate-950 text-white overflow-hidden font-cairo select-none px-6">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[350px] h-[350px] rounded-full bg-teal-500/10 blur-[120px]" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[350px] h-[350px] rounded-full bg-[#4da8ab]/10 blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="max-w-md w-full text-center flex flex-col items-center z-10"
      >
        {/* App Logo / Branding */}
        <div className="mb-8 p-6 bg-slate-900/60 backdrop-blur-md rounded-3xl border border-slate-800/80 shadow-2xl relative">
          <div className="absolute inset-0 bg-gradient-to-tr from-teal-500/20 to-transparent rounded-3xl blur-md opacity-50" />
          <svg
            className="w-20 h-20 text-[#4da8ab] relative z-10 animate-pulse"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
            />
          </svg>
        </div>

        {/* Headings */}
        <h1 id="login_title" className="text-3xl font-bold tracking-tight text-white mb-3">
          ترانيم <span className="text-[#4da8ab]">سحابي</span>
        </h1>
        <p className="text-slate-400 text-sm font-light mb-6 max-w-sm leading-relaxed">
          سجل دخولك مرة واحدة بحساب Google لمزامنة أناشيدك ومفضلاتك وتخزين نسخك الاحتياطية على السحابة بأمان.
        </p>

        {/* Error notification if any */}
        {errorMessage && (
          <div className="w-full mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs text-right leading-relaxed flex items-start gap-2.5">
            <span className="text-base shrink-0">⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Button Stack */}
        <div className="w-full space-y-3">
          <button
            id="google_login_btn"
            onClick={onLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 bg-[#4da8ab] hover:bg-[#3d8c8f] active:scale-[0.98] disabled:opacity-50 text-white font-medium py-4 px-6 rounded-2xl shadow-lg transition-all duration-300"
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
            )}
            <span className="text-base font-semibold">{isLoading ? 'جاري فتح نافذة Google...' : 'تسجيل الدخول بحساب Google'}</span>
          </button>

          {onSkip && (
            <button
              id="skip_login_btn"
              onClick={onSkip}
              disabled={isLoading}
              className="w-full text-slate-400 hover:text-slate-200 font-medium py-3 px-6 rounded-2xl transition-all duration-300 text-xs sm:text-sm border border-slate-800/80 bg-slate-900/40"
            >
              المتابعة بدون مزامنة سحابية (حفظ محلي فقط)
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};
