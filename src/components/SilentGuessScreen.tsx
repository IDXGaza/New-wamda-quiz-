import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Question, Player, GameConfig } from '../types';
import { CartoonTimer, CartoonEye, CartoonSkip, CartoonRocket } from './CartoonIcons';

interface SilentGuessScreenProps {
  config: GameConfig;
  questions: Question[];
  players: Player[];
  onFinish: (players: Player[]) => void;
}

const SilentGuessScreen: React.FC<SilentGuessScreenProps> = ({ config, questions, players, onFinish }) => {
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [showWordToActor, setShowWordToActor] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const activeQuestion = questions[activeQuestionIndex];

  useEffect(() => {
    if (showWordToActor && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [showWordToActor, timeLeft]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-[var(--color-bg-cream)] text-[var(--color-ink-black)]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl vintage-panel p-12 rounded-[3rem] text-center relative overflow-hidden"
      >
        <h1 className="text-6xl md:text-7xl font-display mb-10 text-[var(--color-ink-black)] drop-shadow-[4px_4px_0_var(--color-primary-gold)]">وضع ولا كلمة 🤫</h1>
        
        <div className="bg-[var(--color-off-white)] p-10 rounded-[2.5rem] border-4 border-[var(--color-ink-black)] mb-10 shadow-[inner_4px_4px_0_rgba(0,0,0,0.1)]">
          <p className="text-3xl font-display mb-6 text-[var(--color-bg-dark)]">الكلمة الحالية:</p>
          {showWordToActor ? (
            <>
              {activeQuestion.category && (
                <p className="text-2xl font-display text-[var(--color-bg-dark)]/60 mb-4">الفئة: {activeQuestion.category}</p>
              )}
              <p className="text-7xl md:text-8xl font-display text-[var(--color-primary-blue)] tracking-widest drop-shadow-[2px_2px_0_var(--color-ink-black)]">{activeQuestion.answer}</p>
            </>
          ) : (
            <p className="text-7xl md:text-8xl font-display text-[var(--color-bg-dark)]/30 tracking-widest">******</p>
          )}
          {showWordToActor && (
            <div className="flex items-center justify-center gap-4 mt-8 bg-[var(--color-primary-red)]/10 p-4 rounded-2xl border-2 border-[var(--color-primary-red)]">
              <CartoonTimer size={48} className="text-[var(--color-primary-red)] animate-pulse" />
              <p className="text-5xl font-display text-[var(--color-primary-red)]">الوقت: {timeLeft} ثانية</p>
            </div>
          )}
        </div>

        <button 
          onClick={() => {
            setShowWordToActor(!showWordToActor);
            setTimeLeft(60);
          }}
          className="vintage-button w-full py-8 rounded-[2.5rem] text-4xl font-display flex items-center justify-center gap-6"
        >
          <CartoonEye size={48} />
          <span>{showWordToActor ? 'إخفاء الكلمة' : 'عرض الكلمة للممثل'}</span>
        </button>

        <div className="flex justify-between gap-6 mt-10">
            <button 
              onClick={() => {
                setActiveQuestionIndex(prev => Math.max(0, prev - 1));
                setShowWordToActor(false);
                setTimeLeft(60);
              }}
              disabled={activeQuestionIndex === 0}
              className="px-10 py-5 vintage-panel bg-[var(--color-off-white)] text-[var(--color-ink-black)] rounded-[2rem] text-2xl font-display border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)] hover:scale-105 transition-transform disabled:opacity-50"
            >
              السابق
            </button>
            <button 
              onClick={() => {
                if (activeQuestionIndex < questions.length - 1) {
                  setActiveQuestionIndex(prev => prev + 1);
                  setShowWordToActor(false);
                  setTimeLeft(60);
                } else {
                  onFinish(players);
                }
              }}
              className="px-10 py-5 vintage-button bg-[var(--color-primary-green)] rounded-[2rem] text-2xl font-display flex items-center gap-4"
            >
              <span>{activeQuestionIndex < questions.length - 1 ? 'السؤال التالي' : 'إنهاء اللعبة'}</span>
              <CartoonRocket size={32} />
            </button>
        </div>
      </motion.div>
    </div>
  );
};

export default SilentGuessScreen;
