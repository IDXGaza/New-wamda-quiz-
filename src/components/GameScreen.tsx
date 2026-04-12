import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { Type } from "@google/genai";
import { GameConfig, GameMode, Question, Player, Difficulty, QuestionType, PowerType } from '../types';
import BuzzerScreen from './BuzzerScreen';
import TimedChallengeScreen from './TimedChallengeScreen';
import SilentGuessScreen from './SilentGuessScreen';
import TrueFalseScreen from './TrueFalseScreen';
const HexGrid = lazy(() => import('./HexGrid'));
import { useSettings } from '../contexts/SettingsContext';
import { extractJson, getAI, generateQuestions, fetchSingleQuestion } from '../services/geminiService';
import { playSound } from '../utils/sound';
import { useToast } from '../contexts/ToastContext';
import { 
  CartoonSnowflake, 
  CartoonShield, 
  CartoonStar, 
  CartoonCheck, 
  CartoonAlert, 
  CartoonRocket,
  CartoonBook,
  CartoonHome,
  CartoonGear,
  CartoonLock,
  CartoonGhost,
  CartoonBot,
  CartoonEye,
  CartoonSearch
} from './CartoonIcons';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  config: GameConfig;
  questions: Question[];
  players: Player[];
  onFinish: (players: Player[]) => void;
}

const TIMER_DURATION = 20;
const HISTORY_KEY = 'gemini_quiz_question_history';

const LETTERS_FLAT = [
  'أ', 'ب', 'ت', 'ث', 'ج', 'ح',
  'خ', 'د', 'ذ', 'ر', 'ز',
  'س', 'ش', 'ص', 'ض', 'ط', 'ظ',
  'ع', 'غ', 'ف', 'ق', 'ك',
  'ل', 'م', 'ن', 'ه', 'و', 'ي'
];

