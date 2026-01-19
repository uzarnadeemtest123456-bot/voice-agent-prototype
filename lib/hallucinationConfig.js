/**
 * Hallucination Detection Configuration
 * Patterns and rules for detecting Whisper STT hallucinations
 */

// Common Whisper hallucinations when there's silence or background noise
export const HALLUCINATION_PATTERNS = [
  // Basic gratitude
  /^thank you\.?$/i,
  /^thanks\.?$/i,
  /^thank you very much\.?$/i,
  /^thank you so much\.?$/i,
  /^thanks a lot\.?$/i,
  /^much appreciated\.?$/i,
  /^thanks for watching\.?$/i,
  /^thank you for watching\.?$/i,
  
  // YouTube/Social media specific
  /^subscribe\.?$/i,
  /^please subscribe\.?$/i,
  /^like and subscribe\.?$/i,
  /^don't forget to subscribe\.?$/i,
  /^hit the bell icon\.?$/i,
  /^smash that like button\.?$/i,
  /^check out the link in description\.?$/i,
  
  // Basic affirmations/responses
  /^yes\.?$/i,
  /^yeah\.?$/i,
  /^yep\.?$/i,
  /^yup\.?$/i,
  /^okay\.?$/i,
  /^ok\.?$/i,
  /^alright\.?$/i,
  /^all right\.?$/i,
  /^sure\.?$/i,
  /^right\.?$/i,
  
  // Greetings/farewells
  /^bye\.?$/i,
  /^goodbye\.?$/i,
  /^good bye\.?$/i,
  /^hello\.?$/i,
  /^hi\.?$/i,
  /^hey\.?$/i,
  
  // Fillers and hesitations
  /^hmm\.?$/i,
  /^hm\.?$/i,
  /^uh\.?$/i,
  /^um\.?$/i,
  /^ah\.?$/i,
  /^oh\.?$/i,
  /^eh\.?$/i,
  /^mm-hmm\.?$/i,
  /^mm\.?$/i,
  /^uh-huh\.?$/i,
  /^you know\.?$/i,
  /^i mean\.?$/i,
  /^like\.?$/i,
  
  // Single words/pronouns
  /^you\.?$/i,
  /^the\.?$/i,
  /^a\.?$/i,
  /^and\.?$/i,
  
  // Punctuation/empty
  /^\s*$/,
  /^\.+$/,
  /^,+$/,
  /^!+$/,
  /^\?+$/,
  
  // Subtitles/captions
  /^subtitles by.*$/i,
  /^captions by.*$/i,
  /^transcribed by.*$/i,
  
  // Music and sound effects
  /^\[music\]$/i,
  /^\[music playing\]$/i,
  /^\[applause\]$/i,
  /^\[laughter\]$/i,
  /^\[silence\]$/i,
  /^\[background noise\]$/i,
  /^music\.?$/i,
  /^♪+$/,
  
  // Generic brackets (but allow named speakers)
  /^\[(?!.*:).*\]$/,  // Matches [text] but not [Speaker: text]
  /^\((?!.*:).*\)$/,  // Matches (text) but not (Speaker: text)
  
  // Multilingual common words
  /^merci\.?$/i,       // French: thanks
  /^gracias\.?$/i,     // Spanish: thanks
  /^danke\.?$/i,       // German: thanks
  /^arigato\.?$/i,     // Japanese: thanks
  /^si\.?$/i,          // Spanish: yes
  /^oui\.?$/i,         // French: yes
  /^hola\.?$/i,        // Spanish: hello
  /^bonjour\.?$/i,     // French: hello
  
  // Background noise interpretations
  /^static\.?$/i,
  /^noise\.?$/i,
  /^buzzing\.?$/i,
  /^beep\.?$/i,
  /^beeping\.?$/i,
];

// Configuration thresholds
export const HALLUCINATION_CONFIG = {
  // Minimum audio blob size (10KB for meaningful speech)
  MIN_AUDIO_SIZE_BYTES: 10000,
  
  // Minimum audio duration in seconds
  MIN_AUDIO_DURATION_SECONDS: 0.5,
  
  // Maximum words per second (too high = likely hallucination)
  MAX_WORDS_PER_SECOND: 8,
  
  // Minimum words per second (too low for given duration = likely hallucination)
  MIN_WORDS_PER_SECOND: 0.5,
  
  // Repetition detection
  REPETITION: {
    // How many times a word must repeat to be considered hallucination
    MIN_CONSECUTIVE_REPEATS: 3,
    
    // How many times a phrase (2-3 words) must repeat
    MIN_PHRASE_REPEATS: 2,
    
    // Maximum allowed ratio of unique words to total words
    MIN_UNIQUE_WORD_RATIO: 0.4, // If <40% unique words, likely hallucination
  },
  
  // Temperature setting (0 = less creative/hallucinatory)
  WHISPER_TEMPERATURE: 0.0,
  
  // Logging
  ENABLE_DEBUG_LOGGING: process.env.NEXT_PUBLIC_DEBUG_HALLUCINATION === 'true',
};
