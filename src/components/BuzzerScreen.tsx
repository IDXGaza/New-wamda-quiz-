import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { GameConfig, Question, Player } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { updateQuestionStats } from '../services/vaultService';
import { useToast } from '../contexts/ToastContext';
import { 
  CartoonLightning, 
  CartoonRocket, 
  CartoonUser, 
  CartoonCheck, 
  CartoonX, 
  CartoonEye,
  CartoonTrophy
} from './CartoonIcons';
import confetti from 'canvas-confetti';
import { playSound } from '../utils/sound';

interface Props {
  config: GameConfig;
  questions: Question[];
  players: Player[];
  onFinish: (players: Player[]) => void;
}

const BuzzerScreen: React.FC<Props> = ({ config, questions, onFinish }) => {
  const [roomId] = useState(() => Math.random().toString(36).substring(2, 8).toUpperCase());
  const [roomState, setRoomState] = useState<any>(null);
  const [remotePlayers, setRemotePlayers] = useState<Player[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const questionStartTime = React.useRef(Date.now());
  const { showToast } = useToast();

  const currentQuestion = questions[currentQuestionIndex];
  
  // Helper to get a shareable URL (replaces ais-dev with ais-pre if needed)
  const getShareableUrl = () => {
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    const search = `?mode=remote&roomId=${roomId}`;
    
    if (origin.includes('ais-dev-')) {
      return origin.replace('ais-dev-', 'ais-pre-') + pathname + search;
    }
    return origin + pathname + search;
  };

  const joinUrl = getShareableUrl();

  const copyToClipboard = () => {
    navigator.clipboard.writeText(joinUrl).then(() => {
      showToast("تم نسخ الرابط بنجاح!", "success");
    }).catch(err => {
      console.error("Failed to copy:", err);
      showToast("فشل نسخ الرابط", "error");
    });
  };

  useEffect(() => {
    if (!auth.currentUser) return;

    // Create room
    const roomRef = doc(db, 'rooms', roomId);
    setDoc(roomRef, {
      hostId: auth.currentUser.uid,
      gameState: 'waiting',
      buzzedPlayerId: null,
      buzzedAt: null,
      createdAt: new Date().toISOString()
    }).catch(err => handleFirestoreError(err, OperationType.WRITE, `rooms/${roomId}`));

    const unsubRoom = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        
        // Play sound if someone buzzed and it wasn't buzzed before
        setRoomState(prev => {
          if (data.buzzedPlayerId && (!prev || !prev.buzzedPlayerId)) {
            playSound('buzzer');
          }
          return data;
        });
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `rooms/${roomId}`));

    const playersRef = collection(db, 'rooms', roomId, 'players');
    const q = query(playersRef, orderBy('joinedAt', 'asc'));
    const unsubPlayers = onSnapshot(q, (snapshot) => {
      const pList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Player));
      setRemotePlayers(pList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, `rooms/${roomId}/players`));

    return () => {
      unsubRoom();
      unsubPlayers();
      deleteDoc(roomRef);
    };
  }, [roomId]);

  const handleStart = async () => {
    if (remotePlayers.length === 0) return;
    const roomRef = doc(db, 'rooms', roomId);
    try {
      await updateDoc(roomRef, { gameState: 'question' });
      setIsGameStarted(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${roomId}`);
    }
  };

  const handleShowAnswer = () => {
    setShowAnswer(true);
  };

  const handleJudge = async (correct: boolean) => {
    if (!roomState?.buzzedPlayerId) return;
    
    // Performance Tracking
    const timeSpentMs = Date.now() - questionStartTime.current;
    if (currentQuestion.id && !currentQuestion.id.startsWith('custom') && !currentQuestion.id.startsWith('manual')) {
      updateQuestionStats(currentQuestion.id, correct, timeSpentMs).catch(err => console.error("Vault update failed", err));
    }

    const buzzedPlayer = remotePlayers.find(p => p.id === roomState.buzzedPlayerId);
    if (!buzzedPlayer) return;

    const playerRef = doc(db, 'rooms', roomId, 'players', buzzedPlayer.id);
    const points = currentQuestion.points || 100;
    
    try {
      if (correct) {
        playSound('correct');
        await updateDoc(playerRef, { score: (buzzedPlayer.score || 0) + points });
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: [buzzedPlayer.color || '#F5C518', '#ffffff']
        });
      } else {
        playSound('wrong');
        await updateDoc(playerRef, { score: Math.max(0, (buzzedPlayer.score || 0) - (points / 2)) });
      }

      // Reset for next question
      const roomRef = doc(db, 'rooms', roomId);
      if (currentQuestionIndex < questions.length - 1) {
        await updateDoc(roomRef, { 
          buzzedPlayerId: null, 
          buzzedAt: null,
          gameState: 'question'
        });
        setCurrentQuestionIndex(prev => prev + 1);
        setShowAnswer(false);
      } else {
        onFinish(remotePlayers);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${roomId}`);
    }
  };

  const buzzedPlayer = remotePlayers.find(p => p.id === roomState?.buzzedPlayerId);

  useEffect(() => {
    if (isGameStarted) {
      questionStartTime.current = Date.now();
    }
  }, [currentQuestionIndex, isGameStarted]);

  if (!isGameStarted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 animate-fade-in">
        <div className="vintage-panel p-10 rounded-[3rem] text-center border-4 border-[var(--color-ink-black)] shadow-[12px_12px_0px_var(--color-ink-black)] bg-[var(--color-bg-cream)] max-w-2xl w-full">
          <div className="bg-[var(--color-primary-gold)] p-6 rounded-[2rem] border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)] mb-8">
            <h2 className="text-4xl font-display text-[var(--color-ink-black)]">تحدي البازر عن بُعد</h2>
            <p className="text-xl font-bold mt-2 opacity-80">امسح الكود للانضمام من هاتفك</p>
          </div>

          <div className="flex flex-col md:flex-row gap-10 items-center justify-center">
            <div className="bg-white p-6 rounded-[2rem] border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0px_var(--color-ink-black)]">
              <QRCodeSVG value={joinUrl} size={200} />
            </div>

            <div className="flex-1 space-y-4 w-full">
              <div className="bg-[var(--color-off-white)] p-4 rounded-2xl border-4 border-[var(--color-ink-black)]">
                <div className="flex justify-between items-center mb-1">
                  <p className="text-sm font-bold text-[var(--color-bg-dark)]">رابط الانضمام</p>
                  <button 
                    onClick={copyToClipboard}
                    className="text-[10px] bg-[var(--color-primary-blue)] text-white px-2 py-1 rounded-lg font-bold hover:bg-opacity-80 transition-all"
                  >
                    نسخ
                  </button>
                </div>
                <p className="text-[10px] font-mono text-[var(--color-primary-blue)] break-all select-all">{joinUrl}</p>
              </div>

              <div className="bg-[var(--color-off-white)] p-4 rounded-2xl border-4 border-[var(--color-ink-black)]">
                <p className="text-sm font-bold text-[var(--color-bg-dark)] mb-1">رمز الغرفة</p>
                <p className="text-4xl font-display text-[var(--color-primary-blue)] tracking-widest">{roomId}</p>
              </div>
              
              <div className="bg-[var(--color-off-white)] p-4 rounded-2xl border-4 border-[var(--color-ink-black)]">
                <p className="text-sm font-bold text-[var(--color-bg-dark)] mb-1">المتسابقون</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {remotePlayers.length === 0 ? (
                    <p className="text-lg font-bold opacity-50 italic">بانتظار دخول المتسابقين...</p>
                  ) : (
                    remotePlayers.map(p => (
                      <div key={p.id} className="px-4 py-2 rounded-xl border-2 border-[var(--color-ink-black)] font-bold text-white shadow-[2px_2px_0px_var(--color-ink-black)]" style={{ backgroundColor: p.color }}>
                        {p.name}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={() => {
              playSound('click');
              handleStart();
            }}
            disabled={remotePlayers.length === 0}
            className={`vintage-button w-full py-6 rounded-2xl text-3xl font-display mt-10 flex items-center justify-center gap-4 ${remotePlayers.length === 0 ? 'opacity-50 grayscale cursor-not-allowed' : 'bg-[var(--color-primary-green)]'}`}
          >
            <span>ابدأ التحدي</span>
            <CartoonRocket size={40} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      {/* Question Card */}
      <div className="vintage-panel p-10 rounded-[3rem] border-4 border-[var(--color-ink-black)] shadow-[12px_12px_0px_var(--color-ink-black)] bg-[var(--color-bg-cream)] relative overflow-hidden">
        <div className="absolute top-0 right-0 left-0 h-4 bg-[var(--color-primary-blue)] border-b-4 border-[var(--color-ink-black)]" />
        
        <div className="flex justify-between items-center mb-8 mt-4">
          <span className="bg-[var(--color-primary-gold)] px-6 py-2 rounded-xl border-4 border-[var(--color-ink-black)] font-display text-xl shadow-[4px_4px_0px_var(--color-ink-black)]">
            سؤال {currentQuestionIndex + 1} / {questions.length}
          </span>
          <span className="bg-[var(--color-primary-blue)] text-white px-6 py-2 rounded-xl border-4 border-[var(--color-ink-black)] font-display text-xl shadow-[4px_4px_0px_var(--color-ink-black)]">
            {currentQuestion.points || 100} نقطة
          </span>
        </div>

        <div className="text-center py-10">
          <h2 className="text-4xl md:text-5xl font-display text-[var(--color-ink-black)] leading-relaxed">
            {currentQuestion.text}
          </h2>
        </div>

        {buzzedPlayer && (
          <div className="mt-8 animate-bounce">
            <div className="bg-white p-6 rounded-[2rem] border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0px_var(--color-ink-black)] flex items-center justify-center gap-6">
              <div className="w-16 h-16 rounded-full border-4 border-[var(--color-ink-black)] shadow-[2px_2px_0px_var(--color-ink-black)]" style={{ backgroundColor: buzzedPlayer.color }} />
              <div className="text-center">
                <p className="text-xl font-bold text-[var(--color-bg-dark)]">أسرع ضغطة!</p>
                <p className="text-4xl font-display text-[var(--color-ink-black)]">{buzzedPlayer.name}</p>
              </div>
              <CartoonLightning size={48} className="text-[var(--color-primary-gold)]" />
            </div>
          </div>
        )}

        {showAnswer && (
          <div className="mt-10 p-8 bg-[var(--color-primary-green)]/10 border-4 border-[var(--color-primary-green)] rounded-[2rem] animate-fade-up">
            <p className="text-xl font-bold text-[var(--color-primary-green)] mb-2">الإجابة الصحيحة:</p>
            <p className="text-4xl font-display text-[var(--color-ink-black)]">{currentQuestion.answer}</p>
            {currentQuestion.explanation && (
              <p className="mt-4 text-lg font-bold text-[var(--color-bg-dark)] opacity-80">{currentQuestion.explanation}</p>
            )}
          </div>
        )}

        <div className="mt-10 flex flex-col gap-4">
          {!showAnswer ? (
            <button 
              onClick={() => {
                playSound('click');
                handleShowAnswer();
              }}
              className="vintage-button w-full py-6 rounded-2xl text-3xl font-display bg-[var(--color-primary-gold)] flex items-center justify-center gap-4"
            >
              <CartoonEye size={40} />
              <span>إظهار الإجابة</span>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              <button 
                onClick={() => {
                  playSound('click');
                  handleJudge(true);
                }}
                className="vintage-button py-6 rounded-2xl text-3xl font-display bg-[var(--color-primary-green)] text-white flex items-center justify-center gap-4"
              >
                <CartoonCheck size={40} />
                <span>إجابة صحيحة</span>
              </button>
              <button 
                onClick={() => {
                  playSound('click');
                  handleJudge(false);
                }}
                className="vintage-button py-6 rounded-2xl text-3xl font-display bg-[var(--color-primary-red)] text-white flex items-center justify-center gap-4"
              >
                <CartoonX size={40} />
                <span>إجابة خاطئة</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="vintage-panel p-8 rounded-[2.5rem] border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0px_var(--color-ink-black)] bg-[var(--color-off-white)]">
        <h3 className="text-2xl font-display text-[var(--color-ink-black)] mb-6 flex items-center gap-3">
          <CartoonTrophy size={32} />
          <span>ترتيب المتسابقين</span>
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {remotePlayers.sort((a, b) => (b.score || 0) - (a.score || 0)).map((p, i) => (
            <div key={p.id} className="bg-white p-4 rounded-2xl border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)] flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg border-2 border-[var(--color-ink-black)] shrink-0" style={{ backgroundColor: p.color }} />
              <div className="min-w-0">
                <p className="font-bold truncate text-sm">{p.name}</p>
                <p className="text-xl font-display text-[var(--color-primary-blue)]">{p.score || 0}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BuzzerScreen;