const GameScreen: React.FC<Props> = ({ config, questions, players: initialPlayers, onFinish }) => {
  const { settings } = useSettings();
  const { showToast } = useToast();

  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [answeredMap, setAnsweredMap] = useState<Record<string, string>>({}); 
  const [revealed, setRevealed] = useState(false);
  const [showScoring, setShowScoring] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATION);
  const [winner, setWinner] = useState<Player | null>(null);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const [winningPath, setWinningPath] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editedQuestion, setEditedQuestion] = useState<Partial<Question>>({});
  
  // Question history to avoid repeats
  const [questionHistory, setQuestionHistory] = useState<string[]>([]);
  const [finalAnswers, setFinalAnswers] = useState<Record<string, string>>({});

  // Powers state
  const [frozenCells, setFrozenCells] = useState<Record<string, number>>({}); // cellId -> rounds remaining
  const [shieldedCells, setShieldedCells] = useState<Record<string, boolean>>({}); // cellId -> isShielded
  const [stolenCells, setStolenCells] = useState<Record<string, boolean>>({}); // cellId -> wasStolen
  const [activePower, setActivePower] = useState<PowerType | null>(null);
  const [powerInUse, setPowerInUse] = useState<PowerType | null>(null);

  const questionCache = useRef<Record<string, Question>>({});

  // Initialize cache with manual questions or start background pre-fetching for AI
  useEffect(() => {
    // Load history
    try {
      const data = localStorage.getItem(HISTORY_KEY);
      if (data) {
        const history: string[][] = JSON.parse(data);
        setQuestionHistory(history.flat());
      }
    } catch (e) {
      console.error("Failed to load history", e);
    }

    if (config.mode === GameMode.HEX_GRID) {
      if (config.hexMode === 'manual' && config.hexManualQuestions) {
        const cache: Record<string, Question> = {};
        Object.entries(config.hexManualQuestions).forEach(([letter, data]) => {
          const qData = data as { question: string; answer: string };
          cache[letter] = {
            id: `manual-${letter}`,
            text: qData.question,
            answer: qData.answer,
            category: 'يدوي',
            points: 100,
            letter: letter,
            type: QuestionType.OPEN,
            difficulty: config.difficulty
          };
        });
        questionCache.current = cache;
      }
    }
  }, [config]);

  const grid: Question[][] = useMemo(() => {
    if (!players || players.length === 0) return [];
    
    if (config.mode === GameMode.HEX_GRID) {
      // 6-5-6-5-6 grid for HEX_GRID (28 letters)
      const rowSizes = [6, 5, 6, 5, 6];
      const rows: Question[][] = [];
      let idx = 0;

      rowSizes.forEach((size, rIdx) => {
        const row: Question[] = [];
        for (let cIdx = 0; cIdx < size; cIdx++) {
          const q = questions[idx];
          const displayLetter = q?.letter || LETTERS_FLAT[idx] || '?';
          
          if (q) {
            row.push({
              ...q,
              id: `${rIdx}-${cIdx}`,
              letter: displayLetter
            });
          } else {
            row.push({
              id: `${rIdx}-${cIdx}`,
              text: '',
              answer: '',
              category: '',
              points: 100,
              letter: displayLetter,
              type: QuestionType.OPEN,
              difficulty: config.difficulty
            });
          }
          idx++;
        }
        rows.push(row);
      });
      return rows;
    } else {
      // Classic GRID layout (e.g. Jeopardy) - 5 categories x 5 questions
      const layout = [5, 5, 5, 5, 5];
      const cols: Question[][] = [[], [], [], [], []];
      let currentIdx = 0;
      layout.forEach((count, colIdx) => {
        for (let i = 0; i < count; i++) {
          if (questions[currentIdx]) {
            cols[colIdx].push(questions[currentIdx]);
            currentIdx++;
          }
        }
      });
      return cols;
    }
  }, [questions, config.mode, config.difficulty]);

  const checkPath = useCallback((color: string) => {
    if (config.mode !== GameMode.HEX_GRID || !grid || grid.length === 0) return false;
    
    const rowSizes = [6, 5, 6, 5, 6];
    const visited = new Set<string>();
    const queue: { r: number; c: number; path: string[] }[] = [];

    const getNeighbors = (r: number, c: number) => {
      const isEvenRow = r % 2 === 0;
      let neighbors: [number, number][] = [];
      
      if (isEvenRow) {
        // Even row (6 items)
        neighbors = [
          [r, c - 1], [r, c + 1], // same row
          [r - 1, c - 1], [r - 1, c], // row above
          [r + 1, c - 1], [r + 1, c], // row below
        ];
      } else {
        // Odd row (5 items)
        neighbors = [
          [r, c - 1], [r, c + 1], // same row
          [r - 1, c], [r - 1, c + 1], // row above
          [r + 1, c], [r + 1, c + 1], // row below
        ];
      }
      
      return neighbors.filter(([nr, nc]) => {
        if (nr < 0 || nr >= rowSizes.length) return false;
        if (nc < 0 || nc >= rowSizes[nr]) return false;
        return true;
      });
    };

    if (color === players[0]?.color) { // Red: Left to Right
      for (let r = 0; r < rowSizes.length; r++) {
        if (grid[r] && grid[r][0] && answeredMap[grid[r][0].id] === color) {
          queue.push({ r, c: 0, path: [grid[r][0].id] });
          visited.add(`${r},0`);
        }
      }
      
      while (queue.length > 0) {
        const { r, c, path } = queue.shift()!;
        if (c === rowSizes[r] - 1) {
          setWinningPath(path);
          return true;
        }
        
        for (const [nr, nc] of getNeighbors(r, c)) {
          const nq = grid[nr][nc];
          const key = `${nr},${nc}`;
          if (nq && answeredMap[nq.id] === color && !visited.has(key)) {
            visited.add(key);
            queue.push({ r: nr, c: nc, path: [...path, nq.id] });
          }
        }
      }
    } else if (color === players[1]?.color) { // Green: Top to Bottom
      for (let c = 0; c < rowSizes[0]; c++) {
        if (grid[0] && grid[0][c] && answeredMap[grid[0][c].id] === color) {
          queue.push({ r: 0, c, path: [grid[0][c].id] });
          visited.add(`0,${c}`);
        }
      }
      
      while (queue.length > 0) {
        const { r, c, path } = queue.shift()!;
        if (r === rowSizes.length - 1) {
          setWinningPath(path);
          return true;
        }
        
        for (const [nr, nc] of getNeighbors(r, c)) {
          const nq = grid[nr][nc];
          const key = `${nr},${nc}`;
          if (nq && answeredMap[nq.id] === color && !visited.has(key)) {
            visited.add(key);
            queue.push({ r: nr, c: nc, path: [...path, nq.id] });
          }
        }
      }
    }
    return false;
  }, [grid, answeredMap, config.mode, players]);

  const handleAnswer = useCallback((playerId: string | null, isCorrect: boolean) => {
    if (!activeQuestion) return;
    
    let newPlayers = [...players];
    let updatedAnsweredMap = { ...answeredMap };
    
    if (activeQuestion.answer) {
      setFinalAnswers(prev => ({ ...prev, [activeQuestion.id]: activeQuestion.answer }));
    }

    if (playerId && isCorrect) {
      playSound('correct');
      const player = players.find(p => p.id === playerId);
      if (player) {
        updatedAnsweredMap[activeQuestion.id] = player.color;
        setAnsweredMap(updatedAnsweredMap);
        
        // Add points to the player
        const pts = activeQuestion.points || 100;
        newPlayers = players.map(p => 
          p.id === playerId ? { ...p, score: p.score + pts } : p
        );
        
        // If it was a steal, remove shield if any
        if (powerInUse === PowerType.STEAL) {
          setShieldedCells(prev => ({ ...prev, [activeQuestion.id]: false }));
          setStolenCells(prev => ({ ...prev, [activeQuestion.id]: true }));
        }

        // Close question after a correct answer
        setActiveQuestion(null);
        setRevealed(false);
        setShowScoring(false);
      }
    } else if (playerId && !isCorrect) {
      playSound('wrong');
      // Wrong answer - subtract points in Grid mode
      newPlayers = players.map(p => {
        if (p.id === playerId) {
          const pts = activeQuestion.points || 100;
          const scoreChange = config.mode === GameMode.GRID ? -pts : 0;
          return { ...p, score: Math.max(0, p.score + scoreChange) };
        }
        return p;
      });
      setPlayers(newPlayers);
      
      // If it's HEX_GRID, turn switches and question closes
      if (config.mode === GameMode.HEX_GRID) {
        setActiveQuestion(null);
        setRevealed(false);
        setShowScoring(false);
      }
      // In GRID mode, we stay on the question so others can try
    } else if (!playerId && !isCorrect) {
      playSound('wrong');
      // Mark as skipped/no one answered
      updatedAnsweredMap[activeQuestion.id] = '#475569'; // slate-600
      setAnsweredMap(updatedAnsweredMap);
      setActiveQuestion(null);
      setRevealed(false);
      setShowScoring(false);
    }

    if (playerId) {
      setPlayers(newPlayers);
    }

    // Switch turn if it's HEX_GRID mode and turn is over
    if (config.mode === GameMode.HEX_GRID && (isCorrect || !isCorrect || !playerId)) {
      setCurrentPlayerIndex(prev => (prev + 1) % players.length);
      setActivePower(null);
      setPowerInUse(null);
      
      setFrozenCells(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(id => {
          next[id] -= 1;
          if (next[id] <= 0) delete next[id];
        });
        return next;
      });
    }

    if (!activeQuestion) {
      setTimeLeft(TIMER_DURATION);
    }
  }, [activeQuestion, players, answeredMap, config.mode, activePower, powerInUse]);

  useEffect(() => {
    // Check for winner whenever answeredMap changes
    if (config.mode === GameMode.HEX_GRID) {
      players.forEach(p => {
        if (checkPath(p.color)) {
          if (!winner) playSound('win');
          setWinner(p);
        }
      });
    } else if (config.mode === GameMode.GRID) {
      if (Object.keys(answeredMap).length === questions.length && questions.length > 0) {
        const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
        if (!winner) playSound('win');
        setWinner(sortedPlayers[0]);
      }
    }
  }, [answeredMap, checkPath, players, config.mode, questions.length, winner]);

  useEffect(() => {
    let timer: number;
    if (activeQuestion && !revealed) {
      timer = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            handleAnswer(null, false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [activeQuestion, revealed, handleAnswer]);

  useEffect(() => {
    if (activeQuestion) {
      setTimeLeft(TIMER_DURATION);
      setRevealed(false);
    }
  }, [activeQuestion]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeQuestion) return;
      
      // Don't trigger shortcuts if user is typing in an input (e.g., editing question)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setRevealed(true);
      } else if (e.code === 'Escape') {
        e.preventDefault();
        handleAnswer(null, false);
      } else if (e.key >= '1' && e.key <= '9') {
        const playerIdx = parseInt(e.key) - 1;
        if (playerIdx < players.length) {
          e.preventDefault();
          handleAnswer(players[playerIdx].id, true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeQuestion, players, handleAnswer]);

  const jeopardyGrid = useMemo(() => {
    if (config.mode !== GameMode.GRID) return {};
    const categories: Record<string, Question[]> = {};
    
    if (!questions || questions.length === 0) return {};

    questions.forEach(q => {
      const catName = q.category || 'عام';
      if (!categories[catName]) {
        categories[catName] = [];
      }
      categories[catName].push(q);
    });
    // Sort questions by points within each category
    Object.keys(categories).forEach(cat => {
      categories[cat].sort((a, b) => (a.points || 0) - (b.points || 0));
    });
    return categories;
  }, [questions, config.mode, config.categories]);

  const renderJeopardyBoard = () => {
    const categories = Object.keys(jeopardyGrid);
    // Use provided categories order if available
    const displayCategories = config.categories && config.categories.length > 0 
      ? config.categories.filter(c => categories.includes(c))
      : categories;

    if (displayCategories.length === 0 && categories.length > 0) {
      // Fallback to all categories if filter resulted in empty
      return (
        <div className="w-full max-w-7xl mx-auto vintage-panel p-6 md:p-8 overflow-x-auto relative">
          <div className={`grid gap-4 md:gap-6 min-w-[800px] md:min-w-0 relative z-10`} style={{ gridTemplateColumns: `repeat(${categories.length}, 1fr)` }}>
            {categories.map((cat, i) => (
              <div key={i} className="space-y-4 md:space-y-6">
                <div className="bg-white/10 border border-white/20 text-white p-4 rounded-2xl text-center h-28 flex items-center justify-center backdrop-blur-sm transition-all duration-300 hover:bg-white/15">
                  <h3 className="font-bold text-xl md:text-2xl leading-tight">{cat}</h3>
                </div>
                {jeopardyGrid[cat].map((q) => {
                  const isAnswered = !!answeredMap[q.id];
                  const color = answeredMap[q.id];
                  
                  return (
                    <button
                      key={q.id}
                      disabled={isAnswered}
                      onClick={() => {
                        setActiveQuestion(q);
                        setEditedQuestion(q);
                        setIsEditing(false);
                      }}
                      className={`w-full aspect-[4/3] vintage-card transition-all duration-300 flex items-center justify-center relative overflow-hidden group ${
                        isAnswered 
                          ? 'opacity-60 cursor-not-allowed scale-95' 
                          : 'hover:scale-105 hover:shadow-[0_0_20px_var(--color-primary-gold)]'
                      }`}
                      style={isAnswered ? { backgroundColor: color, borderColor: 'transparent' } : {}}
                    >
                      {!isAnswered && (
                        <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
                      )}
                      {isAnswered ? (
                        <div className="flex flex-col items-center justify-center animate-pop-in">
                          <CartoonCheck className="w-12 h-12 mb-2" />
                          <span className="text-sm bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm text-[var(--color-off-white)] font-bold">مكتمل</span>
                        </div>
                      ) : (
                        <span className="vintage-text text-5xl text-[var(--color-primary-gold)] drop-shadow-[2px_2px_0px_var(--color-ink-black)]">{q.points}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (categories.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24 vintage-panel w-full max-w-4xl mx-auto relative overflow-hidden">
          <div className="text-8xl mb-8 animate-pulse-glow text-indigo-400 relative z-10">
            <CartoonSearch size={128} />
          </div>
          <h3 className="text-3xl font-bold text-white mb-4 relative z-10">لم يتم العثور على أسئلة</h3>
          <p className="text-indigo-200 font-medium bg-indigo-900/30 px-6 py-3 rounded-xl border border-indigo-500/30 relative z-10 backdrop-blur-sm">حاول إعادة البدء بموضوع مختلف</p>
        </div>
      );
    }

    return (
      <div className="w-full max-w-7xl mx-auto vintage-panel p-4 md:p-8 overflow-x-auto relative">
        <div className={`grid gap-3 md:gap-6 min-w-max md:min-w-0 relative z-10`} style={{ gridTemplateColumns: `repeat(${displayCategories.length}, 1fr)` }}>
          {displayCategories.map((cat, i) => (
            <div key={i} className="space-y-3 md:space-y-6 min-w-[140px] md:min-w-0">
              <div className="bg-white/10 border border-white/20 text-white p-3 md:p-4 rounded-2xl text-center h-20 md:h-28 flex items-center justify-center backdrop-blur-sm transition-all duration-300 hover:bg-white/15">
                <h3 className="font-bold text-lg md:text-2xl leading-tight">{cat}</h3>
              </div>
              {jeopardyGrid[cat].map((q) => {
                const isAnswered = !!answeredMap[q.id];
                const color = answeredMap[q.id];

                return (
                  <button
                    key={q.id}
                    disabled={isAnswered}
                    onClick={() => {
                      setActiveQuestion(q);
                      setEditedQuestion(q);
                      setIsEditing(false);
                    }}
                    className={`w-full aspect-video md:aspect-[4/3] vintage-card transition-all duration-300 flex items-center justify-center relative overflow-hidden group ${
                      isAnswered 
                        ? 'opacity-60 cursor-not-allowed scale-95' 
                        : 'hover:scale-105 hover:shadow-[0_0_20px_var(--color-primary-gold)]'
                    }`}
                    style={isAnswered ? { backgroundColor: color, borderColor: 'transparent' } : {}}
                  >
                    {!isAnswered && (
                      <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-300"></div>
                    )}
                    {isAnswered ? (
                      <div className="flex flex-col items-center justify-center animate-pop-in">
                        <CartoonCheck size={32} className="mb-1" />
                        <span className="text-[10px] md:text-sm bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm text-[var(--color-off-white)]">مكتمل</span>
                      </div>
                    ) : (
                      <span className="vintage-text text-2xl md:text-4xl text-[var(--color-primary-gold)]">{q.points}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const fetchQuestion = async (letter: string, silent: boolean = false, forceDifficulty?: Difficulty): Promise<Question> => {
    const diff = forceDifficulty || config.difficulty;
    const cacheKey = forceDifficulty ? `${letter}-steal-${Date.now()}` : letter;

    if (!forceDifficulty && questionCache.current[cacheKey]) {
      return questionCache.current[cacheKey];
    }

    if (!silent) setIsLoadingQuestion(true);
    try {
      const q = await fetchSingleQuestion(
        letter,
        config.topic || 'عام',
        diff,
        settings.aiModel,
        [...questionHistory, ...Object.values(finalAnswers)]
      );
      
      if (!forceDifficulty) {
        questionCache.current[cacheKey] = q;
      }
      return q;
    } finally {
      if (!silent) setIsLoadingQuestion(false);
    }
  };

  const handleHexClick = async (q: Question) => {
    if (isLoadingQuestion) return;
    
    const isFrozen = frozenCells[q.id] > 0;
    const isShielded = shieldedCells[q.id];
    const currentColor = answeredMap[q.id];
    const player = players[currentPlayerIndex];

    // If cell is frozen, nobody can click it
    if (isFrozen) {
      showToast("هذه الخلية مجمدة حالياً!", "error");
      return;
    }

    // If using FREEZE power
    if (activePower === PowerType.FREEZE) {
      if (currentColor) {
        showToast("لا يمكنك تجميد خلية محتلة!", "error");
        return;
      }
      setFrozenCells(prev => ({ ...prev, [q.id]: players.length })); // Freeze for one full round
      // Consume power
      setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, powers: { ...p.powers, [PowerType.FREEZE]: p.powers[PowerType.FREEZE] - 1 } } : p));
      setActivePower(null);
      setCurrentPlayerIndex(prev => (prev + 1) % players.length);
      return;
    }

    // If using SHIELD power
    if (activePower === PowerType.SHIELD) {
      if (currentColor !== player.color) {
        showToast("يمكنك حماية خلاياك فقط!", "error");
        return;
      }
      setShieldedCells(prev => ({ ...prev, [q.id]: true }));
      // Consume power
      setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, powers: { ...p.powers, [PowerType.SHIELD]: p.powers[PowerType.SHIELD] - 1 } } : p));
      setActivePower(null);
      setCurrentPlayerIndex(prev => (prev + 1) % players.length);
      return;
    }

    // If using STEAL power
    if (activePower === PowerType.STEAL) {
      if (!currentColor || currentColor.toLowerCase() === player.color.toLowerCase()) {
        showToast("يمكنك سرقة خلايا الخصم فقط!", "error");
        return;
      }
      if (isShielded) {
        showToast("هذه الخلية محمية بدرع!", "error");
        return;
      }
      // Proceed to question but it will be HARD
    } else {
      // Normal click
      if (currentColor) return;
    }

    setIsLoadingQuestion(true);
    try {
      if (config.hexMode === 'ai' || activePower === PowerType.STEAL) {
        let finalQ = q;
        if (activePower === PowerType.STEAL || !q.text) {
          const diff = activePower === PowerType.STEAL ? Difficulty.HARD : q.difficulty;
          
          if (config.mode === GameMode.HEX_GRID && q.letter) {
            // Use fetchQuestion to ensure the letter is respected for Hex Grid steals
            finalQ = await fetchQuestion(q.letter, false, diff);
          } else {
            const generated = await generateQuestions(config.topic, 1, [q.type], config.mode, diff, settings.aiModel, q.category ? [q.category] : undefined, questionHistory);
            finalQ = { ...q, ...generated[0] };
          }
        }
        
        // Check if we got a fallback question
        if (finalQ.id.startsWith('static-') || (finalQ.text && finalQ.text.includes('حدث خطأ'))) {
          showToast("تم استخدام سؤال احتياطي بسبب مشكلة في الاتصال بالذكاء الاصطناعي", "warning");
        }
        
        // Consume power only if question loaded successfully
        if (activePower === PowerType.STEAL) {
          setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, powers: { ...p.powers, [PowerType.STEAL]: p.powers[PowerType.STEAL] - 1 } } : p));
        }
        
        setActiveQuestion(finalQ);
      } else {
        setActiveQuestion(q);
      }
      setPowerInUse(activePower);
      setActivePower(null);
      setRevealed(false);
      setShowScoring(false);
      setTimeLeft(TIMER_DURATION);
    } catch (error) {
      showToast("حدث خطأ أثناء تحميل السؤال", "error");
      setActiveQuestion(null);
    } finally {
      setIsLoadingQuestion(false);
    }
  };

  const handleSaveEdit = () => {
    if (activeQuestion && editedQuestion) {
      const updatedQ = { ...activeQuestion, ...editedQuestion } as Question;
      setActiveQuestion(updatedQ);
      setIsEditing(false);
    }
  };

  const renderActiveQuestion = () => {
    if (!activeQuestion && !isLoadingQuestion) return null;

    return (
      <AnimatePresence>
        {(activeQuestion || isLoadingQuestion) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={`w-full max-w-3xl rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-12 vintage-panel relative overflow-y-auto max-h-[95vh] text-center border-4 md:border-8 border-[var(--color-ink-black)] shadow-[8px_8px_0px_var(--color-ink-black)] md:shadow-[12px_12px_0px_var(--color-ink-black)] ${
                powerInUse === PowerType.STEAL ? 'ring-4 md:ring-8 ring-[var(--color-primary-red)]' : ''
              }`}
            >
              {powerInUse === PowerType.STEAL && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--color-primary-red)] text-white px-8 py-3 rounded-2xl font-black text-xl shadow-[6px_6px_0px_var(--color-ink-black)] z-50 animate-wobble border-4 border-[var(--color-ink-black)]">
                  محاولة سرقة!
                </div>
              )}
              
              {!isLoadingQuestion && (
                <div className="absolute top-0 left-0 right-0 h-4 bg-[var(--color-ink-black)]/10 overflow-hidden">
                  <motion.div 
                    initial={{ width: "100%" }}
                    animate={{ width: `${(timeLeft / TIMER_DURATION) * 100}%` }}
                    className={`h-full transition-colors duration-300 ${timeLeft <= 5 ? 'bg-[var(--color-primary-red)]' : 'bg-[var(--color-primary-green)]'}`}
                  />
                </div>
              )}

              <div className={`absolute top-4 md:top-8 left-4 md:left-8 font-black text-2xl md:text-3xl w-12 h-12 md:w-16 md:h-16 flex items-center justify-center rounded-xl md:rounded-2xl z-20 border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)] ${
                timeLeft <= 5 ? 'bg-[var(--color-primary-red)] text-white animate-bounce' : 'bg-[var(--color-primary-gold)] text-[var(--color-ink-black)]'
              }`}>
                {timeLeft}
              </div>
              
              {isLoadingQuestion ? (
                <div className="flex flex-col items-center gap-8 py-20 relative z-10">
                  <div className="w-32 h-32 rounded-3xl bg-[var(--color-primary-gold)] flex items-center justify-center border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0px_var(--color-ink-black)] animate-wobble">
                    <CartoonBot size={64} />
                  </div>
                  <h3 className="text-4xl font-black text-[var(--color-ink-black)] vintage-text">جاري التفكير...</h3>
                </div>
              ) : activeQuestion && (
                <div className="relative z-10 mt-12">
                  {isEditing ? (
                    <div className="space-y-8 text-right">
                      <h3 className="text-3xl font-black text-[var(--color-ink-black)] mb-8 vintage-text">تعديل السؤال</h3>
                      <div className="space-y-6">
                        <div>
                          <label className="block text-lg font-bold text-[var(--color-bg-dark)] mb-3">نص السؤال</label>
                          <textarea 
                            value={editedQuestion.text || ''} 
                            onChange={e => setEditedQuestion({...editedQuestion, text: e.target.value})}
                            className="w-full p-6 bg-[var(--color-off-white)] border-4 border-[var(--color-ink-black)] rounded-2xl outline-none text-xl font-bold shadow-[4px_4px_0px_var(--color-ink-black)] focus:shadow-none transition-all"
                            rows={3}
                          />
                        </div>
                        <div>
                          <label className="block text-lg font-bold text-[var(--color-bg-dark)] mb-3">الإجابة</label>
                          <input 
                            type="text"
                            value={editedQuestion.answer || ''} 
                            onChange={e => setEditedQuestion({...editedQuestion, answer: e.target.value})}
                            className="w-full p-6 bg-[var(--color-off-white)] border-4 border-[var(--color-ink-black)] rounded-2xl outline-none text-xl font-bold shadow-[4px_4px_0px_var(--color-ink-black)] focus:shadow-none transition-all"
                          />
                        </div>
                      </div>
                      <div className="flex gap-6 mt-10">
                        <button onClick={handleSaveEdit} className="flex-1 py-5 bg-[var(--color-primary-green)] text-white rounded-2xl font-black text-xl border-4 border-[var(--color-ink-black)] shadow-[6px_6px_0px_var(--color-ink-black)] active:translate-y-1 active:shadow-none">حفظ</button>
                        <button onClick={() => setIsEditing(false)} className="flex-1 py-5 bg-[var(--color-bg-cream)] text-[var(--color-ink-black)] rounded-2xl font-black text-xl border-4 border-[var(--color-ink-black)] shadow-[6px_6px_0px_var(--color-ink-black)] active:translate-y-1 active:shadow-none">إلغاء</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-10">
                      <div className="flex justify-center -mt-24">
                        <div className="w-28 h-28 rounded-[2rem] bg-[var(--color-primary-gold)] flex items-center justify-center text-[var(--color-ink-black)] font-black text-5xl border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0px_var(--color-ink-black)] vintage-text">
                          {config.mode === GameMode.GRID 
                            ? activeQuestion.points 
                            : (activeQuestion.letter || (activeQuestion.answer ? activeQuestion.answer[0] : '?'))}
                        </div>
                      </div>

                      <div className="p-6 md:p-12 rounded-3xl bg-[var(--color-off-white)] border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)] md:shadow-[8px_8px_0px_var(--color-ink-black)]">
                        <h3 className="text-2xl md:text-5xl font-black leading-tight text-[var(--color-ink-black)] vintage-text">
                          {activeQuestion.text}
                        </h3>
                      </div>

                      <div className="flex justify-center gap-4">
                        <span className="px-6 py-2 bg-[var(--color-accent-sky)] text-[var(--color-ink-black)] rounded-xl font-black border-2 border-[var(--color-ink-black)] text-sm shadow-[3px_3px_0px_var(--color-ink-black)]">{activeQuestion.category}</span>
                        <span className={`px-6 py-2 rounded-xl font-black border-2 border-[var(--color-ink-black)] text-sm shadow-[3px_3px_0px_var(--color-ink-black)] ${
                          activeQuestion.difficulty === Difficulty.EASY ? 'bg-[var(--color-primary-green)] text-white' :
                          activeQuestion.difficulty === Difficulty.MEDIUM ? 'bg-[var(--color-primary-gold)] text-[var(--color-ink-black)]' :
                          'bg-[var(--color-primary-red)] text-white'
                        }`}>
                          {activeQuestion.difficulty === Difficulty.EASY ? 'سهل' : 
                           activeQuestion.difficulty === Difficulty.MEDIUM ? 'متوسط' : 'صعب'}
                        </span>
                      </div>

                      <div className="flex flex-col gap-6 pt-6">
                        {!revealed ? (
                          <button 
                            onClick={() => setRevealed(true)}
                            className="vintage-button w-full py-6 rounded-2xl text-3xl font-black flex items-center justify-center gap-4 bg-[var(--color-primary-gold)]"
                          >
                            إظهار الإجابة <CartoonEye size={32} />
                          </button>
                        ) : (
                          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                            <div className="p-6 md:p-12 rounded-3xl bg-[var(--color-primary-green)]/10 border-4 border-[var(--color-ink-black)] relative shadow-[4px_4px_0px_var(--color-ink-black)] md:shadow-[8px_8px_0px_var(--color-ink-black)]">
                              <p className="absolute -top-5 left-1/2 -translate-x-1/2 bg-[var(--color-ink-black)] text-[var(--color-primary-gold)] px-6 py-2 rounded-xl text-lg font-black border-2 border-[var(--color-primary-gold)]">الإجابة</p>
                              <p className="text-4xl md:text-7xl font-black text-[var(--color-ink-black)] mt-4 vintage-text">{activeQuestion.answer}</p>
                            </div>

                            {!showScoring ? (
                              <button 
                                onClick={() => setShowScoring(true)}
                                className="vintage-button w-full py-6 rounded-2xl text-3xl font-black flex items-center justify-center gap-4 bg-[var(--color-primary-green)] text-white"
                              >
                                رصد الدرجات <CartoonCheck className="w-10 h-10" />
                              </button>
                            ) : (
                              <div className="w-full space-y-4">
                                {(config.mode === GameMode.GRID || config.mode === GameMode.HEX_GRID) ? (
                                  <div className="flex flex-col gap-4">
                                    {players.map((p) => (
                                      <button 
                                        key={p.id}
                                        onClick={() => handleAnswer(p.id, true)}
                                        className="w-full py-6 rounded-2xl text-white font-black text-2xl transition-all border-4 border-[var(--color-ink-black)] shadow-[6px_6px_0px_var(--color-ink-black)] active:translate-y-1 active:shadow-none"
                                        style={{ backgroundColor: p.color }}
                                      >
                                        {p.name} أجاب بشكل صحيح
                                      </button>
                                    ))}
                                    <button 
                                      onClick={() => handleAnswer(null, false)}
                                      className="w-full py-6 bg-[var(--color-bg-cream)] text-[var(--color-ink-black)] rounded-2xl font-black text-2xl border-4 border-[var(--color-ink-black)] shadow-[6px_6px_0px_var(--color-ink-black)] active:translate-y-1 active:shadow-none"
                                    >
                                      لم يجب أحد
                                    </button>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[40vh] overflow-y-auto p-4 custom-scrollbar">
                                    {players.map((p) => (
                                      <div key={p.id} className="flex flex-col gap-3 p-4 bg-[var(--color-off-white)] rounded-2xl border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)]">
                                        <button 
                                          onClick={() => handleAnswer(p.id, true)}
                                          className="w-full py-4 rounded-xl text-white font-black text-xl transition-all border-2 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)] active:translate-y-1 active:shadow-none"
                                          style={{ backgroundColor: p.color }}
                                        >
                                          صح ({p.name})
                                        </button>
                                        <button 
                                          onClick={() => handleAnswer(p.id, false)}
                                          className="w-full py-2 bg-[var(--color-bg-cream)] text-[var(--color-bg-dark)] rounded-xl font-bold text-sm border-2 border-[var(--color-ink-black)] hover:bg-[var(--color-primary-red)] hover:text-white transition-colors"
                                        >
                                          خطأ
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </motion.div>
                        )}
                        
                        {!(config.mode === GameMode.GRID || config.mode === GameMode.HEX_GRID) && (
                          <button 
                            onClick={() => handleAnswer(null, false)}
                            className="w-full py-4 bg-[var(--color-bg-cream)] text-[var(--color-ink-black)] rounded-2xl font-black text-xl border-4 border-[var(--color-ink-black)] shadow-[6px_6px_0px_var(--color-ink-black)] active:translate-y-1 active:shadow-none mt-2"
                          >
                            تخطي السؤال
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  const renderWinnerModal = () => {
    if (!winner) return null;

    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[var(--color-ink-black)]/80 backdrop-blur-md animate-fade-in">
        <div className="w-full max-w-lg rounded-[2.5rem] md:rounded-[3rem] p-8 md:p-12 vintage-panel text-center relative overflow-hidden border-4 md:border-8 border-[var(--color-ink-black)] shadow-[8px_8px_0px_var(--color-ink-black)] md:shadow-[15px_15px_0px_var(--color-ink-black)]">
          <div className="relative z-10">
            <div className="w-20 h-20 md:w-32 md:h-32 bg-[var(--color-primary-gold)] rounded-2xl md:rounded-3xl flex items-center justify-center mx-auto mb-6 md:mb-10 border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)] md:shadow-[8px_8px_0px_var(--color-ink-black)] animate-bounce">
              <CartoonStar className="w-12 h-12 md:w-20 md:h-20" />
            </div>
            <h2 className="text-3xl md:text-5xl font-black text-[var(--color-ink-black)] mb-4 md:mb-6 vintage-text">فوز مستحق!</h2>
            <div className="inline-block px-6 md:px-10 py-4 md:py-6 rounded-2xl md:rounded-3xl text-white text-2xl md:text-4xl font-black mb-6 md:mb-10 border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)] md:shadow-[8px_8px_0px_var(--color-ink-black)]" style={{backgroundColor: winner.color}}>
              {winner.name}
            </div>
            <p className="text-[var(--color-bg-dark)] font-bold text-lg md:text-xl mb-8 md:mb-12 bg-[var(--color-off-white)] p-6 md:p-8 rounded-2xl md:rounded-3xl border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)]">
              {config.mode === GameMode.HEX_GRID 
                ? 'لقد نجحتم في تكوين المسار المتصل أولاً!' 
                : `لقد فزتم بأعلى رصيد من النقاط (${winner.score} نقطة)!`}
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
  };

  const handleGameFinish = () => {
    onFinish(players);
  };

  if (config.mode === GameMode.BUZZER) {
    return <BuzzerScreen config={config} questions={questions} players={players} onFinish={onFinish} />;
  }

  if (config.mode === GameMode.TIMED) {
    return <TimedChallengeScreen config={config} questions={questions} players={players} onFinish={onFinish} />;
  }

  if (config.mode === GameMode.SILENT_GUESS) {
    return <SilentGuessScreen config={config} questions={questions} players={players} onFinish={onFinish} />;
  }

  if (config.mode === GameMode.TRUE_FALSE) {
    return <TrueFalseScreen config={config} questions={questions} players={players} onFinish={onFinish} />;
  }

  return (
    <div className="flex flex-col items-center gap-4 md:gap-8 min-h-screen p-2 md:p-8 relative">
      
      {/* Scoreboard */}
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 relative z-10">
        {players.map((p, idx) => (
          <motion.div 
            key={p.id} 
            initial={{ x: idx === 0 ? -50 : 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className={`flex items-center gap-4 md:gap-6 p-4 md:p-8 rounded-2xl md:rounded-3xl vintage-panel transition-all border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)] md:shadow-[8px_8px_0px_var(--color-ink-black)] relative overflow-hidden ${
              currentPlayerIndex === idx 
                ? (activePower ? 'bg-[var(--color-primary-gold)]/40 scale-[1.02] md:scale-105 z-10 ring-4 ring-[var(--color-primary-gold)] ring-offset-4 ring-offset-[var(--color-bg-cream)]' : 'bg-[var(--color-primary-gold)]/20 scale-[1.02] md:scale-105 z-10') 
                : 'bg-[var(--color-off-white)] opacity-90'
            }`}
          >
            {currentPlayerIndex === idx && activePower && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute -top-2 -right-2 bg-[var(--color-primary-gold)] text-[var(--color-ink-black)] px-4 py-2 rounded-2xl font-black text-xs border-2 border-[var(--color-ink-black)] shadow-[3px_3px_0px_var(--color-ink-black)] z-20 flex items-center gap-2 animate-bounce"
              >
                {activePower === PowerType.FREEZE && <CartoonSnowflake className="w-4 h-4" />}
                {activePower === PowerType.SHIELD && <CartoonShield className="w-4 h-4" />}
                {activePower === PowerType.STEAL && <CartoonGhost className="w-4 h-4" />}
                قدرة مفعلة!
              </motion.div>
            )}
            
            <div 
              className="w-14 h-14 md:w-20 md:h-20 rounded-xl md:rounded-2xl flex items-center justify-center text-white text-2xl md:text-4xl font-black border-4 border-[var(--color-ink-black)] shadow-[3px_3px_0px_var(--color-ink-black)] md:shadow-[4px_4px_0px_var(--color-ink-black)] relative" 
              style={{backgroundColor: p.color}}
            >
              {p.score}
              {currentPlayerIndex === idx && activePower && (
                <motion.div 
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute inset-0 rounded-2xl bg-white/30"
                />
              )}
            </div>
            <div className="flex flex-col flex-1">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-bg-dark)] text-xs font-black uppercase tracking-widest">
                  {config.mode === GameMode.HEX_GRID ? (idx === 0 ? 'أفقي' : 'عمودي') : `لاعب ${idx + 1}`}
                </span>
                {currentPlayerIndex === idx && (
                  <span className="bg-[var(--color-primary-gold)] text-[var(--color-ink-black)] border-2 border-[var(--color-ink-black)] text-xs font-black px-4 py-1 rounded-full animate-wobble">دورك الآن!</span>
                )}
              </div>
              <span className="text-xl md:text-3xl font-black text-[var(--color-ink-black)] truncate vintage-text">{p.name}</span>
              
              {/* Powers Display */}
              {config.mode === GameMode.HEX_GRID && (
                <div className="flex gap-2 md:gap-3 mt-2 md:mt-4">
                  {Object.entries(p.powers).map(([type, count]) => (
                    <button 
                      key={type} 
                      disabled={currentPlayerIndex !== idx || (count as number) <= 0}
                      onClick={() => {
                        if (activePower === type) {
                          setActivePower(null);
                          showToast("تم إلغاء تفعيل القدرة", "info");
                        } else {
                          setActivePower(type as PowerType);
                          showToast(`تم تفعيل قدرة: ${type === PowerType.FREEZE ? 'التجميد' : type === PowerType.SHIELD ? 'الدرع' : 'السرقة'}`, "success");
                        }
                      }}
                      className={`flex items-center gap-2 md:gap-3 px-3 md:px-5 py-2 md:py-3 rounded-xl md:rounded-2xl border-2 md:border-4 border-[var(--color-ink-black)] text-xs md:text-sm font-black transition-all shadow-[3px_3px_0px_var(--color-ink-black)] md:shadow-[4px_4px_0px_var(--color-ink-black)] active:translate-y-1 active:shadow-none ${
                        (count as number) > 0 
                          ? (activePower === type 
                              ? 'bg-[var(--color-primary-gold)] text-[var(--color-ink-black)] scale-110 -translate-y-1' 
                              : 'bg-[var(--color-accent-sky)] text-[var(--color-ink-black)] hover:bg-[var(--color-primary-gold)] hover:-translate-y-0.5') 
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed grayscale'
                      }`}
                    >
                      <div className="p-0.5 md:p-1 bg-white/20 rounded-lg">
                        {type === PowerType.FREEZE && <CartoonSnowflake className="w-4 h-4 md:w-6 md:h-6" />}
                        {type === PowerType.SHIELD && <CartoonShield className="w-4 h-4 md:w-6 md:h-6" />}
                        {type === PowerType.STEAL && <CartoonGhost className="w-4 h-4 md:w-6 md:h-6" />}
                      </div>
                      <span className="text-sm md:text-lg">{count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* لوحة اللعب الرئيسية */}
      <div className="w-full mt-4 md:mt-8">
        {config.mode === GameMode.GRID ? (
          renderJeopardyBoard()
        ) : (
          <div 
            className="relative group animate-fade-in w-full flex justify-center px-4" 
            style={{ '--current-player-color': players[currentPlayerIndex].color } as React.CSSProperties}
          >
            <div className="game-board-area relative z-10 transition-transform duration-700 hover:scale-[1.01] w-full max-w-3xl">
              <div className="board-wrapper flex justify-center">
                <div className="hex-grid-center w-full">
                  <Suspense fallback={<div className="flex items-center justify-center p-20 text-cyan-400 font-bold animate-pulse">جاري تحميل الشبكة...</div>}>
                    <HexGrid 
                      grid={grid}
                      players={players}
                      currentPlayerIndex={currentPlayerIndex}
                      answeredMap={answeredMap}
                      winningPath={winningPath}
                      frozenCells={frozenCells}
                      shieldedCells={shieldedCells}
                      stolenCells={stolenCells}
                      handleHexClick={handleHexClick}
                    />
                  </Suspense>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {renderActiveQuestion()}
      {renderWinnerModal()}

      <div className="flex flex-wrap justify-center gap-6 mt-12 relative z-10">
        <button 
          onClick={handleGameFinish}
          className="px-10 py-5 bg-[var(--color-accent-sky)] text-[var(--color-ink-black)] rounded-2xl font-black text-2xl border-4 border-[var(--color-ink-black)] shadow-[6px_6px_0px_var(--color-ink-black)] active:translate-y-1 active:shadow-none"
        >
          الترتيب الحالي
        </button>
        <button 
          onClick={() => window.location.reload()}
          className="px-10 py-5 bg-[var(--color-primary-red)] text-white rounded-2xl font-black text-2xl border-4 border-[var(--color-ink-black)] shadow-[6px_6px_0px_var(--color-ink-black)] active:translate-y-1 active:shadow-none"
        >
          إعادة البدء
        </button>
      </div>
    </div>
  );
};

export default GameScreen;