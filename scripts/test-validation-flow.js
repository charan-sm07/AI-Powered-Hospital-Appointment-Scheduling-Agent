import fetch from 'node-fetch';

async function runTests() {
  const baseUrl = 'http://localhost:3001/api/chat';
  
  console.log('\n=============================================================');
  console.log('--- RUNNING PATIENT VALIDATION & PRE-FILLING FLOW TESTS ---');
  console.log('=============================================================\n');

  // Scenario 1: New Patient with Fake Name and Phone, then corrected
  console.log('--- TEST SCENARIO 1: New Patient with Fake Details ---');
  const startRes = await fetch(`${baseUrl}/start`, { method: 'POST' });
  const startData = await startRes.json();
  const sessionId = startData.sessionId;
  console.log(`[Flow] Started session: ${sessionId}`);

  // Step 1: Specialization
  let res = await fetch(`${baseUrl}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, text: 'General Medicine' })
  });
  let data = await res.json();
  console.log(`[Flow] Specialization slot: ${data.slots.specialization} | CurrentState: ${data.currentState}`);

  // Step 2: Preferred Time
  res = await fetch(`${baseUrl}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, text: 'Morning' })
  });
  data = await res.json();
  console.log(`[Flow] Time slot: ${data.slots.preferredTime} | CurrentState: ${data.currentState}`);

  // Step 3: Timeframe
  res = await fetch(`${baseUrl}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, text: 'Monday' })
  });
  data = await res.json();
  console.log(`[Flow] Timeframe slot: ${data.slots.timeframe} | CurrentState: ${data.currentState}`);

  // Step 4: Patient Type
  res = await fetch(`${baseUrl}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, text: 'New Patient' })
  });
  data = await res.json();
  console.log(`[Flow] PatientType slots: isExistingPatient = ${data.slots.isExistingPatient} | CurrentState: ${data.currentState}`);

  // Step 5: Fake Name Validation Check
  console.log('\n[Action] Sending fake name: "asdfghjkl"');
  res = await fetch(`${baseUrl}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, text: 'asdfghjkl' })
  });
  data = await res.json();
  console.log(`Response: validationFailed = ${data.validationFailed}`);
  console.log(`CurrentState: ${data.currentState} (expected COLLECTING_PATIENT_NAME)`);
  console.log(`Message: ${data.message.split('\n')[0]}`);
  if (data.validationFailed && data.currentState === 'COLLECTING_PATIENT_NAME') {
    console.log('✅ PASS: Fake name was rejected and kept in COLLECTING_PATIENT_NAME.');
  } else {
    console.error('❌ FAIL: Fake name validation check failed.');
  }

  // Step 6: Valid Name
  console.log('\n[Action] Sending valid name: "David Miller"');
  res = await fetch(`${baseUrl}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, text: 'David Miller' })
  });
  data = await res.json();
  console.log(`CurrentState: ${data.currentState} (expected COLLECTING_PATIENT_PHONE)`);
  console.log(`Slot patientName: ${data.slots.patientName}`);
  if (data.slots.patientName === 'David Miller' && data.currentState === 'COLLECTING_PATIENT_PHONE') {
    console.log('✅ PASS: Valid name accepted, moved to phone collection.');
  } else {
    console.error('❌ FAIL: Valid name was not accepted correctly.');
  }

  // Step 7: Fake Phone Validation Check
  console.log('\n[Action] Sending fake phone: "9999999999"');
  res = await fetch(`${baseUrl}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, text: '9999999999' })
  });
  data = await res.json();
  console.log(`Response: validationFailed = ${data.validationFailed}`);
  console.log(`CurrentState: ${data.currentState} (expected COLLECTING_PATIENT_PHONE)`);
  console.log(`Message: ${data.message.split('\n')[0]}`);
  if (data.validationFailed && data.currentState === 'COLLECTING_PATIENT_PHONE') {
    console.log('✅ PASS: Fake phone was rejected and kept in COLLECTING_PATIENT_PHONE.');
  } else {
    console.error('❌ FAIL: Fake phone validation check failed.');
  }

  // Step 8: Valid Phone
  console.log('\n[Action] Sending valid phone: "9840123456"');
  res = await fetch(`${baseUrl}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, text: '9840123456' })
  });
  data = await res.json();
  console.log(`CurrentState: ${data.currentState} (expected CONFIRMING)`);
  console.log(`Slot patientPhone: ${data.slots.patientPhone}`);
  if (data.slots.patientPhone === '9840123456' && data.currentState === 'CONFIRMING') {
    console.log('✅ PASS: Valid phone accepted, moved to confirmation.');
  } else {
    console.error('❌ FAIL: Valid phone was not accepted correctly.');
  }

  // Step 9: Yes Confirmation
  console.log('\n[Action] Confirming booking with "Yes"');
  res = await fetch(`${baseUrl}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, text: 'Yes' })
  });
  data = await res.json();
  console.log(`CurrentState: ${data.currentState} (expected DONE)`);
  console.log(`Verdict: ${data.decision.verdict}`);
  console.log(`Saved Patient Name in Decision: ${data.decision.conversationSummary?.symptoms || 'N/A'}`);
  if (data.currentState === 'DONE' && data.decision) {
    console.log('✅ PASS: New Patient flow fully verified!');
  } else {
    console.error('❌ FAIL: New Patient confirmation failed.');
  }


  console.log('\n\n--- TEST SCENARIO 2: Existing Patient Auto Prefills details ---');
  const startRes2 = await fetch(`${baseUrl}/start`, { method: 'POST' });
  const startData2 = await startRes2.json();
  const sessionId2 = startData2.sessionId;
  console.log(`[Flow] Started session 2: ${sessionId2}`);

  // Step 1: Specialization
  await fetch(`${baseUrl}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: sessionId2, text: 'General Medicine' })
  });

  // Step 2: Time
  await fetch(`${baseUrl}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: sessionId2, text: 'Morning' })
  });

  // Step 3: Timeframe
  await fetch(`${baseUrl}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: sessionId2, text: 'Monday' })
  });

  // Step 4: Existing Patient ID
  console.log('[Action] Sending existing patient ID: "P101"');
  res = await fetch(`${baseUrl}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: sessionId2, text: 'I am an existing patient with ID P101' })
  });
  data = await res.json();
  console.log('FULL RESPONSE DATA:', JSON.stringify(data, null, 2));
  console.log(`CurrentState: ${data.currentState} (expected CONFIRMING)`);
  console.log(`Prefilled Name: ${data.slots.patientName}`);
  console.log(`Prefilled Phone: ${data.slots.patientPhone}`);
  console.log(`Bot prompt: "${data.message.replace(/\n/g, ' ')}"`);
  
  if (data.currentState === 'CONFIRMING' && 
      data.slots.patientName === 'John Miller' && 
      (data.slots.patientPhone === '9876543211' || data.slots.patientPhone === '+1-555-019-2834')) {
    console.log('✅ PASS: Existing Patient details auto-prefilled and skipped name/phone entry questions!');
  } else {
    console.error('❌ FAIL: Existing patient details auto-prefill failed.');
  }

  // Step 5: Yes Confirmation
  console.log('\n[Action] Confirming booking with "Yes"');
  res = await fetch(`${baseUrl}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: sessionId2, text: 'Yes' })
  });
  data = await res.json();
  console.log(`CurrentState: ${data.currentState} (expected DONE)`);
  if (data.currentState === 'DONE') {
    console.log('✅ PASS: Existing Patient flow fully verified!');
  } else {
    console.error('❌ FAIL: Existing patient confirmation failed.');
  }

  console.log('\n=============================================================');
  console.log('🎉 ALL INTEGRATION FLOW TESTS COMPLETED SUCCESSFUL!');
  console.log('=============================================================\n');
}

runTests().catch(err => {
  console.error('E2E validation tests failed:', err);
  process.exit(1);
});
