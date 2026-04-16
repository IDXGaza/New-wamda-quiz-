
import React, { useState, useEffect } from 'react';
import { GameConfig, Player, Question, GameMode, QuestionType, SavedSet } from './types';
import { generateQuestions, parseCustomJson } from './services/geminiService';
import { 
  CartoonStar, 
  CartoonGear, 
  CartoonBook, 
  CartoonHome, 
  CartoonAlert, 
  CartoonLock, 
  CartoonRocket,
  CartoonRefresh,
  CartoonX,
  CartoonBot,
  CartoonSparkles
} from './components/CartoonIcons';
import { motion, AnimatePresence } from 'framer-motion';
import ConfigScreen from './components/ConfigScreen';
import GameScreen from './components/GameScreen';
import SummaryScreen from './components/SummaryScreen';
import RemoteBuzzer from './components/RemoteBuzzer';
import SettingsModal from './components/SettingsModal';
import LibraryScreen from './components/LibraryScreen';
import { useSettings } from './contexts/SettingsContext';
import { useToast } from './contexts/ToastContext';
import { playSound } from './utils/sound';
import { auth, db } from './firebase';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<'config' | 'loading' | 'playing' | 'summary' | 'remote' | 'error' | 'library'>('config');
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [sessionId] = useState(() => Math.random().toString(36).substr(2, 9));
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isFirestoreOffline, setIsFirestoreOffline] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const { settings, setIsSettingsOpen } = useSettings();
  const { showToast } = useToast();

  useEffect(() => {
    const testFirestore = async () => {
      try {
        const { doc, getDocFromServer } = await import('firebase/firestore');
        const { db } = await import('./firebase');
        await getDocFromServer(doc(db, '_connectivity_test_', 'test'));
        setIsFirestoreOffline(false);
      } catch (error: any) {
        if (error.message?.includes('offline') || error.code === 'unavailable') {
          console.warn("Firestore is offline or unreachable.");
          setIsFirestoreOffline(true);
        }
      }
    };

    const handleAuth = () => {
      setAuthError(null);
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (!user) {
          signInAnonymously(auth).catch((error: any) => {
            if (error.code === 'auth/admin-restricted-operation') {
              setAuthError("عذراً، ميزة اللعب عن بُعد (Remote Buzzer) معطلة لأن 'Anonymous Authentication' غير مفعل في Firebase.");
            } else if (error.code === 'auth/network-request-failed') {
              setAuthError("فشل الاتصال بخوادم التحقق. يرجى التأكد من اتصالك بالإنترنت أو عدم وجود جدار حماية يمنع الاتصال.");
            } else {
              console.error("Auth Error:", error);
              setAuthError(error.message);
            }
            setIsAuthReady(true);
          });
        } else {
          setIsAuthReady(true);
          setAuthError(null);
          testFirestore();
        }
      });
      return unsubscribe;
    };

    const unsubscribe = handleAuth();
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const testConnection = async () => {
      try {
        const { getDocFromServer, doc } = await import('firebase/firestore');
        await getDocFromServer(doc(db, '_connectivity_test_', 'ping'));
        console.log("Firebase connection successful");
      } catch (error: any) {
        console.error("Firebase connection test failed:", error);
        if (error.message?.includes('offline')) {
          setAuthError("لا يمكن الاتصال بـ Firebase. تأكد من إنشاء قاعدة البيانات (Firestore) في لوحة التحكم.");
        } else if (error.message?.includes('permission')) {
          // This is fine, it means we connected but don't have read access to the test doc
          console.log("Connected to Firebase (Permission restricted as expected)");
        }
      }
    };
    if (isAuthReady) {
      testConnection();
    }
  }, [isAuthReady]);

  const handleRetryAuth = () => {
    setIsAuthReady(false);
    setAuthError(null);
    signInAnonymously(auth).catch((error: any) => {
      if (error.code === 'auth/admin-restricted-operation') {
        setAuthError("عذراً، ميزة اللعب عن بُعد (Remote Buzzer) معطلة لأن 'Anonymous Authentication' غير مفعل في Firebase.");
      } else if (error.code === 'auth/network-request-failed') {
        setAuthError("فشل الاتصال بخوادم التحقق. يرجى التأكد من اتصالك بالإنترنت أو عدم وجود جدار حماية يمنع الاتصال.");
      } else {
        setAuthError(error.message);
      }
      setIsAuthReady(true);
    });
  };

  useEffect(() => {
    const checkParams = () => {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
      
      const isRemote = searchParams.get('mode') === 'remote' || hashParams.get('mode') === 'remote';
      
      if (isRemote) {
        console.log("Remote mode detected from URL params");
        setGameState('remote');
      }
    };
    
    checkParams();
    window.addEventListener('hashchange', checkParams);
    window.addEventListener('popstate', checkParams);
    
    // Also check periodically for a few seconds in case of slow URL updates
    const interval = setInterval(checkParams, 1000);
    const timeout = setTimeout(() => clearInterval(interval), 5000);
    
    return () => {
      window.removeEventListener('hashchange', checkParams);
      window.removeEventListener('popstate', checkParams);
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  const handleStartGame = async (newConfig: GameConfig) => {
    setConfig({ ...newConfig, sessionId });
    setPlayers(newConfig.players);
    setGameState('loading');
    setErrorMessage('');
    
    try {
      if (!auth.currentUser) {
        showToast("يجب تسجيل الدخول أولاً للبدء. جاري المحاولة...", "info");
        await signInAnonymously(auth);
      }
      
      // Load history
      let excludedAnswers: string[] = [];
      try {
        const data = localStorage.getItem('gemini_quiz_question_history');
        if (data) {
          const history: string[][] = JSON.parse(data);
          excludedAnswers = history.flat();
        }
      } catch (e) {
        console.error("Failed to load history", e);
      }

      if (newConfig.mode === GameMode.HEX_GRID && newConfig.hexMode === 'manual') {
        setQuestions([]);
        setGameState('playing');
        return;
      }

      if (newConfig.manualQuestions && newConfig.manualQuestions.length > 0) {
        setQuestions(newConfig.manualQuestions);
        setGameState('playing');
        return;
      }

      const requiredCount = newConfig.mode === GameMode.HEX_GRID ? 28 : (newConfig.mode === GameMode.GRID ? 25 : newConfig.numQuestions);
      const topicToUse = newConfig.topic || 'عام';

      let generated: Question[] = [];
      let lastError: any = null;

      if (newConfig.customJson) {
        generated = parseCustomJson(newConfig.customJson, topicToUse, newConfig.mode, newConfig.difficulty);
      } else {
        let attempts = 0;
        while (generated.length < requiredCount && attempts < 2) {
          const needed = requiredCount - generated.length;
          console.log(`Attempt ${attempts + 1}: Generating ${needed} questions for topic: ${topicToUse}`);
          
          try {
            const batch = await generateQuestions(
              topicToUse,
              needed,
              newConfig.questionTypes,
              newConfig.mode,
              newConfig.difficulty,
              settings.aiModel,
              newConfig.categories,
              excludedAnswers
            );
            
            console.log(`Batch received: ${batch?.length || 0} questions`);
            
            if (batch && batch.length > 0) {
              const newQuestions = batch.filter(bq => 
                !generated.some(gq => gq.answer === bq.answer) && 
                !excludedAnswers.includes(bq.answer)
              );
              
              console.log(`New unique questions after filtering: ${newQuestions.length}`);
              
              // Check if these are fallback questions
              const isFallback = newQuestions.some(q => q.id.startsWith('static-') || q.text.includes('(حدث خطأ'));
              if (isFallback) {
                showToast("تم استخدام أسئلة احتياطية بسبب مشكلة في الاتصال بالذكاء الاصطناعي.", "warning");
              }
              
              generated.push(...newQuestions);
            }
          } catch (batchError: any) {
            console.error(`Error in batch generation attempt ${attempts + 1}:`, batchError);
            lastError = batchError;
          }
          
          attempts++;
        }
        
        if (generated.length === 0 && lastError) {
          throw lastError;
        }
      }
      
      if (!generated || generated.length === 0) {
        if (lastError) {
          throw lastError;
        }
        throw new Error("عذراً، لم نتمكن من الحصول على أسئلة جديدة. قد يكون السبب تكرار الأسئلة السابقة بكثرة، يرجى محاولة تغيير الموضوع أو مسح السجل.");
      }
      
      if (generated.length < requiredCount && generated.length > 0) {
        showToast(`تم توليد ${generated.length} سؤالاً فقط من أصل ${requiredCount}.`, 'warning');
      }
      
      setQuestions(generated);
      
      // Save to persistent history
      try {
        const newAnswers = generated.map(q => q.answer).filter(Boolean);
        if (newAnswers.length > 0) {
          const data = localStorage.getItem('gemini_quiz_question_history');
          let history: string[][] = data ? JSON.parse(data) : [];
          history.unshift(newAnswers);
          if (history.length > 15) history = history.slice(0, 15); // Keep more history
          localStorage.setItem('gemini_quiz_question_history', JSON.stringify(history));
        }
      } catch (e) {
        console.error("Failed to save history", e);
      }

      setGameState('playing');
    } catch (error: any) {
      console.error("Game Start Error:", error);
      showToast(error.message || "حدث خطأ غير متوقع أثناء توليد الأسئلة.", 'error');
      setGameState('config');
    }
  };

  const handleFinishGame = (finalPlayers: Player[]) => {
    setPlayers(finalPlayers);
    setGameState('summary');
  };

  const handleReset = () => {
    setGameState('config');
    setQuestions([]);
    setErrorMessage('');
  };

  const handlePlaySavedSet = (set: SavedSet, selectedPlayers: Player[]) => {
    const newConfig: GameConfig = {
      topic: set.topic,
      numQuestions: set.numQuestions,
      mode: set.mode,
      questionTypes: [QuestionType.OPEN],
      difficulty: set.difficulty,
      players: selectedPlayers,
      manualQuestions: set.questions,
      sessionId
    };
    setConfig(newConfig);
    setPlayers(newConfig.players);
    setQuestions(set.questions);
    setGameState('playing');
  };

  return (
    <div className="min-h-screen text-[var(--color-ink-black)] font-[var(--font-arabic)] overflow-x-hidden relative">
      {/* Debug Trigger */}
      <button 
        onClick={() => setShowDebug(!showDebug)}
        className="fixed bottom-2 left-2 z-[100] opacity-20 hover:opacity-100 text-[8px] bg-black text-white p-1 rounded"
      >
        DEBUG
      </button>

      {showDebug && (
        <div className="fixed inset-0 z-[100] bg-black/90 p-6 overflow-auto text-xs font-mono text-green-400 flex items-center justify-center">
          <div className="bg-gray-900 p-6 rounded-2xl border-4 border-green-500 max-w-lg w-full shadow-[0_0_20px_rgba(34,197,94,0.3)]">
            <h3 className="text-xl font-bold mb-4 text-green-500 border-b border-green-500 pb-2">معلومات التشخيص (Diagnostic Info)</h3>
            <div className="space-y-2">
              <p><span className="text-gray-500">URL:</span> {window.location.href}</p>
              <p><span className="text-gray-500">Auth Ready:</span> {isAuthReady ? "YES" : "NO"}</p>
              <p><span className="text-gray-500">User ID:</span> {auth.currentUser?.uid || "NONE"}</p>
              <p><span className="text-gray-500">Auth Error:</span> {authError || "NONE"}</p>
              <p><span className="text-gray-500">Game State:</span> {gameState}</p>
              <p><span className="text-gray-500">Firestore Offline:</span> {isFirestoreOffline ? "YES" : "NO"}</p>
            </div>
            <button onClick={() => setShowDebug(false)} className="mt-6 w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition-colors">إغلاق</button>
          </div>
        </div>
      )}

      <div className="fixed inset-0 pointer-events-none z-0 halftone-bg"></div>
      <SettingsModal />
      
      <AnimatePresence>
        {isFirestoreOffline && (
          <motion.div 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className="bg-[var(--color-primary-red)] text-[var(--color-off-white)] text-center py-3 px-4 font-bold text-sm flex items-center justify-center gap-2 sticky top-0 z-[100] border-b-4 border-[var(--color-ink-black)]"
          >
            <CartoonAlert size={20} />
            <span>قاعدة البيانات غير متصلة. بعض الميزات قد لا تعمل بشكل صحيح.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {gameState !== 'remote' && (
        <header className="vintage-panel sticky top-0 z-50 relative border-x-0 border-t-0 rounded-none">
          <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
            <motion.div 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-4 cursor-pointer group" 
              onClick={() => {
                playSound('click');
                handleReset();
              }}
            >
              <div className="w-14 h-14 bg-[var(--color-primary-gold)] rounded-xl flex items-center justify-center text-[var(--color-ink-black)] border-4 border-[var(--color-ink-black)] group-hover:rotate-12 transition-transform shadow-[4px_4px_0px_var(--color-ink-black)]">
                <CartoonRocket size={32} />
              </div>
              <div className="flex flex-col">
                <h1 className="text-3xl font-bold text-[var(--color-ink-black)] tracking-tight leading-none vintage-text">ومضة</h1>
              </div>
            </motion.div>
            
            <div className="flex items-center gap-3">
              {gameState !== 'config' && gameState !== 'loading' && gameState !== 'library' && (
                <button 
                  onClick={() => {
                    playSound('click');
                    handleReset();
                  }} 
                  className="vintage-button bg-[var(--color-primary-red)] text-white px-6 py-3 rounded-xl text-md flex items-center gap-3"
                >
                  <CartoonX size={24} /> إلغاء
                </button>
              )}
              {gameState === 'config' && (
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      playSound('click');
                      setGameState('library');
                    }} 
                    className="vintage-button px-5 py-2.5 text-sm flex items-center gap-2"
                  >
                    <CartoonBook size={16} /> مكتبتي
                  </button>
                </div>
              )}
              <button 
                onClick={() => {
                  playSound('click');
                  setIsSettingsOpen(true);
                }} 
                className="vintage-button w-18 h-18 flex items-center justify-center rounded-2xl"
                title="الإعدادات"
              >
                <CartoonGear size={44} className="animate-spin-slow" />
              </button>
            </div>
          </div>
        </header>
      )}

      <main className={`${gameState === 'remote' ? 'w-full h-full' : 'container mx-auto px-4 py-12 max-w-7xl'} relative z-10`}>
        <AnimatePresence mode="wait">
          {!isAuthReady ? (
            <motion.div 
              key="initializing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-32"
            >
              <div className="relative">
                <div className="w-24 h-24 border-8 border-[var(--color-bg-dark)]/10 rounded-full"></div>
                <div className="w-24 h-24 border-8 border-[var(--color-primary-red)] rounded-full border-t-transparent animate-spin absolute top-0 left-0"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <CartoonGear size={40} className="animate-spin-slow" />
                </div>
              </div>
              <h2 className="text-3xl font-bold text-[var(--color-ink-black)] mt-8 vintage-text">جاري تهيئة النظام...</h2>
              <p className="text-[var(--color-bg-dark)] font-bold mt-2">نحن نجهز لك تجربة فريدة</p>
            </motion.div>
          ) : (
            <motion.div
              key={gameState}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              {authError && (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="vintage-panel p-12 rounded-[2rem] text-center max-w-md border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0px_var(--color-ink-black)]">
                    <CartoonLock size={64} className="mx-auto mb-6" />
                    <h2 className="text-3xl font-bold text-[var(--color-ink-black)] mb-4 vintage-text">خطأ في المصادقة</h2>
                    <p className="text-[var(--color-bg-dark)] mb-8 leading-relaxed font-bold">{authError}</p>
                    
                    {authError.includes('Anonymous Authentication') && (
                      <div className="bg-[var(--color-primary-gold)]/20 p-4 rounded-xl border-2 border-[var(--color-ink-black)] mb-8 text-sm font-bold">
                        تأكد من تفعيل "Anonymous Authentication" في إعدادات Firebase لتمكين ميزات اللعب الجماعي.
                      </div>
                    )}

                    <div className="flex flex-col gap-4">
                      <button onClick={handleRetryAuth} className="vintage-button w-full py-4 rounded-xl text-lg font-bold bg-[var(--color-primary-green)] text-white">
                        إعادة المحاولة
                      </button>
                      <button onClick={handleReset} className="vintage-button w-full py-4 rounded-xl text-lg font-bold bg-[var(--color-primary-gold)]">
                        العودة للرئيسية
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {!authError && isAuthReady && gameState === 'remote' && <RemoteBuzzer />}
              
              {!authError && isAuthReady && gameState === 'config' && <ConfigScreen onStart={handleStartGame} />}
              
              {!authError && isAuthReady && gameState === 'library' && <LibraryScreen onPlaySet={handlePlaySavedSet} onClose={() => setGameState('config')} />}
              
              {gameState === 'loading' && (
                <div className="flex flex-col items-center justify-center py-32 space-y-12">
                  <div className="relative">
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                      className="w-40 h-40 border-4 border-dashed border-[var(--color-primary-blue)] rounded-full absolute -inset-4"
                    />
                    <div className="w-32 h-32 bg-[var(--color-off-white)] rounded-full flex items-center justify-center border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0px_rgba(0,0,0,0.1)]">
                      <CartoonRocket size={64} className="animate-bounce" />
                    </div>
                  </div>
                  <div className="text-center">
                    <h2 className="text-4xl font-bold text-[var(--color-ink-black)] mb-4 vintage-text">جاري تحضير التحدي...</h2>
                    <p className="text-[var(--color-bg-dark)] text-xl font-bold">الذكاء الاصطناعي يقوم بتأليف الأسئلة وتجهيز اللعبة</p>
                  </div>
                  <div className="flex gap-4">
                    {[0, 1, 2].map(i => (
                      <motion.div 
                        key={i}
                        animate={{ scale: [1, 1.5, 1], rotate: [0, 15, -15, 0] }}
                        transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
                        className="w-6 h-6 bg-[var(--color-primary-gold)] border-2 border-[var(--color-ink-black)] rounded-lg shadow-[2px_2px_0px_var(--color-ink-black)]"
                      />
                    ))}
                  </div>
                </div>
              )}

              {gameState === 'error' && (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="vintage-panel p-12 rounded-[2rem] text-center max-w-md">
                    <CartoonAlert size={64} className="mx-auto mb-6" />
                    <h2 className="text-3xl font-bold text-[var(--color-ink-black)] mb-4 vintage-text">فشل الاتصال</h2>
                    <p className="text-[var(--color-bg-dark)] mb-8 leading-relaxed font-bold">{errorMessage}</p>
                    <button onClick={handleReset} className="vintage-button w-full py-4 rounded-xl text-lg font-bold bg-[var(--color-primary-gold)]">
                      إعادة المحاولة
                    </button>
                  </div>
                </div>
              )}

              {gameState === 'playing' && config && (
                <GameScreen config={config} questions={questions} players={players} onFinish={handleFinishGame} />
              )}
              
              {gameState === 'summary' && config && <SummaryScreen config={config} questions={questions} players={players} onRestart={handleReset} />}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default App;
