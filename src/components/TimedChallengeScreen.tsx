import React, { useState, useEffect, useCallback } from 'react';
import { GameConfig, Player, Question } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { 
  CartoonTrophy, 
  CartoonTimer, 
  CartoonCheck, 
  CartoonX, 
  CartoonSkip, 
  CartoonEye 
} from './CartoonIcons';

interface Props {
  config: GameConfig;
  questions: Question[];
  players: Player[];
  onFinish: (players: Player[]) => void;
}

const TimedChallengeScreen: React.FC<Props> = ({ config, questions, players: initialPlayers, onFinish }) => {
  const { settings } = useSettings();
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(settings.timedDuration);
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'turn_finished' | 'finished'>('ready');
  const [revealed, setRevealed] = useState(false);
  const [roundScore, setRoundScore] = useState(0);

  const activeQuestion = questions[currentQuestionIndex];
  const currentPlayer = players[currentPlayerIndex];

  useEffect(() => {
    let timer: number;
    if (gameState === 'playing' && timeLeft > 0) {
      timer = window.setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (gameState === 'playing' && timeLeft <= 0) {
      setGameState('turn_finished');
    }
    return () => clearInterval(timer);
  }, [gameState, timeLeft]);

  const handleStartTurn = () => {
    setTimeLeft(settings.timedDuration);
    setRoundScore(0);
    setGameState('playing');
  };

  const handleNextTurn = () => {
    if (currentPlayerIndex < players.length - 1 && currentQuestionIndex < questions.length) {
      setCurrentPlayerIndex(prev => prev + 1);
      setGameState('ready');
    } else {
      setGameState('finished');
    }
  };

  const handleAnswer = useCallback((isCorrect: boolean) => {
    if (isCorrect) {
      const points = activeQuestion?.points || 100;
      setRoundScore(prev => prev + points);
      setPlayers(prev => prev.map((p, idx) => {
        if (idx === currentPlayerIndex) {
          return { ...p, score: p.score + points };
        }
        return p;
      }));
    }

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setRevealed(false);
    } else {
      setGameState('finished');
    }
  }, [activeQuestion, currentQuestionIndex, questions.length, currentPlayerIndex]);

  const renderWinnerModal = () => {
    if (gameState !== 'finished') return null;

    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    const winner = sortedPlayers[0];

    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[var(--color-bg-dark)]/90 backdrop-blur-md animate-fade-in">
        <div className="vintage-panel w-full max-w-lg rounded-[3rem] p-12 text-center max-h-[90vh] overflow-y-auto relative">
          <div className="absolute -top-6 -right-6 w-24 h-24 bg-[var(--color-primary-gold)] rounded-full border-4 border-[var(--color-ink-black)] flex items-center justify-center shadow-[4px_4px_0_var(--color-ink-black)] animate-wobble">
            <CartoonTrophy size={48} />
          </div>
          <h2 className="text-5xl md:text-6xl font-display text-[var(--color-ink-black)] mb-6 drop-shadow-[4px_4px_0_var(--color-primary-gold)]">انتهى التحدي</h2>
          <div className="inline-block px-10 py-5 rounded-[2rem] text-[var(--color-off-white)] text-3xl font-display mb-8 border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0_var(--color-ink-black)]" style={{backgroundColor: winner.color}}>
            الفائز: {winner.name}
          </div>
          <p className="text-[var(--color-bg-dark)] font-display text-3xl mb-12 bg-[var(--color-off-white)] p-6 rounded-3xl border-4 border-[var(--color-ink-black)] shadow-[inner_4px_4px_0_rgba(0,0,0,0.1)]">
            بمجموع <span className="text-[var(--color-primary-red)] text-5xl">{winner.score}</span> نقطة
          </p>
          <button 
            onClick={() => onFinish(players)}
            className="vintage-button w-full py-8 rounded-[2.5rem] text-4xl font-display hover:scale-105 transition-transform"
          >
            عرض النتائج النهائية
          </button>
        </div>
      </div>
    );
  };

  if (gameState === 'ready') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-4 relative overflow-hidden">
        <div className="vintage-panel p-12 rounded-[3rem] text-center max-w-2xl w-full relative z-10">
          <div className="w-32 h-32 bg-[var(--color-primary-blue)]/20 rounded-full flex items-center justify-center border-4 border-[var(--color-ink-black)] mx-auto mb-8 shadow-[4px_4px_0_var(--color-ink-black)] animate-bounce-cartoon">
            <CartoonTimer size={64} />
          </div>
          <h2 className="text-6xl md:text-8xl font-display text-[var(--color-ink-black)] mb-6 drop-shadow-[4px_4px_0_var(--color-primary-blue)]">دور {currentPlayer.name}</h2>
          <p className="text-2xl text-[var(--color-bg-dark)] font-arabic font-bold mb-12 leading-relaxed bg-[var(--color-off-white)] p-6 rounded-3xl border-4 border-[var(--color-ink-black)] shadow-[inner_4px_4px_0_rgba(0,0,0,0.1)]">
            أمامك {settings.timedDuration} ثانية للإجابة على أكبر عدد ممكن من الأسئلة. 
            السرعة والتركيز هما مفتاح الفوز!
          </p>
          <button 
            onClick={handleStartTurn}
            className="w-full py-8 text-[var(--color-off-white)] rounded-[2.5rem] text-5xl font-display border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0_var(--color-ink-black)] hover:scale-105 transition-transform"
            style={{ backgroundColor: currentPlayer.color }}
          >
            ابدأ التحدي الآن
          </button>
        </div>
      </div>
    );
  }

  if (gameState === 'turn_finished') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-4 relative overflow-hidden">
        <div className="vintage-panel p-12 rounded-[3rem] text-center max-w-2xl w-full relative z-10">
          <div className="w-32 h-32 bg-[var(--color-primary-red)]/20 rounded-full flex items-center justify-center border-4 border-[var(--color-ink-black)] mx-auto mb-8 shadow-[4px_4px_0_var(--color-ink-black)] animate-wobble">
            <CartoonTimer size={64} />
          </div>
          <h2 className="text-6xl md:text-8xl font-display text-[var(--color-ink-black)] mb-6 drop-shadow-[4px_4px_0_var(--color-primary-red)]">انتهى الوقت!</h2>
          <p className="text-3xl text-[var(--color-bg-dark)] font-arabic font-bold mb-12 leading-relaxed bg-[var(--color-off-white)] p-8 rounded-[2.5rem] border-4 border-[var(--color-ink-black)] shadow-[inner_4px_4px_0_rgba(0,0,0,0.1)]">
            أحسنت يا {currentPlayer.name}، لقد حصدت <span className="text-[var(--color-primary-gold)] text-6xl drop-shadow-[2px_2px_0_var(--color-ink-black)]">{roundScore}</span> نقطة في هذه الجولة.
          </p>
          <button 
            onClick={handleNextTurn}
            className="vintage-button w-full py-8 rounded-[2.5rem] text-4xl font-display hover:scale-105 transition-transform"
          >
            {currentPlayerIndex < players.length - 1 ? 'المتسابق التالي' : 'عرض النتائج'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 md:gap-10 py-4 md:py-8 min-h-screen relative overflow-hidden">
      
      {/* Header: Timer and Scores (Sticky) */}
      <div className="sticky top-20 z-40 flex flex-wrap justify-center items-center gap-3 md:gap-6 w-full max-w-7xl px-4 py-4">
        {/* Timer */}
        <div className="vintage-panel p-4 md:p-6 rounded-[2rem] flex items-center gap-4 shrink-0 bg-[var(--color-off-white)]">
          <CartoonTimer size={48} className={timeLeft <= 10 ? 'animate-pulse' : ''} />
          <div className={`text-5xl md:text-7xl font-display ${timeLeft <= 10 ? 'text-[var(--color-primary-red)] animate-pulse' : 'text-[var(--color-ink-black)]'}`}>
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
          </div>
          <div className="text-[var(--color-off-white)] bg-[var(--color-ink-black)] px-4 py-1 rounded-xl border-2 border-[var(--color-ink-black)] text-xs md:text-sm font-display uppercase tracking-widest">الوقت</div>
        </div>

        {/* Scores */}
        {players.map((p, idx) => {
          const isCurrent = idx === currentPlayerIndex;
          return (
            <div 
              key={p.id} 
              className={`flex-1 min-w-[140px] md:min-w-[180px] vintage-panel p-3 md:p-5 rounded-[2rem] flex items-center gap-3 md:gap-5 transform transition-all ${isCurrent ? 'scale-110 ring-4 ring-[var(--color-primary-gold)] shadow-[8px_8px_0_var(--color-ink-black)]' : 'opacity-70 hover:opacity-100'}`}
            >
              <div 
                className="w-12 h-12 md:w-16 md:h-16 rounded-2xl flex items-center justify-center text-[var(--color-off-white)] text-2xl md:text-4xl font-display shrink-0 border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)]" 
                style={{backgroundColor: p.color}}
              >
                {p.score}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-[var(--color-bg-dark)] text-[10px] font-display uppercase tracking-widest mb-1 bg-[var(--color-primary-gold)] px-2 py-1 rounded-lg border-2 border-[var(--color-ink-black)] inline-block w-fit">
                  النقاط
                  {isCurrent && <span className="mr-2 text-[var(--color-primary-red)]">● دورك</span>}
                </span>
                <p className="text-xl md:text-3xl font-display text-[var(--color-ink-black)] truncate w-full">{p.name}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Question Area */}
      {activeQuestion && (
        <div className="w-full max-w-4xl px-4 animate-fade-in relative z-10">
          <div className="vintage-panel rounded-[3rem] p-8 md:p-12 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-3 bg-[var(--color-ink-black)]/10 overflow-hidden">
              <div 
                className={`h-full transition-all duration-1000 ${timeLeft <= 10 ? 'bg-[var(--color-primary-red)]' : 'bg-[var(--color-primary-green)]'}`}
                style={{ width: `${(timeLeft / settings.timedDuration) * 100}%` }}
              />
            </div>

            <div className="space-y-8 mt-6 bg-[var(--color-off-white)]/50 p-8 rounded-[2.5rem] border-4 border-[var(--color-ink-black)] shadow-[inner_4px_4px_0_rgba(0,0,0,0.1)]">
              <div className="flex justify-center gap-4">
                <p className="px-6 py-2 bg-[var(--color-primary-blue)] text-[var(--color-off-white)] border-4 border-[var(--color-ink-black)] rounded-xl font-display tracking-widest uppercase text-sm shadow-[4px_4px_0_var(--color-ink-black)]">
                  السؤال {currentQuestionIndex + 1} من {questions.length}
                </p>
                <p className="px-6 py-2 bg-[var(--color-primary-gold)] text-[var(--color-ink-black)] border-4 border-[var(--color-ink-black)] rounded-xl font-display tracking-widest uppercase text-sm shadow-[4px_4px_0_var(--color-ink-black)]">
                  {activeQuestion.category}
                </p>
              </div>
              
              <h3 className="text-4xl md:text-6xl font-display text-[var(--color-ink-black)] leading-tight drop-shadow-[2px_2px_0_rgba(0,0,0,0.1)]">
                {activeQuestion.text}
              </h3>

              {!revealed ? (
                <div className="pt-10 flex flex-col gap-6">
                  <button 
                    onClick={() => setRevealed(true)}
                    className="vintage-button w-full md:w-auto px-16 py-8 rounded-[2.5rem] text-4xl font-display flex items-center justify-center gap-6"
                  >
                    <CartoonEye size={48} />
                    <span>إظهار الإجابة</span>
                  </button>
                  <button 
                    onClick={() => handleAnswer(false)}
                    className="vintage-panel bg-[var(--color-off-white)] w-full md:w-auto px-12 py-6 rounded-[2rem] text-2xl font-display flex items-center justify-center gap-4 border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)] hover:scale-105 transition-transform"
                  >
                    <CartoonSkip size={32} />
                    <span>تخطي السؤال</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-10 animate-fade-up pt-10 border-t-4 border-[var(--color-ink-black)]/10">
                  <div className="p-10 bg-[var(--color-off-white)] rounded-[2.5rem] border-4 border-[var(--color-ink-black)] relative shadow-[8px_8px_0_var(--color-ink-black)]">
                    <p className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[var(--color-bg-dark)] text-[var(--color-off-white)] px-8 py-2 rounded-2xl text-lg font-display border-4 border-[var(--color-ink-black)]">الإجابة</p>
                    <p className="text-5xl md:text-7xl font-display text-[var(--color-primary-blue)] mt-4 drop-shadow-[2px_2px_0_var(--color-ink-black)]">{activeQuestion.answer}</p>
                  </div>

                  <div className="flex flex-col md:flex-row gap-6">
                    <button 
                      onClick={() => handleAnswer(true)}
                      className="flex-1 py-8 rounded-[2.5rem] text-[var(--color-off-white)] text-4xl font-display border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0_var(--color-ink-black)] flex items-center justify-center gap-4 hover:scale-105 transition-transform"
                      style={{ backgroundColor: currentPlayer.color }}
                    >
                      <CartoonCheck size={48} />
                      <span>صح</span>
                    </button>
                    <button 
                      onClick={() => handleAnswer(false)}
                      className="flex-1 py-8 bg-[var(--color-primary-red)] text-[var(--color-off-white)] rounded-[2.5rem] text-4xl font-display border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0_var(--color-ink-black)] flex items-center justify-center gap-4 hover:scale-105 transition-transform"
                    >
                      <CartoonX size={48} />
                      <span>خطأ</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {renderWinnerModal()}
    </div>
  );
};

export default TimedChallengeScreen;
