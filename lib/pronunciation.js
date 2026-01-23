import { toWords } from "number-to-words";

const DIGIT_WORDS = {
  "0": "zero",
  "1": "one",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "nine",
};

const NUMBER_TOKEN_REGEX = /\b\d[\d.]*\b/g;

// URL pattern - matches common URL formats
const URL_REGEX = /\b(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?\b/g;

function digitsToWords(digits, separator) {
  return digits
    .split("")
    .map((digit) => DIGIT_WORDS[digit] ?? digit)
    .join(separator);
}

function libraryToWords(value, separator = " ") {
  if (!Number.isFinite(value)) return null;
  try {
    const words = toWords(value);
    return separator === " " ? words : words.replace(/\s+/g, separator);
  } catch {
    return null;
  }
}

function pronounceIntegerWithLibrary(raw, separator = " ") {
  if (raw.length > 1 && raw.startsWith("0")) {
    return digitsToWords(raw, separator);
  }
  const value = Number(raw);
  const words = libraryToWords(value, separator);
  return words ?? digitsToWords(raw, separator);
}

function pronounceDecimal(raw) {
  const [integerPart, fractionalPart] = raw.split(".");
  if (!fractionalPart) return raw;
  const integerWords = pronounceIntegerWithLibrary(integerPart, " ");
  if (integerWords === integerPart) return raw;
  const fractionalWords = digitsToWords(fractionalPart, " ");
  return `${integerWords} point ${fractionalWords}`;
}

/**
 * Convert URL to pronounceable format
 * e.g., "www.google.com" -> "google dot com"
 *       "https://api.example.com/path" -> "api dot example dot com slash path"
 */
function pronounceURL(url) {
  // Remove protocol (http://, https://)
  let speakable = url.replace(/^https?:\/\//, "");
  
  // Remove www. prefix (optional - you can keep it by commenting this line)
  speakable = speakable.replace(/^www\./, "");
  
  // Split into domain and path
  const slashIndex = speakable.indexOf("/");
  let domain = slashIndex >= 0 ? speakable.substring(0, slashIndex) : speakable;
  let path = slashIndex >= 0 ? speakable.substring(slashIndex) : "";
  
  // Replace dots in domain with " dot "
  domain = domain.replace(/\./g, " dot ");
  
  // Handle path: replace slashes with " slash "
  if (path) {
    path = path.replace(/\//g, " slash ");
    // Remove trailing slash
    path = path.replace(/\s+slash\s*$/, "");
  }
  
  // Combine domain and path
  return path ? `${domain}${path}` : domain;
}

export function stripPronunciationMarkers(text) {
  if (!text) return "";
  return text.replace(/~/g, "");
}

export function normalizePronunciationMarkers(text) {
  if (!text) return "";
  
  // First, handle URLs (before numbers, as URLs may contain numbers)
  let normalized = text.replace(URL_REGEX, (url) => {
    return pronounceURL(url);
  });
  
  // Then, handle numbers
  normalized = normalized.replace(NUMBER_TOKEN_REGEX, (raw) => {
    const dotMatches = raw.match(/\./g);
    const dotCount = dotMatches ? dotMatches.length : 0;

    if (dotCount > 1) {
      return raw;
    }

    if (dotCount === 1) {
      const converted = pronounceDecimal(raw);
      return converted;
    }

    if (raw.length <= 4) {
      const converted = pronounceIntegerWithLibrary(raw, " ");
      return converted;
    }

    const converted = digitsToWords(raw, "-");
    return converted;
  });
  
  return normalized.replace(/~/g, "");
}
