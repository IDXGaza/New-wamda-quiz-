import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { 
  CartoonLightning, 
  CartoonUser, 
  CartoonGear,
  CartoonCheck
} from './CartoonIcons';
import { motion, AnimatePresence } from 'motion/react';
import { playSound } from '../utils/sound';

const RemoteBuzzer: React.FC = () => {
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [playerColor] = useState(() => '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'));
  const [isJoined, setIsJoined] = useState(false);
  const [roomState, setRoomState] = useState<any>(null);
  const [isBuzzed, setIsBuzzed] = useState(false);
  const [playerScore, setPlayerScore] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isJoined || !roomId || !auth.currentUser) return;

    const playerRef = doc(db, 'rooms', roomId, 'players', auth.currentUser.uid);
    const unsub = onSnapshot(playerRef, (snapshot) => {
      if (snapshot.exists()) {
        setPlayerScore(snapshot.data().score || 0);
      }
    });

    return () => unsub();
  }, [isJoined, roomId]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
    const id = searchParams.get('roomId') || hashParams.get('roomId');
    if (id) setRoomId(id);
  }, []);

  useEffect(() => {
    if (!isJoined || !roomId) return;

    const roomRef = doc(db, 'rooms', roomId);
    const unsub = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setRoomState(data);
        
        // Reset local buzz state if room buzz is cleared
        if (data.buzzedPlayerId === null) {
          setIsBuzzed(false);
        }
      } else {
        setError('الغرفة غير موجودة أو تم إغلاقها');
        setIsJoined(false);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `rooms/${roomId}`));

    return () => unsub();
  }, [isJoined, roomId]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || !roomId.trim() || !auth.currentUser) return;

    try {
      const playerRef = doc(db, 'rooms', roomId, 'players', auth.currentUser.uid);
      await setDoc(playerRef, {
        name: playerName,
        color: playerColor,
        score: 0,
        joinedAt: new Date().toISOString()
      });
      setIsJoined(true);
      setError('');
    } catch (err: any) {
      if (err.message?.includes('permission')) {
        handleFirestoreError(err, OperationType.WRITE, `rooms/${roomId}/players/${auth.currentUser.uid}`);
      }
      setError('فشل الانضمام للغرفة. تأكد من صحة الرمز.');
    }
  };

  const handleBuzz = async () => {
    if (!isJoined || !roomId || !auth.currentUser || roomState?.gameState !== 'question' || roomState?.buzzedPlayerId) return;

    try {
      playSound('buzzer');
      const roomRef = doc(db, 'rooms', roomId);
      await updateDoc(roomRef, {
        buzzedPlayerId: auth.currentUser.uid,
        buzzedAt: new Date().toISOString()
      });
      setIsBuzzed(true);
      
      // Haptic feedback if available
      if ('vibrate' in navigator) {
        navigator.vibrate(200);
      }
    } catch (err) {
      console.error("Buzz failed", err);
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${roomId}`);
    }
  };

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-cream)] p-6 flex items-center justify-center font-sans" dir="rtl">
        <div className="vintage-panel p-8 rounded-[2.5rem] w-full max-w-md border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0px_var(--color-ink-black)] bg-white">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-[var(--color-primary-gold)] rounded-2xl border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)] flex items-center justify-center mx-auto mb-4">
              <CartoonLightning size={48} />
            </div>
            <h1 className="text-3xl font-display text-[var(--color-ink-black)]">سجل اسمك للمشاركة</h1>
            <p className="text-sm font-bold opacity-60 mt-1">أدخل اسمك لتظهر للمضيف في المسابقة</p>
          </div>

          <form onSubmit={handleJoin} className="space-y-6">
            <div className="bg-[var(--color-primary-gold)]/10 p-4 rounded-2xl border-2 border-dashed border-[var(--color-primary-gold)] text-center mb-4">
              <p className="text-xs font-bold text-[var(--color-bg-dark)]">رمز الغرفة</p>
              <p className="text-2xl font-display text-[var(--color-primary-blue)] tracking-widest">{roomId}</p>
            </div>

            <div>
              <label className="block text-lg font-bold mb-2">اسم المتسابق</label>
              <div className="relative">
                <input 
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value)}
                  className="w-full p-4 pr-12 rounded-xl border-4 border-[var(--color-ink-black)] font-bold text-xl"
                  placeholder="أدخل اسمك هنا..."
                  required
                  maxLength={15}
                />
                <CartoonUser size={24} className="absolute right-4 top-1/2 -translate-y-1/2 opacity-50" />
              </div>
            </div>

            {error && (
              <p className="text-[var(--color-primary-red)] font-bold text-center bg-[var(--color-primary-red)]/10 p-3 rounded-lg border-2 border-[var(--color-primary-red)]">
                {error}
              </p>
            ) }

            <button 
              type="submit"
              className="vintage-button w-full py-5 rounded-2xl text-2xl font-display bg-[var(--color-primary-green)] text-white shadow-[0_8px_0_#1a5d1a]"
            >
              دخول المسابقة
            </button>
          </form>
        </div>
      </div>
    );
  }

  const canBuzz = roomState?.gameState === 'question' && !roomState?.buzzedPlayerId;
  const someoneElseBuzzed = roomState?.buzzedPlayerId && roomState?.buzzedPlayerId !== auth.currentUser?.uid;
  const iBuzzed = roomState?.buzzedPlayerId === auth.currentUser?.uid;

  return (
    <div className="min-h-screen bg-[var(--color-bg-cream)] flex flex-col font-sans overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b-4 border-[var(--color-ink-black)] p-4 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg border-2 border-[var(--color-ink-black)]" style={{ backgroundColor: playerColor }} />
          <span className="font-bold text-lg">{playerName}</span>
        </div>
        <div className="bg-[var(--color-off-white)] px-4 py-1 rounded-full border-2 border-[var(--color-ink-black)] font-bold">
          الغرفة: {roomId}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8">
        <AnimatePresence mode="wait">
          {roomState?.gameState === 'waiting' ? (
            <motion.div 
              key="waiting"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="text-center space-y-4"
            >
              <div className="w-32 h-32 bg-[var(--color-primary-gold)] rounded-[2rem] border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0px_var(--color-ink-black)] flex items-center justify-center mx-auto animate-pulse">
                <CartoonGear size={64} className="animate-spin-slow" />
              </div>
              <h2 className="text-3xl font-display text-[var(--color-ink-black)]">بانتظار بدء المضيف...</h2>
              <p className="font-bold opacity-60">استعد! التحدي سيبدأ قريباً</p>
            </motion.div>
          ) : (
            <motion.div 
              key="game"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full max-w-sm flex flex-col items-center gap-10"
            >
              {/* Status Indicator */}
              <div className={`w-full py-4 rounded-2xl border-4 border-[var(--color-ink-black)] text-center font-display text-2xl shadow-[4px_4px_0px_var(--color-ink-black)] transition-colors ${
                canBuzz ? 'bg-[var(--color-primary-green)] text-white' : 
                iBuzzed ? 'bg-[var(--color-primary-gold)] text-[var(--color-ink-black)]' :
                someoneElseBuzzed ? 'bg-[var(--color-primary-red)] text-white' :
                'bg-gray-200 text-gray-500'
              }`}>
                {canBuzz ? 'اضغط الآن!' : 
                 iBuzzed ? 'لقد ضغطت أولاً!' :
                 someoneElseBuzzed ? 'سبقك أحد المتسابقين!' :
                 'انتظر السؤال...'}
              </div>

              {/* The Big Button */}
              <button 
                onClick={handleBuzz}
                disabled={!canBuzz}
                className={`relative w-64 h-64 rounded-full border-[8px] border-[var(--color-ink-black)] shadow-[0_12px_0_var(--color-ink-black)] active:translate-y-2 active:shadow-[0_4px_0_var(--color-ink-black)] transition-all flex items-center justify-center group ${
                  canBuzz ? 'bg-[var(--color-primary-red)] cursor-pointer' : 'bg-gray-400 cursor-not-allowed grayscale'
                }`}
              >
                <div className="absolute inset-4 rounded-full border-4 border-white/30" />
                <CartoonLightning size={100} className={`transition-transform ${canBuzz ? 'group-hover:scale-110 group-active:scale-95' : ''}`} />
                
                {/* Visual Feedback for Buzz */}
                <AnimatePresence>
                  {iBuzzed && (
                    <motion.div 
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1.5, opacity: 1 }}
                      exit={{ scale: 2, opacity: 0 }}
                      className="absolute inset-0 bg-white rounded-full flex items-center justify-center"
                    >
                      <CartoonCheck size={80} className="text-[var(--color-primary-green)]" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>

              {/* Score Display */}
              <div className="bg-white p-6 rounded-[2rem] border-4 border-[var(--color-ink-black)] shadow-[6px_6px_0px_var(--color-ink-black)] w-full text-center">
                <p className="text-sm font-bold opacity-60 mb-1">رصيدك الحالي</p>
                <p className="text-5xl font-display text-[var(--color-primary-blue)]">
                  {playerScore}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Decoration */}
      <div className="p-4 flex justify-center opacity-20">
        <CartoonLightning size={24} />
        <CartoonLightning size={24} />
        <CartoonLightning size={24} />
      </div>
    </div>
  );
};

export default RemoteBuzzer;
