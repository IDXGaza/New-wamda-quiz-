import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GameConfig, Player, Question } from '../types';
import { QRCodeSVG } from 'qrcode.react';
import { db, auth } from '../firebase';
import { doc, setDoc, onSnapshot, collection, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../services/firestoreUtils';
import { 
  CartoonLock, 
  CartoonRocket, 
  CartoonPencil, 
  CartoonEye, 
  CartoonCheck, 
  CartoonX, 
  CartoonSkip, 
  CartoonAlert 
} from './CartoonIcons';

interface BuzzerScreenProps {
  config: GameConfig;
  questions: Question[];
  players: Player[];
  onFinish: (players: Player[]) => void;
}

const BuzzerScreen: React.FC<BuzzerScreenProps> = ({ config, questions, players: initialPlayers, onFinish }) => {
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [connectedPlayers, setConnectedPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'question' | 'buzzed' | 'revealed'>('waiting');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [buzzedPlayerId, setBuzzedPlayerId] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15);
  const [roomId] = useState(config.sessionId || Math.random().toString(36).substr(2, 9));
  const [isEditing, setIsEditing] = useState(false);
  const [editedQuestion, setEditedQuestion] = useState<Partial<Question>>({});
  const [activeQuestion, setActiveQuestion] = useState<Question>(questions[0]);

  useEffect(() => {
    setActiveQuestion(questions[currentQuestionIndex]);
    setEditedQuestion(questions[currentQuestionIndex]);
    setIsEditing(false);
  }, [currentQuestionIndex, questions]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const roomRef = doc(db, 'rooms', roomId);
    
    // Create room
    const roomPath = `rooms/${roomId}`;
    setDoc(roomRef, {
      hostId: auth.currentUser.uid,
      gameState: 'waiting',
      buzzedPlayerId: null,
      buzzedAt: null,
      createdAt: new Date().toISOString()
    }).catch(err => handleFirestoreError(err, OperationType.WRITE, roomPath));

    // Listen to room state
    const unsubscribeRoom = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.buzzedPlayerId && data.gameState === 'question') {
          setBuzzedPlayerId(data.buzzedPlayerId);
          setGameState('buzzed');
          const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
          audio.play().catch(() => {});
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, roomPath);
    });

    // Listen to players
    const playersPath = `rooms/${roomId}/players`;
    const playersRef = collection(db, 'rooms', roomId, 'players');
    const unsubscribePlayers = onSnapshot(playersRef, (snapshot) => {
      const currentPlayers: Player[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        currentPlayers.push({
          id: doc.id,
          name: data.name,
          color: data.color,
          score: data.score || 0,
          powers: data.powers || {
            FREEZE: 1,
            STEAL: 1,
            SHIELD: 1
          }
        });
      });
      setConnectedPlayers(currentPlayers);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, playersPath);
    });

    return () => {
      unsubscribeRoom();
      unsubscribePlayers();
    };
  }, [roomId]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (gameState === 'question' && timeLeft > 0) {
      timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    } else if (gameState === 'question' && timeLeft === 0) {
      setGameState('revealed');
      const roomPath = `rooms/${roomId}`;
      updateDoc(doc(db, roomPath), { gameState: 'revealed' }).catch(err => handleFirestoreError(err, OperationType.WRITE, roomPath));
    }
    return () => clearTimeout(timer);
  }, [gameState, timeLeft, roomId]);

  const startGame = () => {
    setPlayers(connectedPlayers.map(p => ({ ...p, score: 0 })));
    setGameState('playing');
    const roomPath = `rooms/${roomId}`;
    updateDoc(doc(db, roomPath), { gameState: 'playing' }).catch(err => handleFirestoreError(err, OperationType.WRITE, roomPath));
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setGameState('question');
      setBuzzedPlayerId(null);
      setShowAnswer(false);
      setTimeLeft(15);
      const roomPath = `rooms/${roomId}`;
      updateDoc(doc(db, roomPath), { 
        gameState: 'question',
        buzzedPlayerId: null,
        buzzedAt: null
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, roomPath));
    } else {
      const roomPath = `rooms/${roomId}`;
      const playersRef = collection(db, 'rooms', roomId, 'players');
      getDocs(playersRef).then(snapshot => {
        snapshot.forEach(d => deleteDoc(d.ref));
      }).then(() => {
        deleteDoc(doc(db, roomPath));
      }).catch(console.error);
      onFinish(players);
    }
  };

  const showQuestion = () => {
    setGameState('question');
    setBuzzedPlayerId(null);
    setShowAnswer(false);
    setTimeLeft(15);
    const roomPath = `rooms/${roomId}`;
    updateDoc(doc(db, roomPath), { 
      gameState: 'question',
      buzzedPlayerId: null,
      buzzedAt: null
    }).catch(err => handleFirestoreError(err, OperationType.WRITE, roomPath));
  };

  const handleSaveEdit = () => {
    if (activeQuestion && editedQuestion) {
      const updatedQ = { ...activeQuestion, ...editedQuestion } as Question;
      setActiveQuestion(updatedQ);
      setIsEditing(false);
    }
  };

  const baseUrl = (process.env.SHARED_APP_URL || window.location.origin).replace(/\/$/, '');
  const joinUrl = `${baseUrl}/?mode=remote&roomId=${roomId}`;

  const handleAnswer = (isCorrect: boolean | null) => {
    if (isCorrect === true && buzzedPlayerId) {
      const updatedPlayers = players.map(p => 
        p.id === buzzedPlayerId ? { ...p, score: p.score + (activeQuestion.points || 100) } : p
      );
      setPlayers(updatedPlayers);
      
      // Update player score in Firestore
      const playerPath = `rooms/${roomId}/players/${buzzedPlayerId}`;
      updateDoc(doc(db, playerPath), {
        score: updatedPlayers.find(p => p.id === buzzedPlayerId)?.score || 0
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, playerPath));

      setGameState('revealed');
      const roomPath = `rooms/${roomId}`;
      updateDoc(doc(db, roomPath), { gameState: 'revealed' }).catch(err => handleFirestoreError(err, OperationType.WRITE, roomPath));
    } else if (isCorrect === false) {
      // If wrong, reset buzzer and let others buzz
      setBuzzedPlayerId(null);
      setShowAnswer(false);
      setGameState('question');
      const roomPath = `rooms/${roomId}`;
      updateDoc(doc(db, roomPath), { 
        gameState: 'question',
        buzzedPlayerId: null,
        buzzedAt: null
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, roomPath));
    } else {
      // No one answered / skip
      setGameState('revealed');
      const roomPath = `rooms/${roomId}`;
      updateDoc(doc(db, roomPath), { gameState: 'revealed' }).catch(err => handleFirestoreError(err, OperationType.WRITE, roomPath));
    }
  };

  const skipQuestion = () => {
    setGameState('revealed');
    const roomPath = `rooms/${roomId}`;
    updateDoc(doc(db, roomPath), { gameState: 'revealed' }).catch(err => handleFirestoreError(err, OperationType.WRITE, roomPath));
  };

  if (!auth.currentUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <div className="w-24 h-24 bg-[var(--color-primary-red)]/20 rounded-full flex items-center justify-center border-4 border-[var(--color-ink-black)] mx-auto mb-6 shadow-[4px_4px_0_var(--color-ink-black)]">
          <CartoonLock size={48} />
        </div>
        <h2 className="text-4xl font-display text-[var(--color-ink-black)]">عذراً، نظام البازر يتطلب تفعيل المصادقة</h2>
        <p className="text-[var(--color-bg-dark)] max-w-md font-arabic font-bold">
          يجب تفعيل "الدخول المجهول" (Anonymous Authentication) في لوحة تحكم Firebase لتتمكن من استخدام ميزة البازر عن بُعد.
        </p>
        <div className="vintage-panel p-6 rounded-2xl text-[var(--color-ink-black)] text-sm text-right bg-[var(--color-primary-gold)]">
          <p className="font-display text-xl mb-2">خطوات التفعيل:</p>
          <ol className="list-decimal list-inside space-y-1 font-arabic font-bold">
            <li>انتقل إلى Firebase Console</li>
            <li>اختر Authentication ثم Sign-in method</li>
            <li>قم بتفعيل Anonymous</li>
          </ol>
        </div>
      </div>
    );
  }

  if (gameState === 'waiting') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] text-center space-y-8 animate-fade-up relative overflow-hidden">
        <div className="relative z-10 space-y-8">
          <h2 className="text-6xl md:text-8xl font-display text-[var(--color-ink-black)] drop-shadow-[4px_4px_0_var(--color-primary-red)]">انضمام المتسابقين</h2>
          <p className="text-2xl font-display text-[var(--color-primary-blue)] bg-[var(--color-off-white)] px-8 py-3 rounded-full border-4 border-[var(--color-ink-black)] inline-block shadow-[4px_4px_0_var(--color-ink-black)]">امسح الرمز للانضمام للمسابقة</p>
          
          <div className="vintage-panel p-10 rounded-3xl flex flex-col items-center gap-6 relative max-w-sm mx-auto">
            <div className="absolute -top-6 -right-6 w-16 h-16 bg-[var(--color-primary-red)] rounded-full flex items-center justify-center border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)]">
              <CartoonRocket size={32} />
            </div>
            <div className="bg-[var(--color-off-white)] p-4 rounded-2xl border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)]">
              <QRCodeSVG value={joinUrl} size={200} level="H" includeMargin={false} />
            </div>
            <div className="px-6 py-3 bg-[var(--color-bg-ink)] rounded-xl text-center font-mono text-sm font-medium text-[var(--color-off-white)] select-all max-w-full break-all border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)]">
              {joinUrl}
            </div>
          </div>
          
          <div className="flex gap-4 flex-wrap justify-center max-w-2xl mx-auto">
            {Array.from({ length: Math.max(initialPlayers.length, connectedPlayers.length) }).map((_, i) => {
              const p = connectedPlayers[i];
              if (p) {
                return (
                  <div key={p.id} className="px-6 py-3 rounded-xl font-display flex items-center gap-3 transition-all bg-[var(--color-primary-gold)] text-[var(--color-ink-black)] border-4 border-[var(--color-ink-black)] text-2xl shadow-[4px_4px_0_var(--color-ink-black)] animate-pop-in">
                    <div className="w-4 h-4 rounded-full bg-[var(--color-ink-black)] animate-pulse"></div>
                    {p.name}
                  </div>
                );
              }
              return (
                <div key={`empty-${i}`} className="px-6 py-3 rounded-xl font-display flex items-center gap-3 transition-all bg-[var(--color-off-white)] text-[var(--color-ink-black)] border-4 border-dashed border-[var(--color-ink-black)] text-2xl opacity-60">
                  <div className="w-4 h-4 rounded-full bg-[var(--color-ink-black)]"></div>
                  في انتظار...
                </div>
              );
            })}
          </div>

          <button 
            onClick={startGame}
            disabled={connectedPlayers.length === 0}
            className="px-12 py-6 vintage-button rounded-2xl text-3xl font-display disabled:opacity-50 disabled:cursor-not-allowed mt-8 flex items-center justify-center gap-4 hover:scale-[1.05] transition-transform mx-auto"
          >
            {connectedPlayers.length > 0 ? (
              <>
                <span className="vintage-text">بدء المسابقة</span>
                <CartoonRocket size={40} />
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
    <div className="flex flex-col items-center gap-8 py-10 min-h-screen relative overflow-hidden">
      
      {/* Scoreboard */}
      <div className="flex flex-wrap justify-center gap-4 md:gap-6 w-full max-w-6xl px-4 relative z-10">
        {players.map(p => (
          <div key={p.id} className="flex-1 min-w-[160px] md:min-w-[200px] vintage-panel p-4 md:p-6 rounded-2xl flex items-center gap-4">
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl flex items-center justify-center text-[var(--color-off-white)] text-2xl md:text-4xl font-display border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)]" style={{backgroundColor: p.color}}>
              {p.score}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-[var(--color-bg-dark)] text-[10px] font-display uppercase tracking-widest bg-[var(--color-primary-gold)] px-2 py-1 rounded-lg border-2 border-[var(--color-ink-black)] inline-block w-fit mb-1">النقاط</span>
              <p className="text-xl md:text-2xl font-display text-[var(--color-ink-black)] truncate">{p.name}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main Game Area */}
      <div className="w-full max-w-4xl mx-auto vintage-panel rounded-3xl p-6 md:p-10 text-center relative overflow-hidden z-10">
        {gameState === 'playing' ? (
          <div className="py-20">
            <h2 className="text-6xl md:text-8xl font-display text-[var(--color-ink-black)] mb-12 drop-shadow-[4px_4px_0_var(--color-primary-gold)]">السؤال {currentQuestionIndex + 1}</h2>
            <button onClick={showQuestion} className="px-12 py-6 vintage-button rounded-2xl text-4xl font-display hover:scale-[1.05] transition-transform">
              عرض السؤال
            </button>
          </div>
        ) : (
          <div className="space-y-8 bg-[var(--color-off-white)]/50 p-8 rounded-3xl border-4 border-[var(--color-ink-black)] relative mt-4 shadow-[inner_4px_4px_0_rgba(0,0,0,0.1)]">
            {gameState === 'question' && (
              <div className="absolute top-0 left-0 right-0 h-3 bg-[var(--color-ink-black)]/10 overflow-hidden rounded-t-[1.25rem]">
                <motion.div 
                  initial={{ width: "100%" }}
                  animate={{ width: `${(timeLeft / 15) * 100}%` }}
                  className={`h-full transition-colors duration-300 ${timeLeft <= 5 ? 'bg-[var(--color-primary-red)]' : 'bg-[var(--color-primary-green)]'}`}
                />
              </div>
            )}
            
            <div className="flex justify-center gap-4 mb-8 relative pt-6">
              {config.hexMode === 'manual' && gameState !== 'playing' && (
                <button 
                  onClick={() => setIsEditing(true)}
                  className="absolute -top-12 -right-4 w-14 h-14 bg-[var(--color-primary-blue)] text-[var(--color-off-white)] rounded-xl border-4 border-[var(--color-ink-black)] flex items-center justify-center hover:scale-110 transition-transform shadow-[4px_4px_0_var(--color-ink-black)]"
                  title="تعديل السؤال"
                >
                  <CartoonPencil size={32} />
                </button>
              )}
              <span className="px-6 py-2 bg-[var(--color-primary-blue)] text-[var(--color-off-white)] rounded-xl font-display border-4 border-[var(--color-ink-black)] text-lg shadow-[4px_4px_0_var(--color-ink-black)]">{activeQuestion.category}</span>
              <span className="px-6 py-2 bg-[var(--color-primary-gold)] text-[var(--color-ink-black)] rounded-xl font-display text-lg border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)]">{(activeQuestion.points || 100)} نقطة</span>
            </div>

            {isEditing ? (
              <div className="space-y-6 text-right bg-[var(--color-off-white)] p-8 rounded-2xl border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0_var(--color-ink-black)]">
                <h3 className="text-3xl font-display text-[var(--color-ink-black)] mb-6">تعديل السؤال</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-lg font-display text-[var(--color-bg-dark)] mb-2">نص السؤال</label>
                    <textarea 
                      value={editedQuestion.text || ''} 
                      onChange={e => setEditedQuestion({...editedQuestion, text: e.target.value})}
                      className="w-full p-4 rounded-xl border-4 border-[var(--color-ink-black)] bg-[var(--color-off-white)] font-arabic font-bold text-xl focus:outline-none"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-lg font-display text-[var(--color-bg-dark)] mb-2">الإجابة</label>
                    <input 
                      type="text"
                      value={editedQuestion.answer || ''} 
                      onChange={e => setEditedQuestion({...editedQuestion, answer: e.target.value})}
                      className="w-full p-4 rounded-xl border-4 border-[var(--color-ink-black)] bg-[var(--color-off-white)] font-arabic font-bold text-xl focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex gap-4 mt-8">
                  <button onClick={handleSaveEdit} className="flex-1 py-4 bg-[var(--color-primary-green)] text-[var(--color-off-white)] rounded-xl font-display text-2xl border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)] hover:scale-105 transition-transform">حفظ</button>
                  <button onClick={() => setIsEditing(false)} className="flex-1 py-4 bg-[var(--color-primary-red)] text-[var(--color-off-white)] rounded-xl font-display text-2xl border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)] hover:scale-105 transition-transform">إلغاء</button>
                </div>
              </div>
            ) : (
              <div className="p-8 rounded-2xl bg-[var(--color-off-white)] border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0_var(--color-ink-black)]">
                <h3 className="text-4xl md:text-5xl font-display text-[var(--color-ink-black)] leading-tight animate-scale-up">
                  {activeQuestion.text}
                </h3>
              </div>
            )}

            {gameState === 'question' && (
              <div className="py-12 flex flex-col items-center gap-8">
                <div className="w-36 h-36 rounded-full bg-[var(--color-off-white)] border-8 border-[var(--color-ink-black)] flex items-center justify-center relative overflow-hidden shadow-[8px_8px_0_var(--color-ink-black)]">
                  <div className="absolute inset-0 border-[10px] border-[var(--color-primary-blue)] border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-6xl font-display text-[var(--color-ink-black)]">{timeLeft}</span>
                </div>
                <p className="text-2xl font-display text-[var(--color-primary-blue)] animate-pulse bg-[var(--color-off-white)] px-8 py-4 rounded-2xl border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)]">في انتظار ضغط البازر...</p>
                <button onClick={skipQuestion} className="mt-4 px-8 py-4 vintage-button rounded-xl text-xl font-display flex items-center gap-3">
                  <CartoonSkip size={24} />
                  <span>تخطي السؤال</span>
                </button>
              </div>
            )}

            {gameState === 'buzzed' && buzzedPlayerId && (
              <div className="py-8 animate-fade-in w-full">
                <div className="inline-block p-8 rounded-[2.5rem] mb-10 border-8 border-[var(--color-ink-black)] shadow-[12px_12px_0_var(--color-ink-black)]" style={{backgroundColor: players.find(p => p.id === buzzedPlayerId)?.color || '#6366f1'}}>
                  <p className="text-[var(--color-off-white)] text-sm font-display uppercase tracking-widest mb-2 bg-[var(--color-ink-black)]/20 px-4 py-1 rounded-full inline-block">المتسابق الأسرع</p>
                  <h4 className="text-6xl md:text-7xl font-display text-[var(--color-off-white)] drop-shadow-[4px_4px_0_var(--color-ink-black)]">{players.find(p => p.id === buzzedPlayerId)?.name}</h4>
                </div>
                
                {!showAnswer ? (
                  <div className="flex justify-center">
                    <button 
                      onClick={() => setShowAnswer(true)}
                      className="px-12 py-6 vintage-button rounded-2xl text-3xl font-display flex items-center justify-center gap-4 hover:scale-[1.05] transition-transform"
                    >
                      <CartoonEye size={40} />
                      <span>إظهار الإجابة</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-10 animate-fade-up">
                    <div className="p-8 bg-[var(--color-primary-green)]/20 rounded-[2rem] border-4 border-[var(--color-ink-black)] relative shadow-[8px_8px_0_var(--color-ink-black)]">
                      <p className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[var(--color-primary-green)] text-[var(--color-off-white)] px-8 py-2 rounded-full text-xl font-display border-4 border-[var(--color-ink-black)]">الإجابة</p>
                      <p className="text-5xl md:text-6xl font-display text-[var(--color-primary-green)] mt-4 drop-shadow-[2px_2px_0_var(--color-ink-black)]">{activeQuestion.answer}</p>
                    </div>

                    <div className="flex flex-wrap gap-6 justify-center">
                      <button onClick={() => handleAnswer(true)} className="flex-1 min-w-[200px] py-6 bg-[var(--color-primary-green)] text-[var(--color-off-white)] rounded-2xl text-3xl font-display border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0_var(--color-ink-black)] hover:scale-105 transition-transform flex items-center justify-center gap-4">
                        <CartoonCheck size={40} />
                        <span>صح</span>
                      </button>
                      <button onClick={() => handleAnswer(false)} className="flex-1 min-w-[200px] py-6 bg-[var(--color-primary-red)] text-[var(--color-off-white)] rounded-2xl text-3xl font-display border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0_var(--color-ink-black)] hover:scale-105 transition-transform flex items-center justify-center gap-4">
                        <CartoonX size={40} />
                        <span>خطأ</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {gameState === 'revealed' && (
              <div className="py-8 animate-fade-up space-y-10">
                <div className="p-8 bg-[var(--color-primary-blue)]/20 rounded-[2rem] border-4 border-[var(--color-ink-black)] relative shadow-[8px_8px_0_var(--color-ink-black)]">
                  <p className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[var(--color-primary-blue)] text-[var(--color-off-white)] px-8 py-2 rounded-full text-xl font-display border-4 border-[var(--color-ink-black)]">الإجابة</p>
                  <p className="text-5xl md:text-6xl font-display text-[var(--color-primary-blue)] mt-4 drop-shadow-[2px_2px_0_var(--color-ink-black)]">{activeQuestion.answer}</p>
                </div>
                
                <button onClick={nextQuestion} className="w-full py-6 vintage-button rounded-2xl text-4xl font-display hover:scale-[1.05] transition-transform">
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
