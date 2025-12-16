/**
 * Simple breathing animation calculator for idle state
 * @param {number} time - Current time in milliseconds
 * @returns {number} Scale value (0.95 - 1.05)
 */
export function getBreathingScale(time) {
  // Slow sine wave for gentle breathing effect
  const breathingSpeed = 0.002; // Slow breathing
  const breathingAmount = 0.05; // Small amplitude
  return 1 + Math.sin(time * breathingSpeed) * breathingAmount;
}
