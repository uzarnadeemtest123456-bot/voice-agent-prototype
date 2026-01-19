/**
 * Hallucination Detection Utilities
 * Advanced detection of Whisper STT hallucinations
 */

import { HALLUCINATION_PATTERNS, HALLUCINATION_CONFIG } from './hallucinationConfig';

/**
 * Check if text matches known hallucination patterns
 */
function matchesHallucinationPattern(text) {
  const trimmed = text.trim();

  // Empty or very short
  if (trimmed.length === 0 || trimmed.length < 2) {
    return { isHallucination: true, reason: 'too_short', pattern: 'empty' };
  }

  // Check against hallucination patterns
  for (let i = 0; i < HALLUCINATION_PATTERNS.length; i++) {
    const pattern = HALLUCINATION_PATTERNS[i];
    if (pattern.test(trimmed)) {
      return { 
        isHallucination: true, 
        reason: 'pattern_match', 
        pattern: pattern.toString() 
      };
    }
  }

  return { isHallucination: false };
}

/**
 * Detect repetitive patterns (e.g., "you are you are you are...")
 * This is a CRITICAL check for background noise hallucinations
 */
function hasRepetitivePattern(text) {
  const trimmed = text.trim().toLowerCase();
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);

  if (words.length < 3) {
    return { isHallucination: false };
  }

  // Check 1: Consecutive word repetition (e.g., "you you you")
  let consecutiveCount = 1;
  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1]) {
      consecutiveCount++;
      if (consecutiveCount >= HALLUCINATION_CONFIG.REPETITION.MIN_CONSECUTIVE_REPEATS) {
        return { 
          isHallucination: true, 
          reason: 'consecutive_repetition',
          detail: `Word "${words[i]}" repeated ${consecutiveCount} times`
        };
      }
    } else {
      consecutiveCount = 1;
    }
  }

  // Check 2: 2-word phrase repetition (e.g., "you are you are you are")
  const twoWordPhrases = new Map();
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = `${words[i]} ${words[i + 1]}`;
    twoWordPhrases.set(phrase, (twoWordPhrases.get(phrase) || 0) + 1);
    
    if (twoWordPhrases.get(phrase) >= HALLUCINATION_CONFIG.REPETITION.MIN_PHRASE_REPEATS) {
      return { 
        isHallucination: true, 
        reason: 'phrase_repetition',
        detail: `Phrase "${phrase}" repeated ${twoWordPhrases.get(phrase)} times`
      };
    }
  }

  // Check 3: 3-word phrase repetition (e.g., "I don't know I don't know")
  const threeWordPhrases = new Map();
  for (let i = 0; i < words.length - 2; i++) {
    const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    threeWordPhrases.set(phrase, (threeWordPhrases.get(phrase) || 0) + 1);
    
    if (threeWordPhrases.get(phrase) >= HALLUCINATION_CONFIG.REPETITION.MIN_PHRASE_REPEATS) {
      return { 
        isHallucination: true, 
        reason: 'phrase_repetition',
        detail: `Phrase "${phrase}" repeated ${threeWordPhrases.get(phrase)} times`
      };
    }
  }

  // Check 4: Low unique word ratio (e.g., "the the a the a the")
  const uniqueWords = new Set(words);
  const uniqueRatio = uniqueWords.size / words.length;
  
  if (words.length >= 5 && uniqueRatio < HALLUCINATION_CONFIG.REPETITION.MIN_UNIQUE_WORD_RATIO) {
    return { 
      isHallucination: true, 
      reason: 'low_unique_ratio',
      detail: `Only ${Math.round(uniqueRatio * 100)}% unique words (${uniqueWords.size}/${words.length})`
    };
  }

  return { isHallucination: false };
}

/**
 * Analyze audio quality metrics
 */
function analyzeAudioQuality(audioBlob, transcriptText) {
  const audioSize = audioBlob.size;
  const words = transcriptText.trim().split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  // Check minimum size
  if (audioSize < HALLUCINATION_CONFIG.MIN_AUDIO_SIZE_BYTES) {
    return {
      isHallucination: true,
      reason: 'audio_too_small',
      detail: `Audio size: ${audioSize} bytes (min: ${HALLUCINATION_CONFIG.MIN_AUDIO_SIZE_BYTES})`
    };
  }

  // Estimate duration from blob size
  // Rough estimate: WebM at ~16kbps = 2KB/sec, so 10KB = ~5 seconds
  // This is approximate - actual duration would require parsing the file
  const estimatedDuration = audioSize / 2000; // rough estimate in seconds

  if (estimatedDuration < HALLUCINATION_CONFIG.MIN_AUDIO_DURATION_SECONDS) {
    return {
      isHallucination: true,
      reason: 'audio_too_short',
      detail: `Estimated duration: ${estimatedDuration.toFixed(2)}s (min: ${HALLUCINATION_CONFIG.MIN_AUDIO_DURATION_SECONDS}s)`
    };
  }

  // Check words per second ratio
  if (wordCount > 0 && estimatedDuration > 0) {
    const wordsPerSecond = wordCount / estimatedDuration;

    // Too many words for the duration = suspicious
    if (wordsPerSecond > HALLUCINATION_CONFIG.MAX_WORDS_PER_SECOND) {
      return {
        isHallucination: true,
        reason: 'words_per_second_too_high',
        detail: `${wordsPerSecond.toFixed(2)} words/sec (max: ${HALLUCINATION_CONFIG.MAX_WORDS_PER_SECOND})`
      };
    }

    // Too few words for the duration = likely hallucination from noise
    if (wordsPerSecond < HALLUCINATION_CONFIG.MIN_WORDS_PER_SECOND && wordCount < 5) {
      return {
        isHallucination: true,
        reason: 'words_per_second_too_low',
        detail: `${wordsPerSecond.toFixed(2)} words/sec in ${estimatedDuration.toFixed(1)}s (likely background noise)`
      };
    }
  }

  return { isHallucination: false };
}

/**
 * Comprehensive hallucination detection
 * Combines all detection methods
 */
export function isLikelyHallucination(text, audioBlob = null) {
  const trimmed = text.trim();

  // Run all detection checks
  const checks = [
    matchesHallucinationPattern(trimmed),
    hasRepetitivePattern(trimmed),
  ];

  // Add audio quality check if blob provided
  if (audioBlob) {
    checks.push(analyzeAudioQuality(audioBlob, trimmed));
  }

  // Find first hallucination detection
  for (const check of checks) {
    if (check.isHallucination) {
      return check;
    }
  }

  return { isHallucination: false };
}

/**
 * Log hallucination detection for debugging
 */
export function logHallucinationDetection(transcript, detectionResult, audioSize = null) {
  if (!HALLUCINATION_CONFIG.ENABLE_DEBUG_LOGGING) {
    return;
  }

  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    transcript: transcript.substring(0, 200), // Limit length
    audioSize,
    filtered: detectionResult.isHallucination,
    reason: detectionResult.reason,
    detail: detectionResult.detail,
    pattern: detectionResult.pattern,
  };

  if (detectionResult.isHallucination) {
    console.warn('🚫 [HALLUCINATION FILTERED]', logData);
  } else {
    console.log('✅ [TRANSCRIPT PASSED]', logData);
  }
}
