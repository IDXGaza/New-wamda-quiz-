export const normalizeArabic = (text: string): string => {
  if (!text) return '';
  
  // 1. Remove diacritics/tashkeel
  let normalized = text.replace(/[\u064B-\u065F]/g, '');
  
  // 2. Normalize Alifs (أإآ -> ا)
  normalized = normalized.replace(/[أإآ]/g, 'ا');
  
  // 3. Normalize Ya (ى -> ي)
  normalized = normalized.replace(/ى/g, 'ي');
  
  // 4. Case normalization (for mixed scripts)
  return normalized.toLowerCase().trim();
};
