
export enum GameMode {
  GRID = 'GRID',
  HEX_GRID = 'HEX_GRID',
  POINTS = 'POINTS',
  BUZZER = 'BUZZER',
  TIMED = 'TIMED',
  SILENT_GUESS = 'SILENT_GUESS',
  TRUE_FALSE = 'TRUE_FALSE'
}

export enum QuestionType {
  MCQ = 'MCQ',
  TRUE_FALSE = 'TRUE_FALSE',
  OPEN = 'OPEN'
}

export enum Difficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD'
}

export interface Question {
  id: string;
  text: string;
  options?: string[];
  answer: string;
  category: string;
  points: number;
  letter?: string;
  hint?: string;
  explanation?: string;
  type: QuestionType;
  difficulty: Difficulty;
  emojis?: string[];
}

export enum PowerType {
  FREEZE = 'FREEZE',
  STEAL = 'STEAL',
  SHIELD = 'SHIELD'
}

export interface Player {
  id: string;
  name: string;
  score: number;
  color: string;
  powers: Record<PowerType, number>;
}

export interface GameConfig {
  topic: string;
  numQuestions: number;
  mode: GameMode;
  questionTypes: QuestionType[];
  difficulty: Difficulty;
  players: Player[];
  manualQuestions: Question[];
  categories?: string[];
  sessionId?: string;
  // Hex Grid specific
  hexMode?: 'ai' | 'manual';
  hexCategories?: string[];
  hexManualQuestions?: Record<string, {question: string, answer: string}>;
  customJson?: string;
}

export interface SavedSet {
  id: string;
  name: string;
  topic: string;
  numQuestions: number;
  mode: GameMode;
  difficulty: Difficulty;
  questions: Question[];
  manualQuestions?: Question[];
  createdAt: number;
}
