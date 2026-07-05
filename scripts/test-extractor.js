import { extractSlot } from '../services/nlp/extractor.js';

const runTests = async () => {
  console.log('\n--- Running NLP Extractor Slot Extraction Tests ---\n');

  const tests = [
    // 1. Specialization
    {
      slotName: 'specialization',
      inputs: [
        "I have a heart problem and need to see a specialist",
        "Can I book a skin doctor for tomorrow?",
        "I'd like to see a child doctor",
        "Need someone to check my ears, nose and throat"
      ]
    },
    // 2. Preferred Time
    {
      slotName: 'preferredTime',
      inputs: [
        "morning please",
        "around 3pm",
        "10:30 am",
        "late evening"
      ]
    },
    // 3. Timeframe
    {
      slotName: 'timeframe',
      inputs: [
        "next Monday",
        "tomorrow afternoon",
        "Friday",
        "on Wednesday please"
      ]
    },
    // 4. Patient Type
    {
      slotName: 'patientType',
      inputs: [
        "I am a new patient",
        "I'm an existing patient, my ID is P101",
        "Yes, my doctor ID is P105",
        "No, first time booking here"
      ]
    }
  ];

  for (const group of tests) {
    console.log(`=== Testing Slot: ${group.slotName} ===`);
    for (const input of group.inputs) {
      const result = await extractSlot(input, group.slotName);
      console.log(`Input: "${input}"`);
      console.log(`Extracted:`, JSON.stringify(result, null, 2));
      console.log('--------------------------------------------------');
    }
    console.log('\n');
  }
};

runTests();
