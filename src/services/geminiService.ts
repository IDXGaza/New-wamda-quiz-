import { GoogleGenAI, Type } from "@google/genai";
import { Question, QuestionType, GameMode, Difficulty } from "../types";

const ARABIC_ALPHABET = "أبتثجحخدذرزسشصضطظعغفقكلمنهوي".split("");

const shuffleArray = <T>(array: T[]): T[] => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

export const extractJson = (text: string): string => {
  if (!text) return "";
  
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  let cleaned = text;
  if (codeBlockMatch && codeBlockMatch[1]) {
    cleaned = codeBlockMatch[1].trim();
  } else {
    cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  }
  
  const firstBracket = cleaned.indexOf('[');
  const firstBrace = cleaned.indexOf('{');
  
  let startIdx = -1;
  if (firstBracket !== -1 && firstBrace !== -1) {
    startIdx = Math.min(firstBracket, firstBrace);
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
  }
  
  if (startIdx === -1) return cleaned;
  
  let extracted = cleaned.substring(startIdx);
  
  const closeSequences = ['', ']', '}', '}]', ']}', '"]}', '"}', '"]', '}]}'];
  
  for (const seq of closeSequences) {
    try {
      JSON.parse(extracted + seq);
      return extracted + seq;
    } catch (e) {}
  }
  
  let trimmed = extracted.trim();
  if (trimmed.endsWith(',')) {
    const withoutComma = trimmed.substring(0, trimmed.length - 1).trim();
    for (const seq of closeSequences) {
      try {
        JSON.parse(withoutComma + seq);
        return withoutComma + seq;
      } catch (e) {}
    }
  }
  
  for (let i = extracted.length - 1; i >= 0; i--) {
    const char = extracted[i];
    if (char === '}' || char === ']' || char === ',' || char === '"') {
      let truncated = extracted.substring(0, i + 1).trim();
      for (const seq of closeSequences) {
        try {
          const p = JSON.parse(truncated + seq);
          if (typeof p === 'object' && p !== null && Object.keys(p).length > 0) return truncated + seq;
        } catch (e) {}
      }
      if (truncated.endsWith(',')) {
        const withoutComma = truncated.substring(0, truncated.length - 1).trim();
        for (const seq of closeSequences) {
          try {
            const p = JSON.parse(withoutComma + seq);
            if (typeof p === 'object' && p !== null && Object.keys(p).length > 0) return withoutComma + seq;
          } catch (e) {}
        }
      }
    }
  }
  
  return extracted;
};

const getDifficultyText = (diff: Difficulty) => {
  switch (diff) {
    case Difficulty.EASY: return "سهلة ومباشرة، مناسبة لجميع الفئات العمرية والمعلومات العامة الأساسية.";
    case Difficulty.MEDIUM: return "متوسطة الصعوبة للمثقف العام. تتطلب معرفة عامة جيدة، استنتاجاً منطقياً، ومعلومات غير شائعة.";
    case Difficulty.HARD: return "تحدٍ حقيقي للمثقفين. تتطلب حقائق نادرة، معلومات دقيقة، أو ربطاً ذكياً بين المفاهيم. تجنب البديهيات تماماً.";
    default: return "متوازنة";
  }
};

export const getAI = () => {
  let apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
  
  try {
    const savedSettings = localStorage.getItem('appSettings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      if (parsed.apiKeys?.gemini && parsed.apiKeys.gemini.trim() !== "") {
        apiKey = parsed.apiKeys.gemini;
      }
    }
  } catch (e) {
    console.error("Failed to read API key from settings", e);
  }

  const sanitizedApiKey = String(apiKey || "").replace(/[^\x20-\x7E]/g, "").trim();

  if (!sanitizedApiKey) {
    console.warn("No Gemini API key found. AI features will likely fail.");
  }

  return new GoogleGenAI({ apiKey: sanitizedApiKey });
};

export const retry = async <T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const errorStr = String(error?.message || error || "");
    const isDailyQuota = errorStr.includes("billing details") || errorStr.includes("RESOURCE_EXHAUSTED") || errorStr.includes("quota");
    const isRetryable = !isDailyQuota && (
                        errorStr.includes("500") || 
                        errorStr.includes("Rpc failed") || 
                        errorStr.includes("xhr error") ||
                        errorStr.includes("429") ||
                        errorStr.includes("deadline") ||
                        errorStr.includes("ECONNRESET")
    );
    
    if (retries > 0 && isRetryable) {
      console.warn(`Retrying AI call (${retries} left)... Error: ${errorStr}`);
      await new Promise(res => setTimeout(res, delay));
      return retry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};

