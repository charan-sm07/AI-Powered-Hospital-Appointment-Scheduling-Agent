import { validateRealName, validateRealPhone } from '../services/security/validator.js';

const testCasesName = [
  { input: "John Smith", expected: true },
  { input: "Dr. Anna Miller", expected: true },
  { input: "Jean-Pierre", expected: true },
  { input: "O'Connor", expected: true },
  { input: "A", expected: false }, // Too short
  { input: "John123", expected: false }, // Numbers
  { input: "John Doe", expected: false }, // Placeholder
  { input: "Jane Doe", expected: false }, // Placeholder
  { input: "Test Patient", expected: false }, // Placeholder
  { input: "asdfghjkl", expected: false }, // Mashing / no vowels
  { input: "Johnnnnnn", expected: false }, // Repeating characters
  { input: "!!!!!", expected: false } // Symbols
];

const testCasesPhone = [
  { input: "9876543210", expected: false }, // Sequential
  { input: "+1-555-234-5678", expected: true },
  { input: "+91 98765 43211", expected: true }, // Non-sequential
  { input: "9840123456", expected: true }, // Non-sequential
  { input: "1234567", expected: false }, // Sequential
  { input: "123", expected: false }, // Too short
  { input: "9999999999", expected: false }, // Repeating
  { input: "1234567890", expected: false }, // Sequential
  { input: "5550101", expected: false }, // Placeholder
  { input: "5550199", expected: false }, // Placeholder
  { input: "abcdefghij", expected: false } // Non-digits
];

let failed = 0;

console.log('=== Running Patient Name Validation Tests ===');
for (const tc of testCasesName) {
  const result = validateRealName(tc.input);
  const passed = result.isValid === tc.expected;
  if (!passed) {
    failed++;
    console.error(`❌ FAIL: Name "${tc.input}" | Expected: ${tc.expected} | Got: ${result.isValid} | Reason: ${result.reason}`);
  } else {
    console.log(`✅ PASS: Name "${tc.input}" -> isValid: ${result.isValid} (${result.reason})`);
  }
}

console.log('\n=== Running Patient Phone Validation Tests ===');
for (const tc of testCasesPhone) {
  const result = validateRealPhone(tc.input);
  const passed = result.isValid === tc.expected;
  if (!passed) {
    failed++;
    console.error(`❌ FAIL: Phone "${tc.input}" | Expected: ${tc.expected} | Got: ${result.isValid} | Reason: ${result.reason}`);
  } else {
    console.log(`✅ PASS: Phone "${tc.input}" -> isValid: ${result.isValid} (${result.reason})`);
  }
}

console.log('\n-----------------------------------------');
if (failed === 0) {
  console.log('🎉 All validator tests passed successfully!');
  process.exit(0);
} else {
  console.error(`❌ ${failed} tests failed.`);
  process.exit(1);
}
