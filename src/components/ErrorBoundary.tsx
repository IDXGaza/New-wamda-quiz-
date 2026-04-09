import React, { Component, ErrorInfo, ReactNode } from 'react';
import { CartoonAlert, CartoonRefresh } from './CartoonIcons';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<any, any> {
  props: any;
  public state: any = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = "حدث خطأ غير متوقع في التطبيق.";
      
      try {
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error && parsed.error.includes("Missing or insufficient permissions")) {
          errorMessage = "عذراً، لا تملك الصلاحيات الكافية لإتمام هذه العملية. يرجى التأكد من تسجيل الدخول أو تحديث الصفحة.";
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen bg-[var(--color-bg-cream)] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
          <div className="vintage-panel p-12 rounded-[3rem] max-w-lg w-full animate-fade-up relative z-10">
            <div className="w-24 h-24 bg-[var(--color-primary-red)]/20 rounded-full flex items-center justify-center border-4 border-[var(--color-ink-black)] mx-auto mb-6 shadow-[4px_4px_0_var(--color-ink-black)]">
              <CartoonAlert size={48} />
            </div>
            <h1 className="text-4xl font-display text-[var(--color-ink-black)] mb-4">عذراً، حدث خطأ ما</h1>
            <p className="text-[var(--color-bg-dark)] mb-8 max-w-md mx-auto font-arabic font-bold text-lg leading-relaxed bg-[var(--color-off-white)] p-4 rounded-2xl border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)]">
              {errorMessage}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="vintage-button w-full py-5 rounded-3xl font-display text-2xl flex items-center justify-center gap-3"
            >
              <span>تحديث الصفحة</span>
              <CartoonRefresh size={32} />
            </button>
            {process.env.NODE_ENV === 'development' && (
              <pre className="mt-8 p-4 bg-[var(--color-bg-ink)] rounded-2xl border-4 border-[var(--color-ink-black)] text-left text-xs overflow-auto max-w-full font-mono text-[var(--color-off-white)] shadow-[4px_4px_0_var(--color-ink-black)]">
                {this.state.error?.message}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return (this.props as any).children;
  }
}

export default ErrorBoundary;
