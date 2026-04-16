import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Question, Player, GameConfig } from '../types';
import { playSound } from '../utils/sound';
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
      const timer = setTimeout(() => {
        if (timeLeft <= 6 && timeLeft > 1) {
          playSound('tick');
        }
        setTimeLeft(timeLeft - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (showWordToActor && timeLeft === 0) {
      playSound('wrong');
    }
  }, [showWordToActor, timeLeft]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 md:p-6 bg-[var(--color-bg-cream)] text-[var(--color-ink-black)]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl vintage-panel p-6 md:p-12 rounded-[2rem] md:rounded-[3rem] text-center relative overflow-hidden border-4 md:border-8 border-[var(--color-ink-black)] shadow-[8px_8px_0px_var(--color-ink-black)]"
      >
        <h1 className="text-4xl md:text-7xl font-display mb-6 md:mb-10 text-[var(--color-ink-black)] drop-shadow-[2px_2px_0_var(--color-primary-gold)] md:drop-shadow-[4px_4px_0_var(--color-primary-gold)]">وضع ولا كلمة 🤫</h1>
        
        <div className="bg-[var(--color-off-white)] p-6 md:p-10 rounded-[1.5rem] md:rounded-[2.5rem] border-4 border-[var(--color-ink-black)] mb-6 md:mb-10 shadow-[inner_4px_4px_0_rgba(0,0,0,0.1)]">
          <p className="text-xl md:text-3xl font-display mb-4 md:mb-6 text-[var(--color-bg-dark)]">الكلمة الحالية:</p>
          {showWordToActor ? (
            <>
              {activeQuestion.category && (
                <p className="text-lg md:text-2xl font-display text-[var(--color-bg-dark)]/60 mb-2 md:mb-4">الفئة: {activeQuestion.category}</p>
              )}
              <p className="text-4xl md:text-8xl font-display text-[var(--color-primary-blue)] tracking-widest drop-shadow-[1px_1px_0_var(--color-ink-black)] md:drop-shadow-[2px_2px_0_var(--color-ink-black)]">{activeQuestion.answer}</p>
            </>
          ) : (
            <p className="text-4xl md:text-8xl font-display text-[var(--color-bg-dark)]/30 tracking-widest">******</p>
          )}
          {showWordToActor && (
            <div className="flex items-center justify-center gap-3 md:gap-4 mt-6 md:mt-8 bg-[var(--color-primary-red)]/10 p-3 md:p-4 rounded-xl md:rounded-2xl border-2 border-[var(--color-primary-red)]">
              <CartoonTimer size={32} className="text-[var(--color-primary-red)] animate-pulse md:w-12 md:h-12" />
              <p className="text-2xl md:text-5xl font-display text-[var(--color-primary-red)]">الوقت: {timeLeft} ثانية</p>
            </div>
          )}
        </div>

        <button 
          onClick={() => {
            playSound('click');
            setShowWordToActor(!showWordToActor);
            setTimeLeft(60);
          }}
          className="vintage-button w-full py-6 md:py-8 rounded-2xl md:rounded-[2.5rem] text-2xl md:text-4xl font-display flex items-center justify-center gap-4 md:gap-6"
        >
          <CartoonEye size={32} className="md:w-12 md:h-12" />
          <span>{showWordToActor ? 'إخفاء الكلمة' : 'عرض الكلمة للممثل'}</span>
        </button>

        <div className="flex justify-between gap-4 md:gap-6 mt-8 md:mt-10">
            <button 
              onClick={() => {
                playSound('click');
                setActiveQuestionIndex(prev => Math.max(0, prev - 1));
                setShowWordToActor(false);
                setTimeLeft(60);
              }}
              disabled={activeQuestionIndex === 0}
              className="px-6 md:px-10 py-4 md:py-5 vintage-panel bg-[var(--color-off-white)] text-[var(--color-ink-black)] rounded-xl md:rounded-[2rem] text-lg md:text-2xl font-display border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)] hover:scale-105 transition-transform disabled:opacity-50"
            >
              السابق
            </button>
            <button 
              onClick={() => {
                playSound('click');
                if (activeQuestionIndex < questions.length - 1) {
                  setActiveQuestionIndex(prev => prev + 1);
                  setShowWordToActor(false);
                  setTimeLeft(60);
                } else {
                  playSound('win');
                  onFinish(players);
                }
              }}
              className="px-6 md:px-10 py-4 md:py-5 vintage-button bg-[var(--color-primary-green)] rounded-xl md:rounded-[2rem] text-lg md:text-2xl font-display flex items-center gap-2 md:gap-4"
            >
              <span>{activeQuestionIndex < questions.length - 1 ? 'السؤال التالي' : 'إنهاء اللعبة'}</span>
              <CartoonRocket size={24} className="md:w-8 md:h-8" />
            </button>
        </div>
      </motion.div>
    </div>
  );
};

export default SilentGuessScreen;
