/**
 * Validates whether a given name is a realistic human name or a fake/placeholder.
 * @param {string} name - Name to validate
 * @returns {{isValid: boolean, reason: string|null}}
 */
export function validateRealName(name) {
  if (!name) return { isValid: false, reason: 'Name is empty.' };
  
  const clean = name.trim();
  
  // 1. Length Check
  if (clean.length < 2) {
    return { isValid: false, reason: 'Name must be at least 2 characters long.' };
  }
  if (clean.length > 50) {
    return { isValid: false, reason: 'Name must be under 50 characters long.' };
  }

  // 2. Character Check (letters, spaces, dots, hyphens, apostrophes only)
  // Support both standard Latin characters and Indian Unicode ranges (Tamil, Devanagari)
  const nameRegex = /^[a-zA-Z\s.\-'\u0B80-\u0BFF\u0900-\u097F]+$/;
  if (!nameRegex.test(clean)) {
    return { isValid: false, reason: 'Name can only contain letters, spaces, dots, and hyphens.' };
  }

  // 3. Blacklist Check
  const lower = clean.toLowerCase();
  const blacklist = [
    'john doe', 'jane doe', 'test patient', 'patient test',
    'fake name', 'placeholder', 'no name', 'anonymous', 'unknown',
    'asdf', 'qwerty', 'none', 'null', 'undefined', 'test', 'testing',
    'something', 'someone', 'admin', 'doctor', 'physician', 'hospital',
    'lorem', 'ipsum', 'dummy', 'not real', 'user name', 'first last'
  ];

  if (blacklist.some(item => lower === item || lower.includes(item))) {
    return { isValid: false, reason: `"${clean}" is recognized as a placeholder or test name.` };
  }

  // 4. Keyboard Mashing / Repeated Characters
  // Check for 4 or more identical consecutive characters (e.g., "aaaa")
  if (/(.)\1{3,}/.test(lower)) {
    return { isValid: false, reason: 'Name contains too many repeating characters.' };
  }

  // Check for vowel presence (for Latin-based names)
  // Only check if it contains Latin characters to avoid false flagging Tamil/Hindi names
  if (/[a-z]/i.test(lower)) {
    const hasVowels = /[aeiouy]/.test(lower);
    if (!hasVowels) {
      return { isValid: false, reason: 'Name seems to be a combination of random consonants.' };
    }
  }

  return { isValid: true, reason: null };
}

/**
 * Validates whether a given phone number is a realistic phone number or a fake/placeholder.
 * @param {string} phone - Phone number to validate
 * @returns {{isValid: boolean, reason: string|null}}
 */
export function validateRealPhone(phone) {
  if (!phone) return { isValid: false, reason: 'Phone number is empty.' };

  // Remove whitespace, hyphens, brackets, and leading '+'
  const clean = phone.replace(/[\s\-()]/g, '').replace(/^\+/, '');

  // 1. Digits Only Check
  if (!/^\d+$/.test(clean)) {
    return { isValid: false, reason: 'Phone number must only contain digits and optionally a leading "+".' };
  }

  // 2. Length Check (typically 7 to 15 digits for E.164 standard)
  if (clean.length < 7 || clean.length > 15) {
    return { isValid: false, reason: 'Phone number must be between 7 and 15 digits long.' };
  }

  // 3. Repeating Digits Check (e.g. 9999999999, 1111111111, 0000000000)
  if (/^(\d)\1+$/.test(clean)) {
    return { isValid: false, reason: 'Phone number cannot consist of all identical digits.' };
  }

  // 4. Sequential Digits Check (e.g. 1234567890, 0123456789, 9876543210, 1234567, 7654321)
  const sequentialUp = '01234567890123456789';
  const sequentialDown = '98765432109876543210';
  if (sequentialUp.includes(clean) || sequentialDown.includes(clean)) {
    return { isValid: false, reason: 'Phone number cannot contain sequential digits.' };
  }

  // 5. Placeholder patterns (e.g. 555-01XX in US)
  // If the clean number ends with 5550100 to 5550199
  if (/55501\d{2}$/.test(clean)) {
    return { isValid: false, reason: 'Phone number contains a reserved placeholder exchange.' };
  }

  // 6. Repeating pattern check (e.g., 1212121212, 1231231231)
  // Check if phone repeats a 2-digit or 3-digit sequence
  if (clean.length >= 8) {
    const chunk2 = clean.substring(0, 2);
    const repeats2 = clean.split(chunk2).join('') === '';
    if (repeats2) {
      return { isValid: false, reason: 'Phone number cannot be a simple repeating sequence.' };
    }

    const chunk3 = clean.substring(0, 3);
    const repeats3 = clean.split(chunk3).join('') === '';
    if (repeats3) {
      return { isValid: false, reason: 'Phone number cannot be a simple repeating sequence.' };
    }
  }

  return { isValid: true, reason: null };
}