let useGeminiOnly = false;

export const generateQuestions = async (
  topic: string,
  numQuestions: number,
  types: QuestionType[],
  mode: GameMode,
  difficulty: Difficulty,
  aiModel: string = "gemini-3-flash-preview",
  categories?: string[],
  excludedAnswers?: string[]
): Promise<Question[]> => {
  const ai = getAI();
  const difficultyContext = getDifficultyText(difficulty);

  const generateSingleBatch = async (batchNum: number, batchStartIdx: number, batchLetters?: string[], category?: string): Promise<Question[]> => {
    // Take the most recent 300 exclusions to prevent repetition
    const limitedExclusions = excludedAnswers ? excludedAnswers.slice(0, 300) : [];
    const exclusionText = limitedExclusions.length > 0 
      ? `\nمهم جداً (أولوية قصوى): يمنع منعاً باتاً تكرار أي من الإجابات التالية لأنها استخدمت في جولات سابقة: [${limitedExclusions.join("، ")}]. ابحث عن حقائق ومعلومات جديدة ومختلفة تماماً ومبتكرة وغير متوقعة.`
      : "";

    const randomAngles = [
      "ركز على الجوانب التاريخية والنشأة.",
      "ركز على الأرقام القياسية والإحصائيات المذهلة.",
      "ركز على الشخصيات المؤثرة والمغمورة.",
      "ركز على الأحداث الغريبة والطرائف.",
      "ركز على التأثير الثقافي والاجتماعي.",
      "ركز على الاكتشافات العلمية والتقنية المتعلقة بالموضوع."
    ];
    const randomAngle = randomAngles[Math.floor(Math.random() * randomAngles.length)];

    const isTrueFalse = types.includes(QuestionType.TRUE_FALSE);
    const isTrueFalseMode = mode === GameMode.TRUE_FALSE;
    const trueFalseMechanism = (isTrueFalse || isTrueFalseMode) ? `
مهم جداً لأسئلة صواب/خطأ:
1. العشوائية: اجعل توزيع الإجابات بين "صواب" و "خطأ" عشوائياً تماماً وغير متوقع.
2. الخداع والتمويه: اجعل المعلومة تبدو صحيحة وهي خاطئة (عن طريق تغيير تفصيل صغير أو رقم أو اسم)، أو تبدو مستحيلة وهي صحيحة (حقائق مذهلة ومعاكسة للبديهة).
3. تجنب البديهيات: لا تضع معلومات يعرفها الجميع. ابحث عن الحقائق التي يسود حولها اعتقاد خاطئ شائع (Common Misconceptions).
4. يجب أن تكون الإجابة "صواب" أو "خطأ" فقط.
5. يمنع منعاً باتاً ترك حقل "answer" فارغاً.
` : "";

    const varietyInstruction = `عامل التنوع (مهم): اختر زوايا غير متوقعة للموضوع. إذا كان الموضوع "تاريخ"، لا تركز فقط على الحروب، بل ابحث عن اختراعات، شخصيات غريبة، أو أحداث اجتماعية نادرة.`;

    const newQuestionMechanism = `آلية صياغة الأسئلة (مهم جداً):
${trueFalseMechanism}
${varietyInstruction}
${isTrueFalseMode ? "مهم جداً: هذا النمط مخصص للحقائق المضللة والمخادعة والمعاكسة للتوقع تماماً. يجب أن يشعر اللاعب بالصدمة أو الحيرة عند معرفة الإجابة الصحيحة. هدفنا هو 'تضليل' اللاعب بذكاء." : ""}
1. قاعدة المعلومات النادرة: إذا كانت الإجابة سهلة أو معروفة، استخدم معلومة غريبة أو حقيقة مذهلة عنها بدلاً من الوصف المباشر الممل.
2. الإيجاز الشديد (أولوية قصوى): اجعل السؤال قصيراً جداً ومختصراً (لا يتجاوز 10-15 كلمة). تجنب الحشو والمعلومات الزائدة التي تسهل الإجابة كثيراً.
3. التشويق والذكاء: صغ السؤال بأسلوب غامض وذكي يحفز التفكير، يشبه أسلوب 'السهل الممتنع'.
4. الإجابة الإلزامية: يجب ملء حقل 'answer' بإجابة دقيقة وصحيحة دائماً. يمنع ترك الحقل فارغاً.
5. التنوع: استخدم أنماطاً مختلفة (حقائق، روابط، ألغاز، استنتاج).${exclusionText}`;

    let promptText = "";
    let schema: any = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          answer: { type: Type.STRING },
          category: { type: Type.STRING },
          points: { type: Type.NUMBER },
          letter: { type: Type.STRING },
          hint: { type: Type.STRING },
          explanation: { type: Type.STRING },
          difficulty: { type: Type.STRING, enum: ["EASY", "MEDIUM", "HARD"] },
          type: { type: Type.STRING, enum: ["MCQ", "TRUE_FALSE", "OPEN"] }
        },
        required: ["text", "answer", "type"]
      }
    };

    let systemInstruction = "أنت صانع محتوى إبداعي ومصمم مسابقات محترف. يجب عليك دائماً إرجاع JSON كامل يحتوي على حقل 'answer' لكل سؤال.";

    if (mode === GameMode.HEX_GRID) {
      const lettersStr = batchLetters?.join("، ");
      promptText = `الموضوع: ${topic}
المستوى المطلوب: ${difficultyContext}

مهمتك هي توليد ${batchNum} سؤالاً، بحيث تبدأ إجابة كل سؤال بحرف محدد من القائمة التالية بالترتيب: [${lettersStr}].

معايير الجودة (إلزامية):
1. الدقة الحرفية المطلقة: يجب أن تبدأ الإجابة بالحرف المطلوب حصراً. 
   - يتم تجاهل "ال" التعريف في بداية الكلمة.
2. ${newQuestionMechanism}
3. المنطق والملاءمة: يجب أن يكون السؤال منطقياً، له إجابة واحدة دقيقة.
4. التنوع الإبداعي: ${randomAngle}
5. التنسيق: أرجع البيانات كمصفوفة JSON تحتوي على ${batchNum} كائناً.`;

      systemInstruction = `أنت صانع محتوى إبداعي ومصمم مسابقات محترف متخصص في "شبكة الحروف".
يجب عليك دائماً إرجاع مصفوفة JSON كاملة تحتوي على الحقول التالية لكل كائن:
- text: نص السؤال (مختصر وذكي).
- answer: الإجابة الصحيحة (يجب أن تبدأ بالحرف المطلوب).
- letter: الحرف المطلوب.
- difficulty: مستوى الصعوبة.
- explanation: شرح بسيط للإجابة.

تنبيه هام: لا تترك حقل "answer" فارغاً أبداً تحت أي ظرف.`;
      schema.items.required.push("letter");
    } else if (mode === GameMode.GRID) {
      const currentCategory = category || (categories && categories.length > 0 ? categories[0] : topic);
      promptText = `الموضوع الرئيسي للمسابقة: ${topic}
الفئة المطلوبة حالياً: ${currentCategory}

مهمتك هي توليد 5 أسئلة لهذه الفئة تحديداً. يجب أن تكون الأسئلة مرتبطة بشكل وثيق وحصري باسم الفئة "${currentCategory}".

تدرج الصعوبة والنقاط (إلزامي):
1. سؤال 100 نقطة: سهل جداً.
2. سؤال 200 نقطة: سهل.
3. سؤال 300 نقطة: متوسط.
4. سؤال 400 نقطة: صعب.
5. سؤال 500 نقطة: صعب جداً ونادر.

معايير الجودة:
1. ${newQuestionMechanism}
2. الدقة: تأكد من صحة المعلومات بنسبة 100%.`;

      systemInstruction = `أنت صانع محتوى إبداعي ومصمم مسابقات محترف متخصص في نظام "جيبوردي" (Jeopardy).
يجب عليك دائماً إرجاع مصفوفة JSON تحتوي على 5 كائنات بالحقول التالية:
- text: نص السؤال.
- answer: الإجابة الصحيحة (إلزامية).
- category: اسم الفئة ("${currentCategory}").
- points: النقاط (100، 200، 300، 400، 500).
- difficulty: مستوى الصعوبة.
- explanation: شرح بسيط.

تنبيه هام: لا تترك حقل "answer" فارغاً أبداً.`;
      schema.items.required.push("category", "points");
    } else {
      const buzzerContext = mode === GameMode.BUZZER ? "اجعل الأسئلة سريعة وممتعة، مناسبة لسرعة البديهة." : "";
      const silentGuessContext = mode === GameMode.SILENT_GUESS ? "مهم جداً: اجعل الكلمات عشوائية تماماً ومن مواضيع متنوعة جداً (لا تلتزم بموضوع واحد). يرجى ملء حقل 'category' بنوع الكلمة." : "";
      promptText = `أنشئ ${batchNum} سؤالاً حول "${topic}" بمستوى "${difficultyContext}".
${silentGuessContext}
وضع اللعبة: ${mode}
${buzzerContext}

معايير الجودة:
1. ${newQuestionMechanism}
2. الملاءمة الثقافية.
3. التنوع الإبداعي: ${randomAngle}`;

      systemInstruction = `أنت صانع محتوى إبداعي ومصمم مسابقات محترف.
يجب عليك دائماً إرجاع مصفوفة JSON كاملة تحتوي على الحقول:
- text: نص السؤال.
- answer: الإجابة الصحيحة (إلزامية).
- category: الفئة.
- points: النقاط.
- difficulty: الصعوبة.
- explanation: الشرح.

تنبيه هام: حقل "answer" يجب أن يحتوي على الإجابة الصحيحة دائماً.`;
    }

    const modelsToTry = [
      aiModel,
      "gemini-3-flash-preview",
      "gemini-3.1-flash-lite-preview",
      "gemini-3.1-pro-preview",
      "gemini-flash-latest"
    ].filter((m, i, self) => m && self.indexOf(m) === i);

    for (const currentModel of modelsToTry) {
      try {
        let textOutput = "";
        const seed = Math.floor(Math.random() * 1000000);
        
        if (currentModel.includes("gemini")) {
          const response = await retry(() => (ai.models as any).generateContent({
            model: currentModel, 
            contents: promptText,
            config: {
              systemInstruction: systemInstruction,
              responseMimeType: "application/json",
              maxOutputTokens: 8192,
              seed: seed,
              responseSchema: schema,
            }
          })) as any;
          
          textOutput = response.text || "[]";
          
          if (!textOutput || textOutput === "[]") {
            const candidate = response.candidates?.[0];
            if (candidate?.finishReason === 'SAFETY') {
              throw new Error("تم حجب الرد من قبل فلاتر الأمان.");
            }
          }
        } else {
          let apiKeys = {};
          try {
            const savedSettings = localStorage.getItem('appSettings');
            if (savedSettings) {
              const parsed = JSON.parse(savedSettings);
              if (parsed.apiKeys) apiKeys = parsed.apiKeys;
            }
          } catch (e) {}

          const sanitizedApiKeys = Object.entries(apiKeys || {}).reduce((acc, [key, value]) => {
            acc[key] = typeof value === 'string' ? value.replace(/[^\x20-\x7E]/g, "").trim() : value;
            return acc;
          }, {} as any);

          const res = await fetch('/api/generate-questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ promptText: promptText + " Return ONLY valid JSON array.", model: currentModel, apiKeys: sanitizedApiKeys })
          });
          
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || `Backend failed with status ${res.status}`);
          }
          const data = await res.json();
          textOutput = data.text;
        }

        textOutput = extractJson(textOutput);
        textOutput = textOutput.replace(/:\s*([0-9]{15,})[^,}\]]*/g, ': 100');
        
        let data: any[] = [];
        try {
          data = JSON.parse(textOutput || "[]");
          if (!Array.isArray(data) || data.length === 0) {
             if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
               data = [data];
             } else {
               throw new Error("Empty or invalid JSON array");
             }
          }
        } catch (e) {
          throw new Error("فشل في تحليل الرد من الذكاء الاصطناعي.");
        }

        const validQuestions = data.filter((q: any) => q && (q.text || q.question) && (q.answer || q.target));
        if (validQuestions.length === 0) {
          throw new Error("لم يتم العثور على أسئلة صالحة في الرد.");
        }

        return await Promise.all(validQuestions.map(async (q: any, idx: number) => {
          const globalIdx = batchStartIdx + idx;
          let actualLetter = q.letter;
          if (mode === GameMode.HEX_GRID && batchLetters) {
            actualLetter = batchLetters[idx] || q.letter;
          }

          let categoryName = q.category || category || topic;
          let questionPoints = 100;
          if (mode === GameMode.GRID) {
            questionPoints = q.points || ((idx % 5) + 1) * 100;
          }

          return {
            id: `q-${Date.now()}-${globalIdx}-${Math.random().toString(36).substr(2, 5)}`,
            text: q.text || "",
            answer: (isTrueFalse || isTrueFalseMode) 
              ? (q.answer?.includes("خطأ") || q.answer?.includes("غلط") || q.answer?.includes("false") ? "خطأ" : "صواب")
              : (q.target || q.answer || ""),
            category: categoryName,
            points: questionPoints,
            letter: actualLetter,
            hint: q.hint,
            explanation: q.explanation,
            type: (isTrueFalse || isTrueFalseMode) ? QuestionType.TRUE_FALSE : QuestionType.OPEN,
            difficulty: (q.difficulty as Difficulty) || difficulty,
            emojis: q.emojis
          };
        }));
      } catch (error: any) {
        const errorStr = String(error?.message || error || "");
        const isQuotaError = errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("QUOTA_EXCEEDED") || errorStr.includes("RESOURCE_EXHAUSTED");
        
        console.warn(`Model ${currentModel} failed: ${errorStr}. Trying next model...`);
        
        if (isQuotaError && currentModel === modelsToTry[modelsToTry.length - 1]) {
          throw new Error("انتهت حصة الاستخدام (Quota) لجميع المحركات المتاحة. يرجى الانتظار قليلاً أو استخدام مفتاح API خاص بك.");
        }
        continue;
      }
    }
    
    throw new Error("فشل توليد الأسئلة بعد تجربة جميع المحركات المتاحة.");
  };

  try {
    const allQuestions: Question[] = [];
    
    if (mode === GameMode.HEX_GRID) {
      const selectedLetters = shuffleArray(ARABIC_ALPHABET.slice(0, 28));
      const [batch1, batch2, batch3, batch4] = await Promise.all([
        generateSingleBatch(7, 0, selectedLetters.slice(0, 7)),
        generateSingleBatch(7, 7, selectedLetters.slice(7, 14)),
        generateSingleBatch(7, 14, selectedLetters.slice(14, 21)),
        generateSingleBatch(7, 21, selectedLetters.slice(21, 28))
      ]);
      allQuestions.push(...batch1, ...batch2, ...batch3, ...batch4);
    } else if (mode === GameMode.GRID) {
      const catsToUse = (categories && categories.length >= 5) 
        ? categories.slice(0, 5) 
        : (categories && categories.length > 0) 
          ? [...categories, ...Array(5 - categories.length).fill(null).map((_, i) => `فئة إضافية ${i+1}`)]
          : ["تاريخ", "جغرافيا", "علوم", "رياضة", "ثقافة عامة"];
      
      const categoryBatches = await Promise.all(
        catsToUse.map((cat, i) => generateSingleBatch(5, i * 5, undefined, cat))
      );
      
      categoryBatches.forEach(batch => allQuestions.push(...batch));
    } else if (numQuestions > 10) {
      for (let i = 0; i < numQuestions; i += 10) {
        const batchSize = Math.min(10, numQuestions - i);
        const batch = await generateSingleBatch(batchSize, i);
        allQuestions.push(...batch);
      }
    } else {
      const batch = await generateSingleBatch(numQuestions, 0);
      allQuestions.push(...batch);
    }

    if (allQuestions.length === 0) {
      throw new Error("لم يتمكن الذكاء الاصطناعي من توليد أي أسئلة صالحة. يرجى المحاولة مرة أخرى.");
    }

    return allQuestions;
  } catch (error: any) {
    const errorStr = error.message || String(error);
    const isQuotaError = errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("QUOTA_EXCEEDED") || errorStr.includes("RESOURCE_EXHAUSTED");
    
    if (isQuotaError) {
      useGeminiOnly = true;
      console.warn(`Model ${aiModel} quota exceeded.`);
      throw new Error("انتهت حصة الاستخدام (Quota) لجميع المحركات المتاحة حالياً. يرجى الانتظار قليلاً أو استخدام مفتاح API خاص بك.");
    }
    
    console.error("Generation failed:", errorStr);
    
    // If it's already gemini-3-flash-preview and it failed, don't recurse infinitely
    if (aiModel !== "gemini-3-flash-preview") {
      console.log("Retrying with fallback model: gemini-3-flash-preview");
      return generateQuestions(topic, numQuestions, types, mode, difficulty, "gemini-3-flash-preview", categories, excludedAnswers);
    }
    
    throw error;
  }
};

