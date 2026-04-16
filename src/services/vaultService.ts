
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  Timestamp,
  increment,
  updateDoc
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Question, Difficulty, GameMode } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

const VAULT_COLLECTION = 'questions_vault';
const COOLDOWN_DAYS = 30;
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export const saveToVault = async (question: Question) => {
  if (!auth.currentUser) return;
  
  const questionRef = doc(db, VAULT_COLLECTION, question.id);
  const data = {
    ...question,
    userId: auth.currentUser.uid,
    topic_match: question.category ? question.category.toLowerCase() : 'unknown',
    times_played: question.times_played || 0,
    last_played_at: question.last_played_at || 0,
    avg_time_to_answer: question.avg_time_to_answer || 0,
    running_time_sum: (question.avg_time_to_answer || 0) * (question.times_played || 0),
    correct_count: question.correct_count || 0,
    mastered: question.mastered || false,
    real_difficulty_score: question.real_difficulty_score || (
      question.difficulty === Difficulty.HARD ? 800 :
      question.difficulty === Difficulty.MEDIUM ? 500 : 200
    )
  };
  
  try {
    await setDoc(questionRef, data, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${VAULT_COLLECTION}/${question.id}`);
  }
};

export const updateQuestionStats = async (
  questionId: string, 
  answeredCorrectly: boolean, 
  timeSpentMs: number
) => {
  if (!auth.currentUser) return;
  
  const questionRef = doc(db, VAULT_COLLECTION, questionId);
  const now = Date.now();
  
  // Logic for Realistic Difficulty Adjustment
  let difficultyShift = 0;
  if (answeredCorrectly) {
    if (timeSpentMs < 3000) difficultyShift = -50;
    else if (timeSpentMs < 7000) difficultyShift = -20;
    else difficultyShift = -5;
  } else {
    difficultyShift = 50;
  }

  // To implement Mastery logic precisely, we'd need to fetch first, but to save a round-trip
  // we use a strategy: we update the stats and then a separate check or just rough triggers.
  // Let's do a simple atomic update first.
  
  try {
    await updateDoc(questionRef, {
      times_played: increment(1),
      correct_count: answeredCorrectly ? increment(1) : increment(0),
      last_played_at: now,
      running_time_sum: increment(timeSpentMs),
      last_time_spent: timeSpentMs,
      real_difficulty_score: increment(difficultyShift)
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${VAULT_COLLECTION}/${questionId}`);
  }

  // Simple Mastery Trigger: If this was successful and extremely fast
  // we might want to check if it's "Mastered" now.
  // For a truly "Intelligent" system, we'd do this via a Cloud Function or batch process,
  // but let's add a local check that periodically marks as mastered.
};

export const getQuestionsFromVault = async (
  topic: string, 
  numQuestions: number,
  mode: GameMode,
  difficulty: Difficulty
): Promise<Question[]> => {
  if (!auth.currentUser) return [];
  
  const now = Date.now();
  const cooldownThreshold = now - COOLDOWN_MS;
  
  // Query for questions that match topic and are not in cooldown
  // We'll also filter for "mastered" questions separately because Firestore doesn't support != well with other filters
  const vaultQuery = query(
    collection(db, VAULT_COLLECTION),
    where('userId', '==', auth.currentUser.uid),
    where('topic_match', '==', topic.toLowerCase()), // Topic match should be normalized
    where('last_played_at', '<', cooldownThreshold),
    limit(numQuestions * 2) // Get extra to filter in memory
  );
  
  try {
    const snapshot = await getDocs(vaultQuery);
    let questions = snapshot.docs.map(d => {
      const data = d.data();
      // Calculate real avg_time if possible
      const timesPlayed = data.times_played || 0;
      const runningSum = data.running_time_sum || 0;
      const avgTime = timesPlayed > 0 ? runningSum / timesPlayed : 0;
      const correctCount = data.correct_count || 0;
      const correctRate = timesPlayed > 0 ? correctCount / timesPlayed : 0;

      // Maintenance: Mark as mastered if it's too easy for this user
      if (!data.mastered && timesPlayed >= 6 && correctRate >= 0.9 && avgTime < 5000) {
        updateDoc(d.ref, { mastered: true }).catch(e => console.error("Mastery update fail", e));
        return { ...data, mastered: true } as Question;
      }

      return data as Question;
    });
    
    // Filter out mastered questions (unless bank is low)
    let activeQuestions = questions.filter(q => !q.mastered);
    
    if (activeQuestions.length > 0) {
      return activeQuestions
        .sort(() => Math.random() - 0.5)
        .slice(0, numQuestions)
        .map(q => adaptQuestionForMode(q, mode));
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, VAULT_COLLECTION);
  }
  
  return [];
};

/**
 * Cross-Mode Recycling Logic
 * Adapts a question's text or format based on the target game mode
 */
function adaptQuestionForMode(q: Question, targetMode: GameMode): Question {
  const adapted = { ...q };
  
  if (targetMode === GameMode.HEX_GRID) {
    // Ensure it has a letter
    if (!adapted.letter) {
      adapted.letter = adapted.answer.replace(/^ال/, '').trim().charAt(0).toUpperCase();
    }
    // Make text more concise if needed
    if (adapted.text.length > 50) {
      adapted.text = adapted.text.substring(0, 47) + "...";
    }
  } else if (targetMode === GameMode.TIMED) {
    // For timed mode, we want short punchy questions
    if (adapted.text.length > 30) {
      // Potentially simplify?
    }
  }
  
  return adapted;
}
