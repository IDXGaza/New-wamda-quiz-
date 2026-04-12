import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameConfig, Player, Question } from '../types';
import { 
  CartoonRocket, 
  CartoonTimer, 
  CartoonCheck, 
  CartoonX, 
  CartoonSkip, 
  CartoonEye,
  CartoonPencil
} from './CartoonIcons';
import { db, auth } from '../firebase';
import { doc, onSnapshot, updateDoc, getDoc, setDoc, collection } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../services/firestoreUtils';
import QRCode from 'qrcode.react';

import { useToast } from '../contexts/ToastContext';

interface BuzzerScreenProps {
  config: GameConfig;
  questions: Question[];
  players: Player[];
  onFinish: (players: Player[]) => void;
}

const BuzzerScreen: React.FC<BuzzerScreenProps> = ({ config, questions, players: initialPlayers, onFinish }) => {
  const { showToast } = useToast();
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'question' | 'buzzed' | 'revealed'>('waiting');
  const [buzzedPlayerId, setBuzzedPlayerId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [showAnswer, setShowAnswer] = useState(false);
  const [connectedPlayers, setConnectedPlayers] = useState<string[]>([]);
  const [remotePlayers, setRemotePlayers] = useState<Record<string, any>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [editedQuestion, setEditedQuestion] = useState<Partial<Question>>({});

  const [manualJoinUrl, setManualJoinUrl] = useState<string | null>(null);

  const activeQuestion = questions[currentQuestionIndex];
  const { roomId, createdAt } = React.useMemo(() => {
    const ts = Date.now();
    return {
      roomId: config.topic.replace(/\s+/g, '-').toLowerCase() + '-' + ts,
      createdAt: new Date(ts).toISOString()
    };
  }, [config.topic]);

  // Initialize Firebase session
  useEffect(() => {
    if (gameState === 'waiting' && auth.currentUser) {
      const roomRef = doc(db, 'rooms', roomId);
      setDoc(roomRef, {
        hostId: auth.currentUser.uid,
        gameState: 'waiting',
        buzzedPlayerId: null,
        buzzedAt: null,
        createdAt: createdAt
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, `rooms/${roomId}`));

      const unsubscribe = onSnapshot(roomRef, (snapshot) => {
        const data = snapshot.data();
        if (data) {
          if (data.buzzedPlayerId && gameState === 'question') {
            setBuzzedPlayerId(data.buzzedPlayerId);
            setGameState('buzzed');
          }
        }
      });

      // Listen for players in subcollection
      const playersRef = collection(db, 'rooms', roomId, 'players');
      const unsubscribePlayers = onSnapshot(playersRef, (snapshot) => {
        const playersMap: Record<string, any> = {};
        snapshot.docs.forEach(doc => {
          playersMap[doc.id] = doc.data();
        });
        setRemotePlayers(playersMap);
        setConnectedPlayers(Object.keys(playersMap));
      });

      return () => {
        unsubscribe();
        unsubscribePlayers();
      };
    }
  }, [roomId, auth.currentUser]);

  // Timer logic
  useEffect(() => {
    let timer: number;
    if (gameState === 'question' && timeLeft > 0) {
      timer = window.setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (gameState === 'question' && timeLeft === 0) {
      setGameState('revealed');
    }
    return () => clearInterval(timer);
  }, [gameState, timeLeft]);

  const startGame = async () => {
    try {
      const roomRef = doc(db, 'rooms', roomId);
      await updateDoc(roomRef, { gameState: 'playing' });
      setGameState('playing');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${roomId}`);
    }
  };

  const showQuestion = async () => {
    try {
      const roomRef = doc(db, 'rooms', roomId);
      await updateDoc(roomRef, { 
        gameState: 'question',
        buzzedPlayerId: null,
        buzzedAt: null
      });
      setGameState('question');
      setTimeLeft(15);
      setBuzzedPlayerId(null);
      setShowAnswer(false);
      setIsEditing(false);
      setEditedQuestion(activeQuestion);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${roomId}`);
    }
  };

  const handleAnswer = async (isCorrect: boolean) => {
    if (buzzedPlayerId) {
      const points = activeQuestion.points || 100;
      setPlayers(prev => prev.map(p => {
        if (p.id === buzzedPlayerId) {
          return { ...p, score: isCorrect ? p.score + points : Math.max(0, p.score - points) };
        }
        return p;
      }));
    }
    
    try {
      const roomRef = doc(db, 'rooms', roomId);
      await updateDoc(roomRef, { 
        gameState: 'revealed',
        buzzedPlayerId: null,
        buzzedAt: null
      });
      setGameState('revealed');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${roomId}`);
    }
  };

  const nextQuestion = async () => {
    if (currentQuestionIndex < questions.length - 1) {
      try {
        const roomRef = doc(db, 'rooms', roomId);
        await updateDoc(roomRef, { 
          gameState: 'playing',
          buzzedPlayerId: null,
          buzzedAt: null
        });
        setCurrentQuestionIndex(prev => prev + 1);
        setGameState('playing');
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `rooms/${roomId}`);
      }
    } else {
      onFinish(players);
    }
  };

  const skipQuestion = async () => {
    try {
      const roomRef = doc(db, 'rooms', roomId);
      await updateDoc(roomRef, { 
        gameState: 'revealed',
        buzzedPlayerId: null,
        buzzedAt: null
      });
      setGameState('revealed');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${roomId}`);
    }
  };

  const handleSaveEdit = () => {
    const updatedQuestions = [...questions];
    updatedQuestions[currentQuestionIndex] = {
      ...activeQuestion,
      ...editedQuestion
    };
    // In a real app we'd update the parent state, but for now we just update local
    questions[currentQuestionIndex] = updatedQuestions[currentQuestionIndex];
    setIsEditing(false);
  };

  if (gameState === 'waiting') {
    const getPublicOrigin = () => {
      try {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        
        // Specific ID for this app from runtime context
        const appUniqueId = 'xv3vf3fdp6gmrvelmkl7yh-196113868583.europe-west1.run.app';
        
        // If we are already on the pre URL or localhost, we are good
        if (hostname.includes('ais-pre-') || hostname.includes('localhost')) {
          return window.location.origin;
        }

        // Force the known shared URL for this specific app
        return `https://ais-pre-${appUniqueId}`;
      } catch (e) {
        return 'https://ais-pre-xv3vf3fdp6gmrvelmkl7yh-196113868583.europe-west1.run.app';
      }
    };
    const joinUrl = manualJoinUrl || `${getPublicOrigin()}/?mode=remote&roomId=${roomId}`;

    const copyToClipboard = () => {
      try {
        navigator.clipboard.writeText(joinUrl);
        showToast(`تم نسخ الرابط: ${joinUrl}`, 'success');
      } catch (e) {
        showToast('فشل نسخ الرابط تلقائياً. يرجى نسخه يدوياً من المربع الرمادي.', 'error');
      }
    };

    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-4 md:p-8">
        <div className="vintage-panel p-8 md:p-12 rounded-[2rem] md:rounded-[3rem] text-center max-w-2xl w-full border-4 md:border-8 border-[var(--color-ink-black)] shadow-[8px_8px_0px_var(--color-ink-black)]">
          <h2 className="text-4xl md:text-6xl font-display text-[var(--color-ink-black)] mb-8 drop-shadow-[4px_4px_0_var(--color-primary-gold)]">انتظار المتسابقين</h2>
          
          <div className="bg-white p-6 md:p-8 rounded-2xl md:rounded-3xl border-4 border-[var(--color-ink-black)] mb-8 flex flex-col items-center gap-4 md:gap-6 shadow-[inner_4px_4px_0_rgba(0,0,0,0.1)]">
            <QRCode value={joinUrl} size={200} className="md:w-[250px] md:h-[250px]" />
            <div className="space-y-3 w-full">
              <p className="text-lg md:text-2xl font-display text-[var(--color-bg-dark)]">امسح الكود للانضمام كجهاز بازر</p>
              
              {joinUrl.includes('ais-dev-') && (
                <div className="bg-red-100 border-2 border-red-500 p-2 rounded-lg text-red-700 text-xs font-bold animate-pulse">
                  ⚠️ تنبيه: هذا الرابط خاص بالمطور ولن يعمل مع المتسابقين. يرجى استخدام زر "تغيير الرابط" ولصق الرابط العام.
                </div>
              )}

              <div className="bg-gray-100 p-3 rounded-xl border-2 border-dashed border-gray-400 break-all text-[10px] font-mono text-gray-600 mb-2">
                {joinUrl}
              </div>

              <div className="flex flex-col gap-3 w-full">
                <button 
                  onClick={copyToClipboard}
                  className="vintage-button py-3 px-6 rounded-xl text-sm font-bold bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-gold)] transition-colors shadow-[4px_4px_0_var(--color-ink-black)]"
                >
                  نسخ رابط الانضمام
                </button>
                <button 
                  onClick={() => window.open(joinUrl, '_blank')}
                  className="vintage-button py-3 px-6 rounded-xl text-sm font-bold bg-[var(--color-primary-green)] text-white hover:bg-[var(--color-primary-gold)] transition-colors shadow-[4px_4px_0_var(--color-ink-black)]"
                >
                  اختبار الرابط (فتح في نافذة جديدة)
                </button>
                <button 
                  onClick={() => {
                    const url = prompt('إذا كان المتسابقون يواجهون خطأ 403، يرجى لصق رابط "Shared App URL" هنا (الرابط الذي يبدأ بـ ais-pre):');
                    if (url) {
                      // Clean the URL from any existing query params to avoid duplication
                      const baseUrl = url.split('?')[0];
                      const finalUrl = `${baseUrl}?mode=remote&roomId=${roomId}`;
                      setManualJoinUrl(finalUrl);
                      showToast('تم تحديث الرابط يدوياً! جرب مسح الكود الآن.', 'success');
                    }
                  }}
                  className="vintage-button py-2 px-6 rounded-xl text-xs font-bold bg-[var(--color-primary-red)] text-white hover:opacity-90 transition-all shadow-[3px_3px_0_var(--color-ink-black)]"
                >
                  تغيير الرابط يدوياً (حل مشكلة 403) 🛠️
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-3 md:gap-4 mb-8 md:mb-12">
            {connectedPlayers.map((id, idx) => (
              <motion.div 
                key={id}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="px-4 md:px-6 py-2 md:py-3 bg-[var(--color-primary-green)] text-white rounded-xl md:rounded-2xl font-display text-lg md:text-xl border-4 border-[var(--color-ink-black)] shadow-[3px_3px_0_var(--color-ink-black)]"
              >
                {remotePlayers[id]?.name || `متسابق ${idx + 1}`} متصل ✅
              </motion.div>
            ))}
          </div>

          <button 
            onClick={startGame}
            disabled={connectedPlayers.length === 0}
            className={`w-full py-6 md:py-8 rounded-2xl md:rounded-[2.5rem] text-3xl md:text-5xl font-display border-4 border-[var(--color-ink-black)] shadow-[6px_6px_0_var(--color-ink-black)] md:shadow-[8px_8px_0_var(--color-ink-black)] transition-all flex items-center justify-center gap-4 md:gap-6 ${
              connectedPlayers.length > 0 
                ? 'bg-[var(--color-primary-gold)] text-[var(--color-ink-black)] hover:scale-105' 
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {connectedPlayers.length > 0 ? (
              <>
                <span className="vintage-text">بدء المسابقة</span>
                <CartoonRocket size={40} className="md:w-16 md:h-16" />
              </>
            ) : (
              <span className="vintage-text">في انتظار المتسابقين...</span>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 md:gap-8 py-6 md:py-10 min-h-screen relative overflow-hidden">
      
      {/* Scoreboard */}
      <div className="flex flex-wrap justify-center gap-3 md:gap-6 w-full max-w-6xl px-4 relative z-10">
        {players.map(p => (
          <div key={p.id} className="flex-1 min-w-[140px] md:min-w-[200px] vintage-panel p-3 md:p-6 rounded-xl md:rounded-2xl flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-16 md:h-16 rounded-xl md:rounded-2xl flex items-center justify-center text-[var(--color-off-white)] text-xl md:text-4xl font-display border-4 border-[var(--color-ink-black)] shadow-[3px_3px_0_var(--color-ink-black)] md:shadow-[4px_4px_0_var(--color-ink-black)] shrink-0" style={{backgroundColor: p.color}}>
              {p.score}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-[var(--color-bg-dark)] text-[8px] md:text-[10px] font-display uppercase tracking-widest bg-[var(--color-primary-gold)] px-2 py-0.5 rounded-lg border-2 border-[var(--color-ink-black)] inline-block w-fit mb-1">النقاط</span>
              <p className="text-lg md:text-2xl font-display text-[var(--color-ink-black)] truncate">{p.name}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main Game Area */}
      <div className="w-full max-w-4xl mx-auto vintage-panel rounded-[2rem] md:rounded-3xl p-4 md:p-10 text-center relative overflow-hidden z-10">
        {gameState === 'playing' ? (
          <div className="py-12 md:py-20">
            <h2 className="text-4xl md:text-8xl font-display text-[var(--color-ink-black)] mb-8 md:mb-12 drop-shadow-[4px_4px_0_var(--color-primary-gold)]">السؤال {currentQuestionIndex + 1}</h2>
            <button onClick={showQuestion} className="px-8 md:px-12 py-4 md:py-6 vintage-button rounded-2xl text-2xl md:text-4xl font-display hover:scale-[1.05] transition-transform">
              عرض السؤال
            </button>
          </div>
        ) : (
          <div className="space-y-6 md:space-y-8 bg-[var(--color-off-white)]/50 p-4 md:p-8 rounded-[1.5rem] md:rounded-3xl border-4 border-[var(--color-ink-black)] relative mt-2 md:mt-4 shadow-[inner_4px_4px_0_rgba(0,0,0,0.1)]">
            {gameState === 'question' && (
              <div className="absolute top-0 left-0 right-0 h-2 md:h-3 bg-[var(--color-ink-black)]/10 overflow-hidden rounded-t-[1.25rem]">
                <motion.div 
                  initial={{ width: "100%" }}
                  animate={{ width: `${(timeLeft / 15) * 100}%` }}
                  className={`h-full transition-colors duration-300 ${timeLeft <= 5 ? 'bg-[var(--color-primary-red)]' : 'bg-[var(--color-primary-green)]'}`}
                />
              </div>
            )}
            
            <div className="flex justify-center gap-3 md:gap-4 mb-4 md:mb-8 relative pt-4 md:pt-6">
              {config.hexMode === 'manual' && gameState !== 'playing' && (
                <button 
                  onClick={() => setIsEditing(true)}
                  className="absolute -top-10 md:-top-12 -right-2 md:-right-4 w-10 h-10 md:w-14 md:h-14 bg-[var(--color-primary-blue)] text-[var(--color-off-white)] rounded-xl border-4 border-[var(--color-ink-black)] flex items-center justify-center hover:scale-110 transition-transform shadow-[3px_3px_0_var(--color-ink-black)] md:shadow-[4px_4px_0_var(--color-ink-black)]"
                  title="تعديل السؤال"
                >
                  <CartoonPencil size={24} className="md:w-8 md:h-8" />
                </button>
              )}
              <span className="px-4 md:px-6 py-1.5 md:py-2 bg-[var(--color-primary-blue)] text-[var(--color-off-white)] rounded-xl font-display border-4 border-[var(--color-ink-black)] text-sm md:text-lg shadow-[3px_3px_0_var(--color-ink-black)] md:shadow-[4px_4px_0_var(--color-ink-black)]">{activeQuestion.category}</span>
              <span className="px-4 md:px-6 py-1.5 md:py-2 bg-[var(--color-primary-gold)] text-[var(--color-ink-black)] rounded-xl font-display text-sm md:text-lg border-4 border-[var(--color-ink-black)] shadow-[3px_3px_0_var(--color-ink-black)] md:shadow-[4px_4px_0_var(--color-ink-black)]">{(activeQuestion.points || 100)} نقطة</span>
            </div>

            {isEditing ? (
              <div className="space-y-4 md:space-y-6 text-right bg-[var(--color-off-white)] p-4 md:p-8 rounded-2xl border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)] md:shadow-[8px_8px_0_var(--color-ink-black)]">
                <h3 className="text-2xl md:text-3xl font-display text-[var(--color-ink-black)] mb-4 md:mb-6">تعديل السؤال</h3>
                <div className="space-y-3 md:space-y-4">
                  <div>
                    <label className="block text-base md:text-lg font-display text-[var(--color-bg-dark)] mb-1 md:mb-2">نص السؤال</label>
                    <textarea 
                      value={editedQuestion.text || ''} 
                      onChange={e => setEditedQuestion({...editedQuestion, text: e.target.value})}
                      className="w-full p-3 md:p-4 rounded-xl border-4 border-[var(--color-ink-black)] bg-[var(--color-off-white)] font-arabic font-bold text-lg md:text-xl focus:outline-none"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-base md:text-lg font-display text-[var(--color-bg-dark)] mb-1 md:mb-2">الإجابة</label>
                    <input 
                      type="text"
                      value={editedQuestion.answer || ''} 
                      onChange={e => setEditedQuestion({...editedQuestion, answer: e.target.value})}
                      className="w-full p-3 md:p-4 rounded-xl border-4 border-[var(--color-ink-black)] bg-[var(--color-off-white)] font-arabic font-bold text-lg md:text-xl focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex gap-3 md:gap-4 mt-6 md:mt-8">
                  <button onClick={handleSaveEdit} className="flex-1 py-3 md:py-4 bg-[var(--color-primary-green)] text-[var(--color-off-white)] rounded-xl font-display text-xl md:text-2xl border-4 border-[var(--color-ink-black)] shadow-[3px_3px_0_var(--color-ink-black)] md:shadow-[4px_4px_0_var(--color-ink-black)] hover:scale-105 transition-transform">حفظ</button>
                  <button onClick={() => setIsEditing(false)} className="flex-1 py-3 md:py-4 bg-[var(--color-primary-red)] text-[var(--color-off-white)] rounded-xl font-display text-xl md:text-2xl border-4 border-[var(--color-ink-black)] shadow-[3px_3px_0_var(--color-ink-black)] md:shadow-[4px_4px_0_var(--color-ink-black)] hover:scale-105 transition-transform">إلغاء</button>
                </div>
              </div>
            ) : (
              <div className="p-4 md:p-8 rounded-2xl bg-[var(--color-off-white)] border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)] md:shadow-[8px_8px_0_var(--color-ink-black)]">
                <h3 className="text-2xl md:text-5xl font-display text-[var(--color-ink-black)] leading-tight animate-scale-up">
                  {activeQuestion.text}
                </h3>
              </div>
            )}

            {gameState === 'question' && (
              <div className="py-6 md:py-12 flex flex-col items-center gap-4 md:gap-8">
                <div className="w-24 h-24 md:w-36 md:h-36 rounded-full bg-[var(--color-off-white)] border-4 md:border-8 border-[var(--color-ink-black)] flex items-center justify-center relative overflow-hidden shadow-[4px_4px_0_var(--color-ink-black)] md:shadow-[8px_8px_0_var(--color-ink-black)]">
                  <div className="absolute inset-0 border-[6px] md:border-[10px] border-[var(--color-primary-blue)] border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-4xl md:text-6xl font-display text-[var(--color-ink-black)]">{timeLeft}</span>
                </div>
                <p className="text-lg md:text-2xl font-display text-[var(--color-primary-blue)] animate-pulse bg-[var(--color-off-white)] px-6 md:px-8 py-3 md:py-4 rounded-2xl border-4 border-[var(--color-ink-black)] shadow-[3px_3px_0_var(--color-ink-black)] md:shadow-[4px_4px_0_var(--color-ink-black)]">في انتظار ضغط البازر...</p>
                <button onClick={skipQuestion} className="mt-2 md:mt-4 px-6 md:px-8 py-3 md:py-4 vintage-button rounded-xl text-lg md:text-xl font-display flex items-center gap-2 md:gap-3">
                  <CartoonSkip size={20} className="md:w-6 md:h-6" />
                  <span>تخطي السؤال</span>
                </button>
              </div>
            )}

            {gameState === 'buzzed' && buzzedPlayerId && (
              <div className="py-4 md:py-8 animate-fade-in w-full">
                {(() => {
                  const buzzedPlayer = players.find(p => p.id === buzzedPlayerId) || remotePlayers[buzzedPlayerId];
                  return (
                    <>
                      <div className="inline-block p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] mb-6 md:mb-10 border-4 md:border-8 border-[var(--color-ink-black)] shadow-[8px_8px_0_var(--color-ink-black)] md:shadow-[12px_12px_0_var(--color-ink-black)]" style={{backgroundColor: buzzedPlayer?.color || '#6366f1'}}>
                        <p className="text-[var(--color-off-white)] text-[10px] md:text-sm font-display uppercase tracking-widest mb-1 md:mb-2 bg-[var(--color-ink-black)]/20 px-3 md:px-4 py-0.5 md:py-1 rounded-full inline-block">المتسابق الأسرع</p>
                        <h4 className="text-4xl md:text-7xl font-display text-[var(--color-off-white)] drop-shadow-[2px_2px_0_var(--color-ink-black)] md:drop-shadow-[4px_4px_0_var(--color-ink-black)]">{buzzedPlayer?.name}</h4>
                      </div>
                      
                      {!showAnswer ? (
                        <div className="flex justify-center">
                          <button 
                            onClick={() => setShowAnswer(true)}
                            className="px-8 md:px-12 py-4 md:py-6 vintage-button rounded-2xl text-2xl md:text-3xl font-display flex items-center justify-center gap-3 md:gap-4 hover:scale-[1.05] transition-transform"
                          >
                            <CartoonEye size={32} className="md:w-10 md:h-10" />
                            <span>إظهار الإجابة</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-6 md:space-y-10 animate-fade-up">
                          <div className="p-6 md:p-8 bg-[var(--color-primary-green)]/20 rounded-[1.5rem] md:rounded-[2rem] border-4 border-[var(--color-ink-black)] relative shadow-[4px_4px_0_var(--color-ink-black)] md:shadow-[8px_8px_0_var(--color-ink-black)]">
                            <p className="absolute -top-5 md:-top-6 left-1/2 -translate-x-1/2 bg-[var(--color-primary-green)] text-[var(--color-off-white)] px-6 md:px-8 py-1.5 md:py-2 rounded-full text-lg md:text-xl font-display border-4 border-[var(--color-ink-black)]">الإجابة</p>
                            <p className="text-3xl md:text-6xl font-display text-[var(--color-primary-green)] mt-2 md:mt-4 drop-shadow-[1px_1px_0_var(--color-ink-black)] md:drop-shadow-[2px_2px_0_var(--color-ink-black)]">{activeQuestion.answer}</p>
                          </div>
      
                          <div className="flex flex-wrap gap-4 md:gap-6 justify-center">
                            <button onClick={() => handleAnswer(true)} className="flex-1 min-w-[140px] md:min-w-[200px] py-4 md:py-6 bg-[var(--color-primary-green)] text-[var(--color-off-white)] rounded-2xl text-2xl md:text-3xl font-display border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)] md:shadow-[8px_8px_0_var(--color-ink-black)] hover:scale-105 transition-transform flex items-center justify-center gap-3 md:gap-4">
                              <CartoonCheck size={32} className="md:w-10 md:h-10" />
                              <span>صح</span>
                            </button>
                            <button onClick={() => handleAnswer(false)} className="flex-1 min-w-[140px] md:min-w-[200px] py-4 md:py-6 bg-[var(--color-primary-red)] text-[var(--color-off-white)] rounded-2xl text-2xl md:text-3xl font-display border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)] md:shadow-[8px_8px_0_var(--color-ink-black)] hover:scale-105 transition-transform flex items-center justify-center gap-3 md:gap-4">
                              <CartoonX size={32} className="md:w-10 md:h-10" />
                              <span>خطأ</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {gameState === 'revealed' && (
              <div className="py-4 md:py-8 animate-fade-up space-y-6 md:space-y-10">
                <div className="p-6 md:p-8 bg-[var(--color-primary-blue)]/20 rounded-[1.5rem] md:rounded-[2rem] border-4 border-[var(--color-ink-black)] relative shadow-[4px_4px_0_var(--color-ink-black)] md:shadow-[8px_8px_0_var(--color-ink-black)]">
                  <p className="absolute -top-5 md:-top-6 left-1/2 -translate-x-1/2 bg-[var(--color-primary-blue)] text-[var(--color-off-white)] px-6 md:px-8 py-1.5 md:py-2 rounded-full text-lg md:text-xl font-display border-4 border-[var(--color-ink-black)]">الإجابة</p>
                  <p className="text-3xl md:text-6xl font-display text-[var(--color-primary-blue)] mt-2 md:mt-4 drop-shadow-[1px_1px_0_var(--color-ink-black)] md:drop-shadow-[2px_2px_0_var(--color-ink-black)]">{activeQuestion.answer}</p>
                </div>
                
                <button onClick={nextQuestion} className="w-full py-4 md:py-6 vintage-button rounded-2xl text-2xl md:text-4xl font-display hover:scale-[1.05] transition-transform">
                  {currentQuestionIndex < questions.length - 1 ? 'السؤال التالي' : 'إنهاء المسابقة'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BuzzerScreen;