export const parseCustomJson = (
  jsonStr: string,
  topic: string,
  mode: GameMode,
  difficulty: Difficulty
): Question[] => {
  try {
    const rawData = JSON.parse(jsonStr);
    if (!Array.isArray(rawData)) {
      throw new Error("يجب أن يكون النص المدخل عبارة عن مصفوفة JSON.");
    }

    return rawData.map((q: any, idx: number) => {
      let category = q.category || topic;
      let points = q.points || 100;
      
      if (mode === GameMode.GRID && !q.category) {
        const catIndex = Math.floor(idx / 5);
        category = `الفئة ${catIndex + 1}`;
        points = ((idx % 5) + 1) * 100;
      }

      return {
        id: `custom-${Date.now()}-${idx}`,
        text: q.text || "سؤال غير معروف",
        answer: q.answer || "",
        category: category,
        points: points,
        letter: mode === GameMode.HEX_GRID ? (q.letter || ARABIC_ALPHABET[idx % 25]) : q.letter,
        type: QuestionType.OPEN,
        difficulty: (q.difficulty as Difficulty) || difficulty,
        emojis: q.emojis
      };
    });
  } catch (error: any) {
    throw new Error("فشل في تحليل JSON المدخل: " + error.message);
  }
};

export const getSampleJson = (mode: GameMode, topic: string): string => {
  if (mode === GameMode.HEX_GRID) {
    const samples = ARABIC_ALPHABET.slice(0, 25).map(l => ({
      text: `سؤال يبدأ بحرف ${l} عن ${topic}`,
      answer: `${l}...`,
      difficulty: "MEDIUM",
      letter: l
    }));
    return JSON.stringify(samples, null, 2);
  } else {
    const samples = [];
    for (let i = 0; i < 4; i++) {
      for (let j = 1; j <= 5; j++) {
        samples.push({
          text: `سؤال الفئة ${i + 1} بقيمة ${j * 100} عن ${topic}`,
          answer: "إجابة نموذجية",
          category: `الفئة ${i + 1}`,
          points: j * 100,
          difficulty: "MEDIUM"
        });
      }
    }
    return JSON.stringify(samples, null, 2);
  }
};

