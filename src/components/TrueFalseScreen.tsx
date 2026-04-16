import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GameConfig, Player, Question, Difficulty } from '../types';
import { updateQuestionStats } from '../services/vaultService';
import { 
  CartoonCheck, 
  CartoonX, 
  CartoonStar, 
  CartoonAlert, 
  CartoonRocket,
  CartoonEye
} from './CartoonIcons';
import { playSound } from '../utils/sound';

interface Props {
  config: GameConfig;
  questions: Question[];
  players: Player[];
  onFinish: (players: Player[]) => void;
}

const TrueFalseScreen: React.FC<Props> = ({ config, questions, players: initialPlayers, onFinish }) => {
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [gameState, setGameState] = useState<'question' | 'result' | 'finished'>('question');
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const questionStartTime = React.useRef(Date.now());

  const currentQuestion = questions[currentIndex];

  useEffect(() => {
    questionStartTime.current = Date.now();
  }, [currentIndex]);

  const handleAnswer = (answer: string) => {
    if (gameState !== 'question') return;

    const correct = currentQuestion.answer.trim() === answer;
    
    // Tracking
    const timeSpentMs = Date.now() - questionStartTime.current;
    if (currentQuestion.id && !currentQuestion.id.startsWith('custom') && !currentQuestion.id.startsWith('manual')) {
      updateQuestionStats(currentQuestion.id, correct, timeSpentMs).catch(err => console.error("Vault update failed", err));
    }

    setSelectedAnswer(answer);
    setIsCorrect(correct);
    
    if (correct) {
      playSound('correct');
      setPlayers(prev => prev.map((p, i) => 
        i === currentPlayerIndex ? { ...p, score: p.score + (currentQuestion.points || 100) } : p
      ));
    } else {
      playSound('wrong');
    }

    setGameState('result');
  };

  const nextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setCurrentPlayerIndex((currentPlayerIndex + 1) % players.length);
      setGameState('question');
      setSelectedAnswer(null);
      setIsCorrect(null);
    } else {
      setGameState('finished');
    }
  };

  if (gameState === 'finished') {
    const winner = [...players].sort((a, b) => b.score - a.score)[0];
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[var(--color-ink-black)]/80 backdrop-blur-md animate-fade-in">
        <div className="w-full max-w-lg rounded-[2.5rem] md:rounded-[3rem] p-8 md:p-12 vintage-panel text-center relative overflow-hidden border-4 md:border-8 border-[var(--color-ink-black)] shadow-[8px_8px_0px_var(--color-ink-black)] md:shadow-[15px_15px_0px_var(--color-ink-black)]">
          <div className="relative z-10">
            <div className="w-20 h-20 md:w-32 md:h-32 bg-[var(--color-primary-gold)] rounded-2xl md:rounded-3xl flex items-center justify-center mx-auto mb-6 md:mb-10 border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)] md:shadow-[8px_8px_0px_var(--color-ink-black)] animate-bounce">
              <CartoonStar className="w-12 h-12 md:w-20 md:h-20" />
            </div>
            <h2 className="text-3xl md:text-5xl font-black text-[var(--color-ink-black)] mb-4 md:mb-6 vintage-text">انتهت الجولة!</h2>
            <div className="inline-block px-6 md:px-10 py-4 md:py-6 rounded-2xl md:rounded-3xl text-white text-2xl md:text-4xl font-black mb-6 md:mb-10 border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)] md:shadow-[8px_8px_0px_var(--color-ink-black)]" style={{backgroundColor: winner.color}}>
              {winner.name} هو الفائز!
            </div>
            <p className="text-[var(--color-bg-dark)] font-bold text-lg md:text-xl mb-8 md:mb-12 bg-[var(--color-off-white)] p-6 md:p-8 rounded-2xl md:rounded-3xl border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)]">
              لقد جمعت {winner.score} نقطة من كشف الحقائق المذهلة!
            </p>
            <button 
              onClick={() => onFinish(players)}
              className="vintage-button w-full py-4 md:py-6 rounded-2xl text-2xl md:text-3xl font-black bg-[var(--color-primary-gold)]"
            >
              عرض النتائج النهائية
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 md:gap-8 min-h-screen p-2 md:p-8 relative">
      {/* Scoreboard */}
      <div className="w-full max-w-4xl grid grid-cols-2 gap-4 md:gap-6">
        {players.map((p, idx) => (
          <div 
            key={p.id}
            className={`p-4 md:p-6 rounded-2xl border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)] md:shadow-[6px_6px_0px_var(--color-ink-black)] transition-all ${
              currentPlayerIndex === idx ? 'bg-[var(--color-primary-gold)] scale-[1.02] md:scale-105 z-10' : 'bg-[var(--color-off-white)] opacity-80'
            }`}
          >
            <div className="flex items-center justify-between gap-2 md:gap-4">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-white font-black text-lg md:text-xl border-2 border-[var(--color-ink-black)] shrink-0" style={{backgroundColor: p.color}}>
                {p.score}
              </div>
              <div className="text-right flex-1 min-w-0">
                <p className="text-[10px] font-black text-[var(--color-bg-dark)] uppercase">لاعب {idx + 1}</p>
                <h3 className="text-sm md:text-xl font-black text-[var(--color-ink-black)] truncate">{p.name}</h3>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Question Card */}
      <div className="w-full max-w-3xl mt-4 md:mt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -50, opacity: 0 }}
            className="vintage-panel p-6 md:p-12 rounded-[2rem] md:rounded-[3rem] border-4 md:border-8 border-[var(--color-ink-black)] shadow-[8px_8px_0px_var(--color-ink-black)] md:shadow-[12px_12px_0px_var(--color-ink-black)] text-center relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 right-0 h-3 md:h-4 bg-[var(--color-primary-gold)]/20">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                className="h-full bg-[var(--color-primary-gold)]"
              />
            </div>

            <div className="mb-6 md:mb-8 flex justify-between items-center">
              <span className="px-4 md:px-6 py-1 md:py-2 bg-[var(--color-accent-sky)] text-[var(--color-ink-black)] rounded-xl font-black border-2 border-[var(--color-ink-black)] shadow-[3px_3px_0px_var(--color-ink-black)] text-xs md:text-base">
                {currentQuestion.category}
              </span>
              <span className="text-lg md:text-2xl font-black text-[var(--color-ink-black)] vintage-text">
                {currentIndex + 1} / {questions.length}
              </span>
            </div>

            <h2 className="text-2xl md:text-5xl font-black text-[var(--color-ink-black)] leading-tight mb-8 md:mb-12 vintage-text">
              {currentQuestion.text}
            </h2>

            {gameState === 'question' ? (
              <div className="grid grid-cols-2 gap-4 md:gap-6">
                <button
                  onClick={() => {
                    playSound('click');
                    handleAnswer('صواب');
                  }}
                  className="vintage-button py-6 md:py-8 bg-[var(--color-primary-green)] text-white text-2xl md:text-3xl font-black flex flex-col items-center gap-2"
                >
                  <CartoonCheck size={40} className="md:w-12 md:h-12" />
                  <span>صواب</span>
                </button>
                <button
                  onClick={() => {
                    playSound('click');
                    handleAnswer('خطأ');
                  }}
                  className="vintage-button py-6 md:py-8 bg-[var(--color-primary-red)] text-white text-2xl md:text-3xl font-black flex flex-col items-center gap-2"
                >
                  <CartoonX size={40} className="md:w-12 md:h-12" />
                  <span>خطأ</span>
                </button>
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6 md:space-y-8"
              >
                <div className={`p-6 md:p-8 rounded-2xl md:rounded-3xl border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)] md:shadow-[8px_8px_0px_var(--color-ink-black)] ${
                  isCorrect ? 'bg-[var(--color-primary-green)]/10' : 'bg-[var(--color-primary-red)]/10'
                }`}>
                  <div className="flex items-center justify-center gap-3 md:gap-4 mb-3 md:mb-4">
                    {isCorrect ? (
                      <CartoonCheck className="text-[var(--color-primary-green)] w-8 h-8 md:w-12 md:h-12" />
                    ) : (
                      <CartoonX className="text-[var(--color-primary-red)] w-8 h-8 md:w-12 md:h-12" />
                    )}
                    <h3 className={`text-2xl md:text-4xl font-black vintage-text ${isCorrect ? 'text-[var(--color-primary-green)]' : 'text-[var(--color-primary-red)]'}`}>
                      {isCorrect ? 'إجابة صحيحة!' : 'إجابة خاطئة!'}
                    </h3>
                  </div>
                  <p className="text-lg md:text-2xl font-black text-[var(--color-ink-black)]">
                    الإجابة الصحيحة هي: <span className="underline">{currentQuestion.answer}</span>
                  </p>
                </div>

                {currentQuestion.explanation && (
                  <div className="p-6 md:p-8 bg-[var(--color-primary-gold)]/10 border-4 border-[var(--color-ink-black)] rounded-2xl md:rounded-3xl text-right relative shadow-[4px_4px_0px_var(--color-ink-black)] md:shadow-[6px_6px_0px_var(--color-ink-black)]">
                    <div className="absolute -top-4 right-6 bg-[var(--color-primary-gold)] text-[var(--color-ink-black)] px-4 py-1.5 rounded-xl font-black border-2 border-[var(--color-ink-black)] text-sm md:text-base">
                      لماذا؟
                    </div>
                    <p className="text-lg md:text-2xl font-bold text-[var(--color-ink-black)] leading-relaxed pt-2">
                      {currentQuestion.explanation}
                    </p>
                  </div>
                )}

                <button
                  onClick={() => {
                    playSound('click');
                    nextQuestion();
                  }}
                  className="vintage-button w-full py-4 md:py-6 bg-[var(--color-primary-gold)] text-[var(--color-ink-black)] text-xl md:text-2xl font-black flex items-center justify-center gap-3 md:gap-4"
                >
                  <span>السؤال التالي</span>
                  <CartoonRocket size={24} className="md:w-8 md:h-8" />
                </button>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-12">
        <button 
          onClick={() => window.location.reload()}
          className="px-8 py-4 bg-[var(--color-primary-red)] text-white rounded-xl font-black border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)] active:translate-y-1 active:shadow-none"
        >
          إلغاء الجولة
        </button>
      </div>
    </div>
  );
};

export default TrueFalseScreen;
