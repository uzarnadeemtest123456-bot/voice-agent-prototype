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

// URL pattern - matches common URL formats including complex paths and query parameters
const URL_REGEX = /\b(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s,;()\[\]{}]*)?/g;

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
 *       "https://api.example.com/docs" -> "api dot example dot com slash docs"
 *       "https://vercel.com/user/project/deployments/id=123" -> "vercel dot com"
 * 
 * For long URLs with complex paths/parameters, we simplify by only pronouncing the domain
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
  
  // Handle path intelligently based on complexity
  if (path) {
    // Count path segments and check for query parameters
    const pathSegments = path.split("/").filter(seg => seg.length > 0);
    const hasQueryParams = path.includes("?") || path.includes("=") || path.includes("&");
    
    // If URL is complex (many segments or has query params), just pronounce domain
    if (pathSegments.length > 3 || hasQueryParams || path.length > 40) {
      // Just return domain for very complex URLs
      return domain;
    }
    
    // For simple paths (1-3 segments, no params), pronounce them
    if (pathSegments.length <= 3 && !hasQueryParams) {
      // Convert path segments: replace slashes and hyphens
      let simplePath = pathSegments
        .map(seg => seg.replace(/-/g, " ").replace(/_/g, " "))
        .join(" slash ");
      
      return `${domain} slash ${simplePath}`;
    }
  }
  
  // Default: just return domain
  return domain;
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