async function fallbackGenerate(topic: string, num: number, mode: GameMode, difficulty: Difficulty, aiModel: string = "gemini-3-flash-preview"): Promise<Question[]> {
  const ai = getAI();
  let textOutput = "";
  const currentModel = useGeminiOnly ? "gemini-3-flash-preview" : aiModel;
  let promptText = `أنشئ مصفوفة JSON بسيطة لـ ${num} أسئلة عن ${topic} بمستوى صعوبة ${getDifficultyText(difficulty)}. 
${mode === GameMode.SILENT_GUESS ? "مهم جداً: اجعل الكلمات عشوائية تماماً ومن مواضيع متنوعة جداً (لا تلتزم بموضوع واحد). يمكن أن تكون الكلمة مثلاً: أنمي، ماركة تجارية، شخص معروف، أو مكان مشهور." : ""}
مهم جداً: اجعل الأسئلة قصيرة جداً ومختصرة (لا تتجاوز 10-15 كلمة) وتجنب الإطالة التي تسهل الإجابة.
يجب أن يكون الرد عبارة عن مصفوفة JSON فقط تحتوي على كائنات بها الحقول "text" و "answer".
مثال: [ { "text": "سؤال؟", "answer": "إجابة" } ]`;

  try {
    if (currentModel.includes("gemini")) {
      const response = await retry(() => (ai.models as any).generateContent({
        model: currentModel, 
        contents: promptText,
        config: {
          systemInstruction: "أنت صانع محتوى إبداعي ومصمم مسابقات محترف.",
          responseMimeType: "application/json",
          maxOutputTokens: 4096,
          responseSchema: (() => {
              const schema: any = {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    answer: { type: Type.STRING },
                    letter: { type: Type.STRING },
                    hint: { type: Type.STRING },
                    explanation: { type: Type.STRING }
                  },
                  required: ["text", "answer"]
                }
              };
              return schema;
            })()
        }
      })) as any;
      textOutput = response.text || "[]";
    } else {
      let apiKeys = {};
      try {
        const savedSettings = localStorage.getItem('appSettings');
        if (savedSettings) {
          const parsed = JSON.parse(savedSettings);
          if (parsed.apiKeys) {
            apiKeys = parsed.apiKeys;
          }
        }
      } catch (e) {
        console.error("Failed to read API keys from settings", e);
      }

      const sanitizedApiKeys = Object.entries(apiKeys || {}).reduce((acc, [key, value]) => {
        acc[key] = typeof value === 'string' ? value.replace(/[^\x20-\x7E]/g, "").trim() : value;
        return acc;
      }, {} as any);

      const sanitizedModel = String(currentModel || "").replace(/[^\x20-\x7E]/g, "").trim();

      const res = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptText: promptText + " Return ONLY valid JSON array.", model: sanitizedModel, apiKeys: sanitizedApiKeys })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMsg = errorData.error || `Backend failed with status ${res.status}`;
        if (res.status === 429 || errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("QUOTA_EXCEEDED")) {
          console.warn("Quota exceeded for non-Gemini model during fallback, switching to Gemini...");
          useGeminiOnly = true;
          return fallbackGenerate(topic, num, mode, difficulty, "gemini-3-flash-preview");
        }
        throw new Error("Backend failed during fallback: " + errorMsg);
      }
      const data = await res.json();
      textOutput = data.text;
    }

    textOutput = extractJson(textOutput);
    textOutput = textOutput.replace(/:\s*([0-9]{15,})[^,}\]]*/g, ': 100');
    
    let data: any[] = [];
    try {
      data = JSON.parse(textOutput || "[]");
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("Empty or invalid JSON array during fallback");
      }
    } catch (e) {
      console.error("Fallback JSON Parse Error:", e, textOutput);
      throw new Error("فشل في تحليل الرد في المحاولة البديلة.");
    }
    
    return data.map((q: any, i: number) => {
      let category = topic;
      let points = 100;
      
      if (mode === GameMode.GRID) {
        const catIndex = Math.floor(i / 5);
        category = `الفئة ${catIndex + 1}`;
        points = ((i % 5) + 1) * 100;
      }

      let actualLetter = "";
      if (mode === GameMode.HEX_GRID) {
        if (q.answer) {
          actualLetter = q.answer.replace(/^ال/, '').trim().charAt(0).toUpperCase();
        } else {
          actualLetter = ARABIC_ALPHABET[i % 25];
        }
      }

      return {
        id: `fb-${Date.now()}-${i}`,
        text: q.text || "",
        answer: q.target || q.answer || "",
        category: q.category || category,
        points: q.points || points,
        letter: actualLetter,
        hint: q.hint,
        explanation: q.explanation,
        type: QuestionType.OPEN,
        difficulty: difficulty,
        emojis: q.emojis
      };
    });
  } catch (error: any) {
    const errorStr = typeof error === 'string' ? error : JSON.stringify(error);
    const isQuotaError = error.message?.includes("429") || error.message?.includes("quota") || error.message?.includes("QUOTA_EXCEEDED") || errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("RESOURCE_EXHAUSTED");
    
    if (isQuotaError) {
      throw new Error("انتهت حصة الاستخدام (Quota) لهذا المحرك. يرجى الانتظار أو تغيير المحرك.");
    } else {
      console.error("Fallback Generation Error:", error.message || error);
      throw error;
    }
  }
}

