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

export function stripPronunciationMarkers(text) {
  if (!text) return "";
  return text.replace(/~/g, "");
}

export function normalizePronunciationMarkers(text) {
  if (!text) return "";
  const normalized = text.replace(NUMBER_TOKEN_REGEX, (raw) => {
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
