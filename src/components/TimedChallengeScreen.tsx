import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameConfig, Player, Question, GameMode } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { generateQuestions } from '../services/geminiService';
import { updateQuestionStats } from '../services/vaultService';
import { playSound } from '../utils/sound';
import { 
  CartoonTrophy, 
  CartoonTimer, 
  CartoonCheck, 
  CartoonX, 
  CartoonSkip, 
  CartoonEye,
  CartoonBot
} from './CartoonIcons';

interface Props {
  config: GameConfig;
  questions: Question[];
  players: Player[];
  onFinish: (players: Player[]) => void;
}

const TimedChallengeScreen: React.FC<Props> = ({ config, questions: initialQuestions, players: initialPlayers, onFinish }) => {
  const { settings } = useSettings();
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [localQuestions, setLocalQuestions] = useState<Question[]>(initialQuestions);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(settings.timedDuration);
  const [gameState, setGameState] = useState<'ready' | 'playing' | 'turn_finished' | 'finished'>('ready');
  const [revealed, setRevealed] = useState(false);
  const [roundScore, setRoundScore] = useState(0);
  const [isFetching, setIsFetching] = useState(false);
  const fetchingRef = useRef(false);
  const questionStartTime = useRef(Date.now());

  const activeQuestion = localQuestions[currentQuestionIndex];
  const currentPlayer = players[currentPlayerIndex];

  useEffect(() => {
    if (activeQuestion) {
      setRevealed(false);
      questionStartTime.current = Date.now();
    }
  }, [activeQuestion]);
  useEffect(() => {
    const fetchMore = async () => {
      if (fetchingRef.current || localQuestions.length - currentQuestionIndex > 5) return;
      
      fetchingRef.current = true;
      setIsFetching(true);
      try {
        const excludeAnswers = localQuestions.map(q => q.answer);
        const newQuestions = await generateQuestions(
          config.topic || 'عام',
          5,
          config.questionTypes,
          GameMode.TIMED,
          config.difficulty,
          settings.aiModel,
          config.categories,
          excludeAnswers
        );
        
        if (newQuestions && newQuestions.length > 0) {
          setLocalQuestions(prev => [...prev, ...newQuestions]);
        }
      } catch (error) {
        console.error("Failed to fetch more questions for timed mode", error);
      } finally {
        fetchingRef.current = false;
        setIsFetching(false);
      }
    };

    if (gameState === 'playing') {
      fetchMore();
    }
  }, [currentQuestionIndex, localQuestions.length, gameState, config, settings.aiModel]);

  useEffect(() => {
    let timer: number;
    if (gameState === 'playing' && timeLeft > 0) {
      timer = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 6 && prev > 1) {
            playSound('tick');
          }
          return prev - 1;
        });
      }, 1000);
    } else if (gameState === 'playing' && timeLeft <= 0) {
      playSound('wrong');
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
    if (currentPlayerIndex < players.length - 1) {
      setCurrentPlayerIndex(prev => prev + 1);
      setGameState('ready');
    } else {
      setGameState('finished');
    }
  };

  const handleAnswer = useCallback((isCorrect: boolean) => {
    // Tracking
    const now = Date.now();
    const timeSpentMs = now - questionStartTime.current;
    if (activeQuestion?.id && !activeQuestion.id.startsWith('fb-')) {
      updateQuestionStats(activeQuestion.id, isCorrect, timeSpentMs).catch(err => console.error("Vault update failed", err));
    }
    questionStartTime.current = now;

    if (isCorrect) {
      playSound('correct');
      const points = activeQuestion?.points || 100;
      setRoundScore(prev => prev + points);
      setPlayers(prev => prev.map((p, idx) => {
        if (idx === currentPlayerIndex) {
          return { ...p, score: p.score + points };
        }
        return p;
      }));
    } else {
      playSound('wrong');
    }

    setCurrentQuestionIndex(prev => prev + 1);
    setRevealed(false);
  }, [activeQuestion, currentPlayerIndex]);

  const renderWinnerModal = () => {
    if (gameState !== 'finished') return null;

    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    const winner = sortedPlayers[0];

    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[var(--color-bg-dark)]/90 backdrop-blur-md animate-fade-in">
        <div className="vintage-panel w-full max-w-lg rounded-[2.5rem] md:rounded-[3rem] p-8 md:p-12 text-center max-h-[90vh] overflow-y-auto relative border-4 md:border-8 border-[var(--color-ink-black)] shadow-[8px_8px_0px_var(--color-ink-black)] md:shadow-[15px_15px_0px_var(--color-ink-black)]">
          <div className="absolute -top-4 md:-top-6 -right-4 md:-right-6 w-16 h-16 md:w-24 md:h-24 bg-[var(--color-primary-gold)] rounded-full border-4 border-[var(--color-ink-black)] flex items-center justify-center shadow-[4px_4px_0_var(--color-ink-black)] animate-wobble">
            <CartoonTrophy size={32} className="md:w-12 md:h-12" />
          </div>
          <h2 className="text-3xl md:text-6xl font-display text-[var(--color-ink-black)] mb-4 md:mb-6 drop-shadow-[2px_2px_0_var(--color-primary-gold)] md:drop-shadow-[4px_4px_0_var(--color-primary-gold)]">انتهى التحدي</h2>
          <div className="inline-block px-6 md:px-10 py-3 md:py-5 rounded-2xl md:rounded-[2rem] text-[var(--color-off-white)] text-xl md:text-3xl font-display mb-6 md:mb-8 border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)] md:shadow-[8px_8px_0_var(--color-ink-black)]" style={{backgroundColor: winner.color}}>
            الفائز: {winner.name}
          </div>
          <p className="text-[var(--color-bg-dark)] font-display text-xl md:text-3xl mb-8 md:mb-12 bg-[var(--color-off-white)] p-4 md:p-6 rounded-2xl md:rounded-3xl border-4 border-[var(--color-ink-black)] shadow-[inner_4px_4px_0_rgba(0,0,0,0.1)]">
            بمجموع <span className="text-[var(--color-primary-red)] text-3xl md:text-5xl">{winner.score}</span> نقطة
          </p>
          <button 
            onClick={() => onFinish(players)}
            className="vintage-button w-full py-4 md:py-8 rounded-2xl md:rounded-[2.5rem] text-2xl md:text-4xl font-display hover:scale-105 transition-transform"
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
        <div className="vintage-panel p-6 md:p-12 rounded-[2rem] md:rounded-[3rem] text-center max-w-2xl w-full relative z-10 border-4 md:border-8 border-[var(--color-ink-black)] shadow-[8px_8px_0_var(--color-ink-black)]">
          <div className="w-20 h-20 md:w-32 md:h-32 bg-[var(--color-primary-blue)]/20 rounded-full flex items-center justify-center border-4 border-[var(--color-ink-black)] mx-auto mb-6 md:mb-8 shadow-[4px_4px_0_var(--color-ink-black)] animate-bounce-cartoon">
            <CartoonTimer size={40} className="md:w-16 md:h-16" />
          </div>
          <h2 className="text-4xl md:text-8xl font-display text-[var(--color-ink-black)] mb-4 md:mb-6 drop-shadow-[2px_2px_0_var(--color-primary-blue)] md:drop-shadow-[4px_4px_0_var(--color-primary-blue)]">دور {currentPlayer.name}</h2>
          <p className="text-lg md:text-2xl text-[var(--color-bg-dark)] font-arabic font-bold mb-8 md:mb-12 leading-relaxed bg-[var(--color-off-white)] p-4 md:p-6 rounded-2xl md:rounded-3xl border-4 border-[var(--color-ink-black)] shadow-[inner_4px_4px_0_rgba(0,0,0,0.1)]">
            أمامك {settings.timedDuration} ثانية للإجابة على أكبر عدد ممكن من الأسئلة. 
            السرعة والتركيز هما مفتاح الفوز!
          </p>
          <button 
            onClick={handleStartTurn}
            className="w-full py-6 md:py-8 text-[var(--color-off-white)] rounded-2xl md:rounded-[2.5rem] text-3xl md:text-5xl font-display border-4 border-[var(--color-ink-black)] shadow-[6px_6px_0_var(--color-ink-black)] md:shadow-[8px_8px_0_var(--color-ink-black)] hover:scale-105 transition-transform"
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
        <div className="vintage-panel p-6 md:p-12 rounded-[2rem] md:rounded-[3rem] text-center max-w-2xl w-full relative z-10 border-4 md:border-8 border-[var(--color-ink-black)] shadow-[8px_8px_0_var(--color-ink-black)]">
          <div className="w-20 h-20 md:w-32 md:h-32 bg-[var(--color-primary-red)]/20 rounded-full flex items-center justify-center border-4 border-[var(--color-ink-black)] mx-auto mb-6 md:mb-8 shadow-[4px_4px_0_var(--color-ink-black)] animate-wobble">
            <CartoonTimer size={40} className="md:w-16 md:h-16" />
          </div>
          <h2 className="text-4xl md:text-8xl font-display text-[var(--color-ink-black)] mb-4 md:mb-6 drop-shadow-[2px_2px_0_var(--color-primary-red)] md:drop-shadow-[4px_4px_0_var(--color-primary-red)]">انتهى الوقت!</h2>
          <p className="text-xl md:text-3xl text-[var(--color-bg-dark)] font-arabic font-bold mb-8 md:mb-12 leading-relaxed bg-[var(--color-off-white)] p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] border-4 border-[var(--color-ink-black)] shadow-[inner_4px_4px_0_rgba(0,0,0,0.1)]">
            أحسنت يا {currentPlayer.name}، لقد حصدت <span className="text-[var(--color-primary-gold)] text-4xl md:text-6xl drop-shadow-[2px_2px_0_var(--color-ink-black)]">{roundScore}</span> نقطة في هذه الجولة.
          </p>
          <button 
            onClick={handleNextTurn}
            className="vintage-button w-full py-6 md:py-8 rounded-2xl md:rounded-[2.5rem] text-2xl md:text-4xl font-display hover:scale-105 transition-transform"
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
        <div className="vintage-panel p-4 md:p-6 rounded-[2rem] flex items-center gap-4 shrink-0 bg-[var(--color-off-white)] border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)]">
          <CartoonTimer size={32} className={`md:w-12 md:h-12 ${timeLeft <= 10 ? 'animate-pulse' : ''}`} />
          <div className={`text-4xl md:text-7xl font-display ${timeLeft <= 10 ? 'text-[var(--color-primary-red)] animate-pulse' : 'text-[var(--color-ink-black)]'}`}>
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
          </div>
          <div className="text-[var(--color-off-white)] bg-[var(--color-ink-black)] px-3 md:px-4 py-1 rounded-xl border-2 border-[var(--color-ink-black)] text-[10px] md:text-sm font-display uppercase tracking-widest">الوقت</div>
        </div>

        {/* Scores */}
        {players.map((p, idx) => {
          const isCurrent = idx === currentPlayerIndex;
          return (
            <div 
              key={p.id} 
              className={`flex-1 min-w-[140px] md:min-w-[180px] vintage-panel p-3 md:p-5 rounded-[1.5rem] md:rounded-[2rem] flex items-center gap-3 md:gap-5 transform transition-all border-4 border-[var(--color-ink-black)] ${isCurrent ? 'scale-105 md:scale-110 ring-4 ring-[var(--color-primary-gold)] shadow-[6px_6px_0_var(--color-ink-black)] md:shadow-[8px_8px_0_var(--color-ink-black)]' : 'opacity-70 hover:opacity-100 shadow-[4px_4px_0_var(--color-ink-black)]'}`}
            >
              <div 
                className="w-10 h-10 md:w-16 md:h-16 rounded-xl md:rounded-2xl flex items-center justify-center text-[var(--color-off-white)] text-xl md:text-4xl font-display shrink-0 border-4 border-[var(--color-ink-black)] shadow-[2px_2px_0_var(--color-ink-black)] md:shadow-[4px_4px_0_var(--color-ink-black)]" 
                style={{backgroundColor: p.color}}
              >
                {p.score}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-[var(--color-bg-dark)] text-[8px] md:text-[10px] font-display uppercase tracking-widest mb-1 bg-[var(--color-primary-gold)] px-2 py-0.5 md:py-1 rounded-lg border-2 border-[var(--color-ink-black)] inline-block w-fit">
                  النقاط
                  {isCurrent && <span className="mr-2 text-[var(--color-primary-red)] text-[8px] md:text-[10px]">● دورك</span>}
                </span>
                <p className="text-lg md:text-3xl font-display text-[var(--color-ink-black)] truncate w-full">{p.name}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Question Area */}
      {activeQuestion && (
        <div className="w-full max-w-4xl px-4 animate-fade-in relative z-10">
          <div className="vintage-panel rounded-[2rem] md:rounded-[3rem] p-6 md:p-12 text-center relative overflow-hidden border-4 md:border-8 border-[var(--color-ink-black)] shadow-[8px_8px_0px_var(--color-ink-black)]">
            <div className="absolute top-0 left-0 right-0 h-2 md:h-3 bg-[var(--color-ink-black)]/10 overflow-hidden">
              <div 
                className={`h-full transition-all duration-1000 ${timeLeft <= 10 ? 'bg-[var(--color-primary-red)]' : 'bg-[var(--color-primary-green)]'}`}
                style={{ width: `${(timeLeft / settings.timedDuration) * 100}%` }}
              />
            </div>

            <div className="space-y-6 md:space-y-8 mt-4 md:mt-6 bg-[var(--color-off-white)]/50 p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] border-4 border-[var(--color-ink-black)] shadow-[inner_4px_4px_0_rgba(0,0,0,0.1)]">
              <div className="flex flex-wrap justify-center gap-3 md:gap-4">
                <p className="px-4 md:px-6 py-1 md:py-2 bg-[var(--color-primary-blue)] text-[var(--color-off-white)] border-2 md:border-4 border-[var(--color-ink-black)] rounded-lg md:rounded-xl font-display tracking-widest uppercase text-[10px] md:text-sm shadow-[3px_3px_0_var(--color-ink-black)] md:shadow-[4px_4px_0_var(--color-ink-black)]">
                  السؤال {currentQuestionIndex + 1}
                </p>
                <p className="px-4 md:px-6 py-1 md:py-2 bg-[var(--color-primary-gold)] text-[var(--color-ink-black)] border-2 md:border-4 border-[var(--color-ink-black)] rounded-lg md:rounded-xl font-display tracking-widest uppercase text-[10px] md:text-sm shadow-[3px_3px_0_var(--color-ink-black)] md:shadow-[4px_4px_0_var(--color-ink-black)]">
                  {activeQuestion.category}
                </p>
              </div>
              
              <h3 className="text-3xl md:text-6xl font-display text-[var(--color-ink-black)] leading-tight drop-shadow-[1px_1px_0_rgba(0,0,0,0.1)] md:drop-shadow-[2px_2px_0_rgba(0,0,0,0.1)]">
                {activeQuestion.text}
              </h3>

              {isFetching && localQuestions.length - currentQuestionIndex < 2 && (
                <div className="flex items-center justify-center gap-2 text-[var(--color-bg-dark)] font-bold animate-pulse">
                  <CartoonBot size={20} className="animate-spin-slow" />
                  <span>جاري تحضير المزيد من الأسئلة...</span>
                </div>
              )}

              {!revealed ? (
                <div className="pt-6 md:pt-10 flex flex-col gap-4 md:gap-6">
                  <button 
                    onClick={() => setRevealed(true)}
                    className="vintage-button w-full md:w-auto px-8 md:px-16 py-4 md:py-8 rounded-2xl md:rounded-[2.5rem] text-2xl md:text-4xl font-display flex items-center justify-center gap-4 md:gap-6"
                  >
                    <CartoonEye size={32} className="md:w-12 md:h-12" />
                    <span>إظهار الإجابة</span>
                  </button>
                  <button 
                    onClick={() => handleAnswer(false)}
                    className="vintage-panel bg-[var(--color-off-white)] w-full md:w-auto px-6 md:px-12 py-3 md:py-6 rounded-xl md:rounded-[2rem] text-lg md:text-2xl font-display flex items-center justify-center gap-3 md:gap-4 border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0_var(--color-ink-black)] hover:scale-105 transition-transform"
                  >
                    <CartoonSkip size={24} className="md:w-8 md:h-8" />
                    <span>تخطي السؤال</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-6 md:space-y-10 animate-fade-up pt-6 md:pt-10 border-t-4 border-[var(--color-ink-black)]/10">
                  <div className="p-6 md:p-10 bg-[var(--color-off-white)] rounded-[1.5rem] md:rounded-[2.5rem] border-4 border-[var(--color-ink-black)] relative shadow-[6px_6px_0_var(--color-ink-black)] md:shadow-[8px_8px_0_var(--color-ink-black)]">
                    <p className="absolute -top-4 md:-top-6 left-1/2 -translate-x-1/2 bg-[var(--color-bg-dark)] text-[var(--color-off-white)] px-6 md:px-8 py-1 md:py-2 rounded-xl md:rounded-2xl text-sm md:text-lg font-display border-4 border-[var(--color-ink-black)]">الإجابة</p>
                    <p className="text-3xl md:text-7xl font-display text-[var(--color-primary-blue)] mt-2 md:mt-4 drop-shadow-[1px_1px_0_var(--color-ink-black)] md:drop-shadow-[2px_2px_0_var(--color-ink-black)]">{activeQuestion.answer}</p>
                  </div>

                  <div className="flex flex-col md:flex-row gap-4 md:gap-6">
                    <button 
                      onClick={() => handleAnswer(true)}
                      className="flex-1 py-4 md:py-8 rounded-2xl md:rounded-[2.5rem] text-[var(--color-off-white)] text-2xl md:text-4xl font-display border-4 border-[var(--color-ink-black)] shadow-[6px_6px_0_var(--color-ink-black)] md:shadow-[8px_8px_0_var(--color-ink-black)] flex items-center justify-center gap-3 md:gap-4 hover:scale-105 transition-transform"
                      style={{ backgroundColor: currentPlayer.color }}
                    >
                      <CartoonCheck size={32} className="md:w-12 md:h-12" />
                      <span>صح</span>
                    </button>
                    <button 
                      onClick={() => handleAnswer(false)}
                      className="flex-1 py-4 md:py-8 bg-[var(--color-primary-red)] text-[var(--color-off-white)] rounded-2xl md:rounded-[2.5rem] text-2xl md:text-4xl font-display border-4 border-[var(--color-ink-black)] shadow-[6px_6px_0_var(--color-ink-black)] md:shadow-[8px_8px_0_var(--color-ink-black)] flex items-center justify-center gap-3 md:gap-4 hover:scale-105 transition-transform"
                    >
                      <CartoonX size={32} className="md:w-12 md:h-12" />
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
