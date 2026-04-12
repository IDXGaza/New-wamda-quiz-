
import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../services/firestoreUtils';
import { 
  CartoonLock, 
  CartoonAlert, 
  CartoonUser, 
  CartoonRocket, 
  CartoonLightning, 
  CartoonCheck, 
  CartoonHome
} from './CartoonIcons';

const RemoteBuzzer: React.FC = () => {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<{id: string, name: string, color: string} | null>(null);
  const [status, setStatus] = useState<'idle' | 'pressed' | 'error' | 'connecting' | 'locked'>('connecting');
  const [playerNameInput, setPlayerNameInput] = useState('');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleAuth = () => {
    setAuthError(null);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        signInAnonymously(auth).catch((error: any) => {
          console.error("Auth Error Details:", error.code, error.message);
          if (error.code === 'auth/admin-restricted-operation' || error.code === 'auth/operation-not-allowed') {
            setAuthError("عذراً، يجب تفعيل 'Anonymous Authentication' في لوحة تحكم Firebase (Authentication > Sign-in method).");
          } else if (error.code === 'auth/network-request-failed') {
            setAuthError("فشل الاتصال بخوادم التحقق. يرجى التأكد من اتصالك بالإنترنت.");
          } else {
            setAuthError(`خطأ في الاتصال بـ Firebase: ${error.message}`);
          }
        });
      } else {
        setIsAuthReady(true);
        setAuthError(null);
      }
    });
    return unsubscribe;
  };

  useEffect(() => {
    const unsubscribe = handleAuth();
    return () => unsubscribe();
  }, []);

  const handleRetryAuth = () => {
    setIsAuthReady(false);
    setAuthError(null);
    signInAnonymously(auth).catch((error: any) => {
      if (error.code === 'auth/admin-restricted-operation') {
        setAuthError("عذراً، يجب تفعيل 'Anonymous Authentication' في لوحة تحكم Firebase.");
      } else if (error.code === 'auth/network-request-failed') {
        setAuthError("فشل الاتصال بخوادم التحقق. يرجى التأكد من اتصالك بالإنترنت أو عدم وجود جدار حماية يمنع الاتصال.");
      } else {
        setAuthError(error.message);
      }
    });
  };

  useEffect(() => {
    if (!isAuthReady) return;
    
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
    const rid = searchParams.get('roomId') || hashParams.get('roomId');
    
    if (rid && isAuthReady && auth.currentUser) {
      setRoomId(rid);
      setStatus('idle');
      
      const roomRef = doc(db, 'rooms', rid);
      const unsubscribe = onSnapshot(roomRef, (snapshot) => {
        if (!snapshot.exists()) {
          setStatus('error');
          return;
        }
        
        const data = snapshot.data();
        if (data.buzzedPlayerId) {
          if (selectedPlayer && data.buzzedPlayerId === selectedPlayer.id) {
            setStatus('pressed');
          } else {
            setStatus('locked');
          }
        } else {
          setStatus('idle');
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `rooms/${rid}`);
      });

      return () => unsubscribe();
    }
  }, [selectedPlayer, isAuthReady]);

  const [joinedAt] = useState(() => new Date().toISOString());

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerNameInput.trim() || !roomId || !auth.currentUser) return;
    
    const newPlayer = {
      id: auth.currentUser.uid,
      name: playerNameInput.trim(),
      color: '#38bdf8' // Default color
    };
    
    setSelectedPlayer(newPlayer);
    
    // Add player to room
    const playerPath = `rooms/${roomId}/players/${auth.currentUser.uid}`;
    setDoc(doc(db, playerPath), {
      name: newPlayer.name,
      color: newPlayer.color,
      score: 0,
      joinedAt: joinedAt
    }).catch(err => handleFirestoreError(err, OperationType.WRITE, playerPath));
  };

  const handlePress = () => {
    if (!selectedPlayer || !roomId || status !== 'idle') return;

    setStatus('pressed');
    
    // Update room with buzzed player
    const roomPath = `rooms/${roomId}`;
    updateDoc(doc(db, roomPath), {
      buzzedPlayerId: selectedPlayer.id,
      buzzedAt: new Date().toISOString()
    }).catch(err => {
      console.log("Buzz rejected (likely someone else was faster):", err.message);
      // We do not call handleFirestoreError here because a rejection is expected
      // if another player buzzed first (enforced by security rules).
      // The onSnapshot listener will update the status to 'locked' shortly.
    });
    
    if (window.navigator.vibrate) window.navigator.vibrate(200);
  };

  const goHome = () => {
    window.location.href = window.location.origin + window.location.pathname;
  };

  if (authError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-[var(--color-bg-cream)]">
        <div className="vintage-panel p-10 rounded-3xl max-w-md w-full">
          <div className="w-24 h-24 bg-[var(--color-primary-red)]/20 rounded-full flex items-center justify-center border-4 border-[var(--color-ink-black)] mx-auto mb-6 shadow-[4px_4px_0_var(--color-ink-black)]">
            <CartoonLock size={48} />
          </div>
          <h2 className="text-3xl font-display text-[var(--color-ink-black)] mb-4">خطأ في المصادقة</h2>
          <p className="text-[var(--color-bg-dark)] font-arabic font-bold mb-6">{authError}</p>
          <div className="bg-[var(--color-primary-gold)]/20 p-4 rounded-2xl border-4 border-[var(--color-ink-black)] text-[var(--color-ink-black)] text-sm mb-6 font-arabic font-bold">
            {authError.includes('Anonymous Authentication') 
              ? 'يرجى إبلاغ منظم المسابقة بتفعيل "الدخول المجهول" (Anonymous Authentication) في إعدادات Firebase.'
              : 'يرجى التأكد من اتصالك بالإنترنت والمحاولة مرة أخرى.'}
          </div>
          <div className="flex flex-col gap-4">
            <button onClick={handleRetryAuth} className="w-full py-4 vintage-button rounded-xl font-display text-xl bg-[var(--color-primary-green)] text-white">إعادة المحاولة</button>
            <button onClick={goHome} className="w-full py-4 vintage-button rounded-xl font-display text-xl">العودة للقائمة الرئيسية</button>
          </div>
        </div>
      </div>
    );
  }

  if (!roomId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-[var(--color-bg-cream)]">
        <div className="vintage-panel p-10 rounded-3xl max-w-md w-full">
          <div className="w-24 h-24 bg-[var(--color-primary-gold)]/20 rounded-full flex items-center justify-center border-4 border-[var(--color-ink-black)] mx-auto mb-6 shadow-[4px_4px_0_var(--color-ink-black)]">
            <CartoonAlert size={48} />
          </div>
          <h2 className="text-3xl font-display text-[var(--color-ink-black)] mb-6">خطأ في الجلسة</h2>
          <button onClick={goHome} className="w-full py-4 vintage-button rounded-xl font-display text-xl">العودة للقائمة الرئيسية</button>
        </div>
      </div>
    );
  }

  if (!selectedPlayer) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-[var(--color-bg-cream)]">
        <div className="w-full max-w-sm vintage-panel p-10 rounded-3xl text-center animate-fade-up">
          <div className="w-24 h-24 bg-[var(--color-primary-blue)]/20 rounded-full flex items-center justify-center border-4 border-[var(--color-ink-black)] mx-auto mb-6 shadow-[4px_4px_0_var(--color-ink-black)]">
            <CartoonUser size={48} />
          </div>
          <h2 className="text-3xl font-display text-[var(--color-ink-black)] mb-2">من المتسابق؟</h2>
          <p className="text-[var(--color-primary-blue)] font-arabic font-bold text-sm mb-8 bg-[var(--color-primary-blue)]/10 inline-block px-4 py-1 rounded-full border-2 border-[var(--color-ink-black)]">أدخل اسمك للانضمام</p>
          
          <form onSubmit={handleJoin} className="space-y-6">
            <input 
              type="text" 
              value={playerNameInput}
              onChange={(e) => setPlayerNameInput(e.target.value)}
              placeholder="اسم المتسابق"
              className="vintage-input w-full text-center"
              required
            />
            <button
              type="submit"
              className="w-full py-4 vintage-button rounded-xl font-display text-xl flex items-center justify-center gap-3"
            >
              <span>انضمام الآن</span>
              <CartoonRocket size={32} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-between py-12 px-6 overflow-hidden relative bg-[var(--color-bg-cream)]">
      <div className="text-center z-10 vintage-panel p-6 rounded-2xl animate-fade-down">
        <p className="text-[var(--color-bg-dark)] text-xs font-display uppercase tracking-widest mb-2 bg-[var(--color-primary-gold)] px-3 py-1 rounded-lg border-2 border-[var(--color-ink-black)] inline-block">ركن المتسابق</p>
        <h2 className="text-3xl font-display text-[var(--color-ink-black)] mb-3">{selectedPlayer.name}</h2>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-primary-green)]/20 rounded-full border-2 border-[var(--color-ink-black)]">
          <div className="w-2 h-2 bg-[var(--color-primary-green)] rounded-full animate-pulse"></div>
          <span className="text-[var(--color-primary-green)] text-xs font-display uppercase tracking-widest">متصل</span>
        </div>
      </div>

      <div className="relative z-10 w-full flex justify-center">
        <button
          onClick={handlePress}
          disabled={status !== 'idle'}
          className={`relative w-64 h-64 md:w-80 md:h-80 rounded-full border-8 transition-all duration-300 flex flex-col items-center justify-center select-none touch-manipulation shadow-[8px_8px_0_var(--color-ink-black)] ${
            status === 'pressed' 
            ? 'bg-[var(--color-primary-green)]/40 border-[var(--color-ink-black)] scale-95' 
            : status === 'locked'
            ? 'bg-[var(--color-bg-dark)]/50 border-[var(--color-ink-black)] opacity-50 cursor-not-allowed'
            : 'bg-[var(--color-primary-red)] border-[var(--color-ink-black)] hover:scale-[1.02] active:scale-95'
          }`}
        >
          <span className="text-[var(--color-off-white)] mb-4">
            {status === 'pressed' ? <CartoonCheck size={96} /> : status === 'locked' ? <CartoonLock size={96} /> : <CartoonLightning size={96} />}
          </span>
          <span className={`font-display text-3xl md:text-4xl tracking-widest ${status === 'pressed' ? 'text-[var(--color-off-white)]' : status === 'locked' ? 'text-[var(--color-bg-dark)]' : 'text-[var(--color-off-white)]'}`}>
            {status === 'pressed' ? 'أنت الأسرع!' : status === 'locked' ? 'مغلق' : 'BUZZ'}
          </span>
        </button>
      </div>

      <div className="z-10 text-center vintage-panel p-4 rounded-xl">
        <p className="text-[var(--color-ink-black)] text-sm font-arabic font-bold">
          {status === 'idle' ? 'استعد للضغط فور ظهور السؤال!' : 
           status === 'pressed' ? 'تم الضغط! بانتظار المقدم...' : 
           status === 'locked' ? 'لقد سبقك متسابق آخر!' : ''}
        </p>
      </div>
    </div>
  );
};

export default RemoteBuzzer;