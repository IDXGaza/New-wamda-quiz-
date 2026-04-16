import React, { useState, useEffect } from 'react';
import { GameMode, Difficulty, QuestionType, SavedSet, Question, Player } from '../types';
import { generateQuestions } from '../services/geminiService';
import { useSettings } from '../contexts/SettingsContext';
import { playSound } from '../utils/sound';
import { 
  CartoonBook, 
  CartoonPlus, 
  CartoonX, 
  CartoonSkip, 
  CartoonTrash, 
  CartoonRocket, 
  CartoonStar, 
  CartoonGear,
  CartoonHome,
  CartoonAlert,
  CartoonCheck
} from './CartoonIcons';

interface Props {
  onPlaySet: (set: SavedSet, players: Player[]) => void;
  onClose: () => void;
}

const LibraryScreen: React.FC<Props> = ({ onPlaySet, onClose }) => {
  const { settings } = useSettings();
  const [savedSets, setSavedSets] = useState<SavedSet[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [numQuestions, setNumQuestions] = useState(10);
  const [mode, setMode] = useState<GameMode>(GameMode.POINTS);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);

  // Play State
  const [selectedSetToPlay, setSelectedSetToPlay] = useState<SavedSet | null>(null);
  const [playersConfig, setPlayersConfig] = useState<{name: string, color: string}[]>([
    { name: 'الفريق الأحمر', color: '#D93025' },
    { name: 'الفريق الأخضر', color: '#2DAA4F' }
  ]);

  useEffect(() => {
    const sets = localStorage.getItem('savedSets');
    if (sets) {
      try {
        setSavedSets(JSON.parse(sets));
      } catch (e) {
        console.error('Failed to parse saved sets', e);
      }
    }
  }, []);

  const saveSetsToLocal = (sets: SavedSet[]) => {
    localStorage.setItem('savedSets', JSON.stringify(sets));
    setSavedSets(sets);
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    playSound('click');
    setDeletingId(id);
  };

  const confirmDelete = (id: string) => {
    playSound('click');
    const newSets = savedSets.filter(s => s.id !== id);
    saveSetsToLocal(newSets);
    setDeletingId(null);
  };

  const cancelDelete = () => {
    playSound('click');
    setDeletingId(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !topic.trim()) return;

    setIsLoading(true);
    setError('');

    try {
      const requiredCount = mode === GameMode.HEX_GRID ? 25 : (mode === GameMode.GRID ? 20 : numQuestions);
      
      const generated = await generateQuestions(
        topic,
        requiredCount,
        [QuestionType.OPEN],
        mode,
        difficulty,
        settings.aiModel
      );

      if (!generated || generated.length === 0) {
        throw new Error("لم يتم العثور على أسئلة، حاول تغيير الموضوع.");
      }

      const newSet: SavedSet = {
        id: `set-${Date.now()}`,
        name,
        topic,
        numQuestions: requiredCount,
        mode,
        difficulty,
        questions: generated,
        createdAt: Date.now()
      };

      saveSetsToLocal([newSet, ...savedSets]);
      setIsCreating(false);
      // Reset form
      setName('');
      setTopic('');
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء توليد الأسئلة');
    } finally {
      setIsLoading(false);
    }
  };

  const getModeLabel = (m: GameMode) => {
    switch (m) {
      case GameMode.HEX_GRID: return 'شبكة الحروف';
      case GameMode.GRID: return 'الشبكة الكلاسيكية';
      case GameMode.BUZZER: return 'تحدي البازر';
      case GameMode.TIMED: return 'تحدي الوقت';
      default: return 'نقاط';
    }
  };

  const getDifficultyLabel = (d: Difficulty) => {
    switch (d) {
      case Difficulty.EASY: return 'سهل';
      case Difficulty.MEDIUM: return 'متوسط';
      case Difficulty.HARD: return 'صعب';
      default: return '';
    }
  };

  const handleStartPlay = () => {
    if (!selectedSetToPlay) return;
    playSound('start');
    const finalPlayers: Player[] = playersConfig.map((p, i) => ({
      id: `p${i+1}`,
      name: p.name || `متسابق ${i+1}`,
      score: 0,
      color: p.color,
      powers: {
        FREEZE: 1,
        STEAL: 1,
        SHIELD: 1
      }
    }));
    onPlaySet(selectedSetToPlay, finalPlayers);
  };

  return (
    <div className="vintage-panel p-8 md:p-12 max-w-5xl mx-auto animate-fade-up relative overflow-hidden rounded-[3rem] border-4 border-[var(--color-ink-black)] shadow-[8px_8px_0px_var(--color-ink-black)] bg-[var(--color-bg-cream)]">
      <div className="flex justify-between items-center mb-10 bg-[var(--color-primary-gold)] p-6 rounded-[2rem] border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)]">
        <h2 className="text-4xl md:text-5xl font-display text-[var(--color-ink-black)] flex items-center gap-4">
          <CartoonBook size={48} />
          <span>{selectedSetToPlay ? 'إعداد المتسابقين' : 'مكتبة المسابقات'}</span>
        </h2>
        <button 
          onClick={() => {
            playSound('click');
            selectedSetToPlay ? setSelectedSetToPlay(null) : onClose();
          }} 
          className="w-14 h-14 bg-[var(--color-primary-red)] text-white rounded-2xl flex items-center justify-center transition-transform hover:scale-110 border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)] active:translate-y-1 active:shadow-none"
        >
          {selectedSetToPlay ? <CartoonSkip size={32} className="rotate-180" /> : <CartoonX size={32} />}
        </button>
      </div>

      {selectedSetToPlay ? (
        <div className="space-y-8">
          <div className="bg-[var(--color-off-white)] p-8 rounded-[2.5rem] border-4 border-[var(--color-ink-black)] shadow-[inner_4px_4px_0px_rgba(0,0,0,0.1)]">
            <h3 className="text-3xl font-display text-[var(--color-ink-black)] mb-6">المجموعة: {selectedSetToPlay.name}</h3>
            <div className="flex flex-wrap gap-4">
              <span className="bg-[var(--color-primary-blue)] text-white px-6 py-2 rounded-xl border-2 border-[var(--color-ink-black)] font-display text-xl shadow-[2px_2px_0px_var(--color-ink-black)]">{getModeLabel(selectedSetToPlay.mode)}</span>
              <span className="bg-[var(--color-primary-gold)] text-[var(--color-ink-black)] px-6 py-2 rounded-xl border-2 border-[var(--color-ink-black)] font-display text-xl shadow-[2px_2px_0px_var(--color-ink-black)]">{selectedSetToPlay.numQuestions} سؤالاً</span>
              <span className="bg-[var(--color-primary-red)] text-white px-6 py-2 rounded-xl border-2 border-[var(--color-ink-black)] font-display text-xl shadow-[2px_2px_0px_var(--color-ink-black)]">{getDifficultyLabel(selectedSetToPlay.difficulty)}</span>
            </div>
          </div>

          <div className="space-y-6 bg-[var(--color-off-white)] p-8 rounded-[2.5rem] border-4 border-[var(--color-ink-black)] shadow-[inner_4px_4px_0px_rgba(0,0,0,0.1)]">
            <h3 className="text-2xl font-display text-[var(--color-bg-dark)] mb-4">المتنافسون</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {playersConfig.map((p, i) => (
                <div key={i} className="flex gap-4 items-center bg-[var(--color-bg-cream)] p-4 rounded-2xl border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)]">
                  <div className="relative w-14 h-14 rounded-xl overflow-hidden border-4 border-[var(--color-ink-black)] shrink-0 shadow-[2px_2px_0px_var(--color-ink-black)]">
                    <input 
                      type="color"
                      value={p.color}
                      onChange={e => {
                        const newPlayers = [...playersConfig];
                        newPlayers[i].color = e.target.value;
                        setPlayersConfig(newPlayers);
                      }}
                      className="absolute -top-4 -left-4 w-24 h-24 cursor-pointer"
                    />
                  </div>
                  <input 
                    value={p.name}
                    onChange={e => {
                      const newPlayers = [...playersConfig];
                      newPlayers[i].name = e.target.value;
                      setPlayersConfig(newPlayers);
                    }}
                    className="flex-1 bg-transparent border-b-4 border-[var(--color-ink-black)] font-display text-2xl px-2 focus:outline-none"
                    placeholder={`اسم المتسابق ${i+1}`}
                  />
                  {playersConfig.length > 2 && (
                    <button type="button" onClick={() => setPlayersConfig(playersConfig.filter((_, idx) => idx !== i))} className="w-12 h-12 bg-[var(--color-primary-red)] text-white rounded-xl border-4 border-[var(--color-ink-black)] shadow-[2px_2px_0px_var(--color-ink-black)] hover:scale-110 transition-transform flex items-center justify-center shrink-0">
                      <CartoonX size={24} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => {
              playSound('click');
              setPlayersConfig([...playersConfig, { name: `متسابق ${playersConfig.length + 1}`, color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0') }]);
            }} className="w-full py-4 border-4 border-dashed border-[var(--color-ink-black)] rounded-2xl text-[var(--color-bg-dark)] text-2xl font-display hover:bg-[var(--color-primary-gold)]/10 transition-all flex items-center justify-center gap-4">
              <CartoonPlus size={32} />
              <span>إضافة متسابق</span>
            </button>
          </div>

          <button 
            onClick={handleStartPlay}
            className="vintage-button w-full py-8 rounded-[2.5rem] text-4xl font-display flex items-center justify-center gap-6 bg-[var(--color-primary-green)]"
          >
            <span>بدء اللعب</span>
            <CartoonRocket size={48} />
          </button>
        </div>
      ) : !isCreating ? (
        <div className="space-y-8">
          <button 
            onClick={() => {
              playSound('click');
              setIsCreating(true);
            }}
            className="w-full py-8 border-4 border-dashed border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 rounded-[2.5rem] text-[var(--color-primary-blue)] font-display text-3xl hover:bg-[var(--color-primary-blue)]/20 transition-all flex items-center justify-center gap-6 shadow-[6px_6px_0px_var(--color-primary-blue)] active:translate-y-1 active:shadow-none"
          >
            <CartoonPlus size={48} />
            <span>إنشاء مجموعة جديدة</span>
          </button>

          {savedSets.length === 0 ? (
            <div className="text-center py-20 bg-[var(--color-off-white)] rounded-[3rem] border-4 border-[var(--color-ink-black)] shadow-[inner_4px_4px_0px_rgba(0,0,0,0.1)]">
              <div className="w-24 h-24 bg-[var(--color-primary-gold)] rounded-[2rem] flex items-center justify-center mx-auto mb-6 border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)]">
                <CartoonBook size={56} className="text-[var(--color-ink-black)]" />
              </div>
              <p className="text-3xl font-display text-[var(--color-bg-dark)]">لا توجد مجموعات محفوظة حالياً</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {savedSets.map(set => (
                <div key={set.id} className="bg-[var(--color-off-white)] border-4 border-[var(--color-ink-black)] p-8 rounded-[2.5rem] flex flex-col gap-6 shadow-[6px_6px_0px_var(--color-ink-black)] hover:scale-[1.02] transition-transform">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-3xl font-display text-[var(--color-ink-black)] mb-3 leading-tight">{set.name}</h3>
                      <p className="text-xl font-display text-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 inline-block px-4 py-1 rounded-xl border-2 border-[var(--color-primary-blue)]">{set.topic}</p>
                    </div>
                    {deletingId === set.id ? (
                      <div className="flex flex-col gap-2">
                        <button onClick={() => confirmDelete(set.id)} className="text-white px-4 py-2 bg-[var(--color-primary-red)] rounded-xl border-2 border-[var(--color-ink-black)] shadow-[2px_2px_0px_var(--color-ink-black)] font-display text-lg">
                          تأكيد
                        </button>
                        <button onClick={cancelDelete} className="text-[var(--color-ink-black)] px-4 py-2 bg-[var(--color-off-white)] rounded-xl border-2 border-[var(--color-ink-black)] shadow-[2px_2px_0px_var(--color-ink-black)] font-display text-lg">
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => handleDelete(set.id)} className="text-[var(--color-primary-red)] hover:bg-[var(--color-primary-red)]/10 p-3 bg-[var(--color-bg-cream)] rounded-xl border-4 border-[var(--color-ink-black)] shadow-[2px_2px_0px_var(--color-ink-black)] transition-all active:translate-y-0.5 active:shadow-none">
                        <CartoonTrash size={32} />
                      </button>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap gap-3">
                    <span className="px-4 py-1.5 bg-[var(--color-primary-gold)] text-[var(--color-ink-black)] rounded-xl border-2 border-[var(--color-ink-black)] font-display text-lg shadow-[2px_2px_0px_var(--color-ink-black)]">{getModeLabel(set.mode)}</span>
                    <span className="px-4 py-1.5 bg-[var(--color-primary-green)] text-white rounded-xl border-2 border-[var(--color-ink-black)] font-display text-lg shadow-[2px_2px_0px_var(--color-ink-black)]">{set.numQuestions} سؤال</span>
                    <span className="px-4 py-1.5 bg-[var(--color-primary-red)] text-white rounded-xl border-2 border-[var(--color-ink-black)] font-display text-lg shadow-[2px_2px_0px_var(--color-ink-black)]">{getDifficultyLabel(set.difficulty)}</span>
                  </div>

                  <button 
                    onClick={() => {
                      playSound('click');
                      setSelectedSetToPlay(set);
                    }}
                    className="vintage-button w-full py-5 rounded-2xl font-display text-2xl flex items-center justify-center gap-4 bg-[var(--color-primary-gold)]"
                  >
                    <span>لعب هذه المجموعة</span>
                    <CartoonRocket size={32} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleCreate} className="space-y-8 bg-[var(--color-off-white)] p-8 md:p-12 rounded-[3rem] border-4 border-[var(--color-ink-black)] shadow-[inner_4px_4px_0px_rgba(0,0,0,0.1)]">
          <div className="flex justify-between items-center mb-8 border-b-4 border-[var(--color-ink-black)] pb-6">
            <h3 className="text-4xl font-display text-[var(--color-ink-black)]">إنشاء مجموعة جديدة</h3>
            <button type="button" onClick={() => setIsCreating(false)} className="text-[var(--color-primary-red)] hover:text-white hover:bg-[var(--color-primary-red)] font-display text-2xl bg-[var(--color-bg-cream)] px-6 py-2 rounded-2xl border-4 border-[var(--color-ink-black)] shadow-[4px_4px_0px_var(--color-ink-black)] transition-all active:translate-y-1 active:shadow-none">إلغاء</button>
          </div>

          {error && (
            <div className="p-6 bg-[var(--color-primary-red)]/10 border-4 border-[var(--color-primary-red)] rounded-[2rem] text-[var(--color-primary-red)] text-xl font-display flex items-center gap-4">
              <CartoonAlert size={32} />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-8">
            <div className="group">
              <label className="block text-2xl font-display text-[var(--color-bg-dark)] mb-3">اسم المجموعة</label>
              <input 
                value={name} onChange={e => setName(e.target.value)}
                className="w-full bg-[var(--color-bg-cream)] border-4 border-[var(--color-ink-black)] rounded-2xl p-5 font-display text-2xl shadow-[4px_4px_0px_var(--color-ink-black)] focus:outline-none focus:scale-[1.01] transition-transform"
                placeholder="مثال: مسابقة العائلة الكبرى" required
              />
            </div>
            
            <div className="group">
              <label className="block text-2xl font-display text-[var(--color-bg-dark)] mb-3">الموضوع</label>
              <input 
                value={topic} onChange={e => setTopic(e.target.value)}
                className="w-full bg-[var(--color-bg-cream)] border-4 border-[var(--color-ink-black)] rounded-2xl p-5 font-display text-2xl shadow-[4px_4px_0px_var(--color-ink-black)] focus:outline-none focus:scale-[1.01] transition-transform"
                placeholder="مثال: التاريخ الإسلامي" required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="group">
                <label className="block text-2xl font-display text-[var(--color-bg-dark)] mb-3">نظام اللعبة</label>
                <div className="relative">
                    <select 
                      value={mode} onChange={e => setMode(e.target.value as GameMode)}
                      className="w-full bg-[var(--color-bg-cream)] border-4 border-[var(--color-ink-black)] rounded-2xl p-5 font-display text-2xl shadow-[4px_4px_0px_var(--color-ink-black)] appearance-none focus:outline-none"
                    >
                      <option value={GameMode.POINTS}>نقاط</option>
                      <option value={GameMode.HEX_GRID}>شبكة الحروف</option>
                      <option value={GameMode.GRID}>الشبكة الكلاسيكية</option>
                      <option value={GameMode.BUZZER}>تحدي البازر</option>
                      <option value={GameMode.TIMED}>تحدي الوقت</option>
                    </select>
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none">
                    <CartoonGear size={32} className="text-[var(--color-bg-dark)]" />
                  </div>
                </div>
              </div>

              {mode !== GameMode.HEX_GRID && mode !== GameMode.GRID && (
                <div className="group">
                  <label className="block text-2xl font-display text-[var(--color-bg-dark)] mb-3">عدد الأسئلة</label>
                  <input 
                    type="number" min="5" max="50"
                    value={numQuestions} onChange={e => setNumQuestions(parseInt(e.target.value) || 10)}
                    className="w-full bg-[var(--color-bg-cream)] border-4 border-[var(--color-ink-black)] rounded-2xl p-5 font-display text-2xl shadow-[4px_4px_0px_var(--color-ink-black)] focus:outline-none"
                  />
                </div>
              )}

              <div className="group">
                <label className="block text-2xl font-display text-[var(--color-bg-dark)] mb-3">مستوى الصعوبة</label>
                <div className="relative">
                  <select 
                    value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)}
                    className="w-full bg-[var(--color-bg-cream)] border-4 border-[var(--color-ink-black)] rounded-2xl p-5 font-display text-2xl shadow-[4px_4px_0px_var(--color-ink-black)] appearance-none focus:outline-none"
                  >
                    <option value={Difficulty.EASY}>سهل</option>
                    <option value={Difficulty.MEDIUM}>متوسط</option>
                    <option value={Difficulty.HARD}>صعب</option>
                  </select>
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none">
                    <CartoonStar size={32} className="text-[var(--color-primary-gold)]" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className={`vintage-button w-full py-8 rounded-[2.5rem] text-4xl font-display flex items-center justify-center gap-6 mt-10 ${isLoading ? 'opacity-70 cursor-not-allowed' : 'bg-[var(--color-primary-gold)]'}`}
          >
            {isLoading ? (
              <>
                <CartoonGear size={48} className="animate-spin" />
                <span>جاري توليد الأسئلة...</span>
              </>
            ) : (
              <>
                <CartoonRocket size={48} />
                <span>إنشاء وحفظ المجموعة</span>
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
};

export default LibraryScreen;
