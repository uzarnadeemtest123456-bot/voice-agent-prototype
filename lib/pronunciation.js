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

export function stripPronunciationMarkers(text) {
  if (!text) return "";
  return text.replace(/~/g, "");
}

export function normalizePronunciationMarkers(text) {
  if (!text) return "";
  const normalized = text.replace(/~(\d+)~/g, (_, digits) => (
    digits.split("").map((digit) => DIGIT_WORDS[digit] ?? digit).join("-")
  ));
  return normalized.replace(/~/g, "");
}
