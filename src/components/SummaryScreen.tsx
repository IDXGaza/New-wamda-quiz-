
import React, { useState, useEffect } from 'react';
import { Player, GameConfig, Question, SavedSet } from '../types';
import confetti from 'canvas-confetti';
import { CartoonStar, CartoonBook, CartoonCheck, CartoonHome, CartoonTrophy, CartoonGear } from './CartoonIcons';

interface Props {
  config: GameConfig;
  questions: Question[];
  players: Player[];
  onRestart: () => void;
}

const SummaryScreen: React.FC<Props> = ({ config, questions, players, onRestart }) => {
  const [isSaved, setIsSaved] = useState(false);
  const sorted = [...players].sort((a, b) => b.score - a.score);
  
  useEffect(() => {
    // Fire confetti when the summary screen loads
    const duration = 3 * 1000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#D93025', '#F5C518', '#1E6FD9']
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#D93025', '#F5C518', '#1E6FD9']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();
  }, []);

  const handleSaveToLibrary = () => {
    if (isSaved) return;
    
    const newSet: SavedSet = {
      id: `set-${Date.now()}`,
      name: `${config.topic || 'مسابقة'} - ${new Date().toLocaleDateString('ar-EG')}`,
      topic: config.topic || 'مسابقة مخصصة',
      numQuestions: questions.length,
      mode: config.mode,
      difficulty: config.difficulty,
      questions: questions,
      createdAt: Date.now()
    };
    
    const existingSets = localStorage.getItem('savedSets');
    const parsedSets: SavedSet[] = existingSets ? JSON.parse(existingSets) : [];
    
    localStorage.setItem('savedSets', JSON.stringify([newSet, ...parsedSets]));
    setIsSaved(true);
  };

  return (
    <div className="vintage-panel p-12 md:p-20 max-w-2xl mx-auto text-center animate-fade-up relative overflow-hidden rounded-[3rem]">
      <div className="mb-14 relative z-10">
        <div className="w-28 h-28 bg-[var(--color-primary-gold)] rounded-[2rem] flex items-center justify-center mx-auto mb-8 border-4 border-[var(--color-ink-black)] shadow-[6px_6px_0px_var(--color-ink-black)] animate-bounce-cartoon">
          <CartoonTrophy size={64} />
        </div>
        <h2 className="text-5xl md:text-7xl font-display text-[var(--color-ink-black)] mb-4 drop-shadow-[4px_4px_0_var(--color-primary-gold)]">النتائج النهائية</h2>
        <p className="text-[var(--color-ink-black)] font-display uppercase tracking-widest text-lg bg-[var(--color-primary-gold)] inline-block px-8 py-2 rounded-2xl border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)]">أبطال المسابقة</p>
      </div>

      <div className="space-y-6 mb-16 relative z-10">
        {sorted.map((p, idx) => (
          <div key={p.id} className={`flex items-center justify-between p-6 rounded-[2rem] transition-all border-4 border-[var(--color-ink-black)] shadow-[6px_6px_0px_var(--color-ink-black)] ${idx === 0 ? 'bg-[var(--color-primary-gold)]/20 scale-105 z-10 relative' : 'bg-[var(--color-off-white)]'}`}>
            <div className="flex items-center gap-6">
              <span className={`text-3xl font-display w-14 h-14 rounded-2xl flex items-center justify-center border-4 border-[var(--color-ink-black)] shadow-[2px_2px_0_var(--color-ink-black)] ${idx === 0 ? 'bg-[var(--color-primary-gold)] text-[var(--color-ink-black)]' : 'bg-[var(--color-off-white)] text-[var(--color-bg-dark)]'}`}>
                {idx + 1}
              </span>
              <span className={`text-3xl font-display text-[var(--color-ink-black)]`}>{p.name}</span>
            </div>
            <div className="text-right flex flex-col items-end">
              <span className={`text-5xl font-display text-[var(--color-ink-black)] drop-shadow-[2px_2px_0_rgba(0,0,0,0.1)]`}>{p.score}</span>
              <span className="text-xs font-display text-[var(--color-bg-dark)] uppercase tracking-widest mt-1 bg-[var(--color-primary-gold)] px-2 py-0.5 rounded-lg border-2 border-[var(--color-ink-black)]">نقطة</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-6 relative z-10">
        <button 
          onClick={handleSaveToLibrary} 
          disabled={isSaved}
          className={`w-full py-6 rounded-[2.5rem] font-display text-3xl transition-all flex items-center justify-center gap-4 border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0px_var(--color-ink-black)] active:translate-y-1 active:shadow-none ${isSaved ? 'bg-[var(--color-primary-green)] text-[var(--color-off-white)]' : 'bg-[var(--color-accent-sky)] text-[var(--color-ink-black)]'}`}
        >
          {isSaved ? (
            <>
              <CartoonCheck size={40} />
              <span>تم الحفظ بنجاح!</span>
            </>
          ) : (
            <>
              <CartoonBook size={40} />
              <span>حفظ في المكتبة</span>
            </>
          )}
        </button>
        <button onClick={onRestart} className="vintage-button w-full py-8 rounded-[2.5rem] font-display text-4xl flex items-center justify-center gap-6 bg-[var(--color-primary-gold)]">
          <CartoonGear size={64} className="animate-spin-slow" />
          <span>القائمة الرئيسية</span>
        </button>
      </div>
    </div>
  );
};

export default SummaryScreen;
