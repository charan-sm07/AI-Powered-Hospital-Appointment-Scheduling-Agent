import { SUSPICION_THRESHOLD } from '../../config/env.js';
import SecurityEvent from '../../models/SecurityEvent.js';

// In-memory rate limiting map: userId -> array of timestamps
const rateLimitMap = new Map();

// Regex blacklist for prompt injections and suspicious technical commands
const blacklist = [
  /ignore\s+(?:any|previous|all)?\s+instructions/i,
  /system\s+prompt/i,
  /bypass\s+safety/i,
  /reveal\s+(?:your)?\s+instructions/i,
  /behave\s+as/i,
  /pretend\s+to/i,
  /act\s+as\s+a/i,
  /drop\s+table/i,
  /mongo\s+injection/i,
  /delete\s+(?:all\s+)?database/i,
  /developer\s+mode/i,
  /base64\s+bypass/i,
  /{\s*"\$ne"\s*:/i, // Mongo Query Injection
  /{\s*"\$gt"\s*:/i,
  /eval\s*\(/i,
  /<script>/i
];

/**
 * Computes the Shannon Entropy of a string to detect encoded payloads/obfuscation.
 */
function calculateShannonEntropy(str) {
  if (!str) return 0;
  const len = str.length;
  const frequencies = {};
  for (let i = 0; i < len; i++) {
    const char = str[i];
    frequencies[char] = (frequencies[char] || 0) + 1;
  }
  let entropy = 0;
  for (const char in frequencies) {
    const p = frequencies[char] / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Detects mixed Unicode scripts, RTL overrides, and zero-width characters.
 */
function detectUnicodeObfuscation(str) {
  if (!str) return false;

  // RTL Override (\u202E) or zero-width chars (\u200B-\u200D, \uFEFF)
  const containsHiddenChars = /[\u202E\u200B-\u200D\uFEFF]/.test(str);
  if (containsHiddenChars) return true;

  // Check for mixed Cyrillic and Latin scripts
  const hasLatin = /[a-zA-Z]/.test(str);
  const hasCyrillic = /[\u0400-\u04FF]/.test(str);
  if (hasLatin && hasCyrillic) return true;

  return false;
}

/**
 * In-memory rate limiting: returns true if >8 messages in last 60 seconds.
 */
function checkRateAbuse(userId) {
  if (!userId) return false;
  const now = Date.now();
  const windowMs = 60000;
  const limit = 8;

  if (!rateLimitMap.has(userId)) {
    rateLimitMap.set(userId, [now]);
    return false;
  }

  const timestamps = rateLimitMap.get(userId);
  // Keep only timestamps within last 60s
  const recentTimestamps = timestamps.filter(ts => now - ts < windowMs);
  recentTimestamps.push(now);
  rateLimitMap.set(userId, recentTimestamps);

  return recentTimestamps.length > limit;
}

/**
 * Scores an incoming message for security issues.
 * @param {string} text - Message text to score
 * @param {string} userId - User identifier (session ID or patient ID)
 * @returns {Promise<{score: number, isSafe: boolean, signals: object}>}
 */
export async function scoreMessage(text, userId) {
  const signals = {
    regexBlacklist: 0,
    entropyAnomaly: 0,
    unicodeObfuscation: 0,
    rateAbuse: 0
  };

  // 1. Regex Blacklist (30% weight)
  const matchesBlacklist = blacklist.some(regex => regex.test(text));
  if (matchesBlacklist) {
    signals.regexBlacklist = 1;
  }

  // 2. Entropy Anomaly (20% weight)
  // Standard English text usually has entropy < 4.5 (unless extremely short).
  // Encrypted/base64 strings or random keyboard mashing usually exceeds 5.0.
  const entropy = calculateShannonEntropy(text);
  if (entropy > 5.2 && text.length > 10) {
    signals.entropyAnomaly = 1;
  }

  // 3. Unicode Obfuscation (20% weight)
  if (detectUnicodeObfuscation(text)) {
    signals.unicodeObfuscation = 1;
  }

  // 4. Rate Abuse (30% weight)
  if (checkRateAbuse(userId)) {
    signals.rateAbuse = 1;
  }

  // Calculate weighted sum
  const score = (signals.regexBlacklist * 0.3) +
                (signals.entropyAnomaly * 0.2) +
                (signals.unicodeObfuscation * 0.2) +
                (signals.rateAbuse * 0.3);

  const isSafe = score < SUSPICION_THRESHOLD;

  // On unsafe: save a SecurityEvent doc
  if (!isSafe) {
    try {
      const event = new SecurityEvent({
        userId: userId || 'anonymous',
        messageText: text ? text.substring(0, 500) : '',
        suspicionScore: score,
        actionTaken: 'quarantined'
      });
      await event.save();
      console.log(`[Security] Logged security threat from ${userId || 'anonymous'} with score ${score}`);
    } catch (err) {
      console.error('[Security] Failed to save security event:', err.message);
    }
  }

  return {
    score,
    isSafe,
    signals
  };
}