export const testAI = async (model: string): Promise<{ success: boolean, message: string }> => {
  try {
    const ai = getAI();
    const modelName = model.includes("gemini") ? model : "gemini-3-flash-preview";
    
    const response = await (ai.models as any).generateContent({
      model: modelName,
      contents: "Say 'OK' if you can read this.",
      config: { maxOutputTokens: 10 }
    }) as any;
    
    if (response.text && response.text.includes("OK")) {
      return { success: true, message: "تم الاتصال بنجاح!" };
    }
    return { success: false, message: "استجابة غير متوقعة من المحرك." };
  } catch (error: any) {
    console.error("AI Test Failed:", error);
    return { success: false, message: error.message || "فشل الاتصال بالمحرك." };
  }
};

export const fetchSingleQuestion = async (
  letter: string,
  topic: string,
  difficulty: Difficulty,
  aiModel: string,
  excludedAnswers: string[] = []
): Promise<Question> => {
  const limitedExclusions = excludedAnswers.slice(0, 100);
  const exclusionText = limitedExclusions.length > 0 
    ? `\nمهم جداً (أولوية قصوى): يمنع منعاً باتاً تكرار أي من الإجابات التالية لأنها استخدمت سابقاً: [${limitedExclusions.join("، ")}]. ابحث عن معلومة جديدة تماماً.`
    : "";

  const difficultyText = getDifficultyText(difficulty);
  const hardContext = difficulty === Difficulty.HARD 
    ? "\nملاحظة للمستوى الصعب: ابحث عن معلومة نادرة أو دقيقة جداً لا يعرفها إلا المتخصصون أو المطلعون بعمق على الموضوع." 
    : "";

  const randomAngles = [
    "ركز على معلومة تاريخية.",
    "ركز على معلومة علمية.",
    "ركز على شخصية مشهورة.",
    "ركز على مكان جغرافي.",
    "ركز على مصطلح تقني أو فني.",
    "ركز على حقيقة مذهلة وغير شائعة."
  ];
  const randomAngle = randomAngles[Math.floor(Math.random() * randomAngles.length)];

  const promptText = `اكتب سؤالاً واحداً فقط باللغة العربية تكون إجابته كلمة تبدأ بحرف "${letter}".
الموضوع: ${topic}
المستوى المطلوب: ${difficultyText}${hardContext}
التنوع المطلوب: ${randomAngle}

معايير الجودة (إلزامية):
1. الدقة الحرفية: يجب أن تبدأ الإجابة بالحرف "${letter}" حصراً (تجاهل "ال" التعريف).
2. الابتكار: ابتعد عن الأسئلة التقليدية والمملة.
3. الوضوح: يجب أن يكون السؤال واضحاً وله إجابة واحدة دقيقة.
4. عدم الذكر: لا تذكر الإجابة أو الحرف في نص السؤال.${exclusionText}
5. الإجابة الإلزامية: يجب ملء حقل "answer" بإجابة دقيقة وصحيحة دائماً. يمنع ترك الحقل فارغاً.`;

  const systemInstruction = `أنت صانع محتوى إبداعي ومصمم مسابقات محترف.
يجب عليك إرجاع كائن JSON واحد فقط يحتوي على:
- text: نص السؤال.
- answer: الإجابة الصحيحة (يجب أن تبدأ بحرف ${letter}).

تنبيه: لا تترك حقل "answer" فارغاً أبداً.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING, description: "نص السؤال" },
      answer: { type: Type.STRING, description: "الإجابة" }
    },
    required: ["text", "answer"]
  };

  const modelsToTry = [
    aiModel,
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite-preview",
    "gemini-flash-latest"
  ].filter((m, i, self) => m && self.indexOf(m) === i);

  for (const currentModel of modelsToTry) {
    try {
      let textOutput = "";
      let attempts = 0;
      const maxAttempts = 2;

      while (attempts < maxAttempts) {
        attempts++;
        if (currentModel.includes("gemini")) {
          const ai = getAI();
          const seed = Math.floor(Math.random() * 1000000);
          const response = await retry(() => (ai.models as any).generateContent({
            model: currentModel,
            contents: promptText,
            config: {
              systemInstruction: systemInstruction,
              responseMimeType: "application/json",
              maxOutputTokens: 2048,
              seed: seed,
              responseSchema: schema,
            }
          })) as any;
          
          textOutput = response.text || "{}";
          
          if (!textOutput || textOutput === "{}") {
            const candidate = response.candidates?.[0];
            if (candidate?.finishReason === 'SAFETY') {
              if (attempts < maxAttempts) continue;
              throw new Error("تم حجب الرد من قبل فلاتر الأمان.");
            }
          }
        } else {
          let apiKeys = {};
          try {
            const savedSettings = localStorage.getItem('appSettings');
            if (savedSettings) {
              const parsed = JSON.parse(savedSettings);
              if (parsed.apiKeys) apiKeys = parsed.apiKeys;
            }
          } catch (e) {}

          const sanitizedApiKeys = Object.entries(apiKeys || {}).reduce((acc, [key, value]) => {
            acc[key] = typeof value === 'string' ? value.replace(/[^\x20-\x7E]/g, "").trim() : value;
            return acc;
          }, {} as any);

          const res = await fetch('/api/generate-questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ promptText: promptText + " Return ONLY valid JSON object.", model: currentModel, apiKeys: sanitizedApiKeys })
          });
          
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || `Backend failed with status ${res.status}`);
          }
          const data = await res.json();
          textOutput = data.text;
        }

        textOutput = extractJson(textOutput);
        let data: any;
        try {
          data = JSON.parse(textOutput);
        } catch (e) {
          if (attempts < maxAttempts) continue;
          throw new Error("فشل في تحليل JSON.");
        }

        if (!data.text || !data.answer) {
          if (attempts < maxAttempts) continue;
          throw new Error("بيانات غير مكتملة.");
        }

        return {
          id: `sq-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          text: data.text,
          answer: data.answer,
          category: topic,
          points: 100,
          letter: letter,
          type: QuestionType.OPEN,
          difficulty: difficulty
        };
      }
    } catch (error: any) {
      const errorStr = String(error?.message || error || "");
      const isQuotaError = errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("QUOTA_EXCEEDED") || errorStr.includes("RESOURCE_EXHAUSTED");
      
      console.warn(`Model ${currentModel} failed for fetchSingleQuestion: ${errorStr}`);
      
      if (isQuotaError && currentModel === modelsToTry[modelsToTry.length - 1]) {
        throw new Error("انتهت حصة الاستخدام لجميع المحركات.");
      }
      continue;
    }
  }
  
  throw new Error("فشل الذكاء الاصطناعي في توليد السؤال المطلوب.");
};
