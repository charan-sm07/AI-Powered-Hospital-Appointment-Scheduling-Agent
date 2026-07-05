import Groq from 'groq-sdk';
import { GROQ_API_KEY } from '../../config/env.js';

let groq = null;
if (GROQ_API_KEY) {
  groq = new Groq({ apiKey: GROQ_API_KEY });
}

/**
 * Computes recommendation score for a doctor based on patient details and preferences.
 */
export function calculateDoctorRecommendation(doc, patient, requestSlots, hasPerfectSlot) {
  const rating = doc.rating || 4.5;
  const experience = doc.yearsOfExperience || 8;
  
  // Workload: count booked slots in doctor
  const workload = doc.availableSlots.filter(s => s.isBooked).length;
  
  // Insurance match: +20 points
  const acceptsInsurance = doc.insurancePlansAccepted.includes(patient.insurancePlan) || patient.insurancePlan === 'None';
  const insuranceScore = acceptsInsurance ? 20 : 0;
  
  // Slot match: +20 points
  const slotScore = hasPerfectSlot ? 20 : 0;
  
  // Score formula
  let score = (rating * 10) + (experience * 2) - (workload * 5) + insuranceScore + slotScore;
  score = Math.max(0, Math.min(100, Math.round(score)));
  
  // Reasons
  const reasons = [];
  if (rating >= 4.7) reasons.push('Highest rating');
  if (experience >= 12) reasons.push('Extremely experienced specialist');
  if (workload <= 1) reasons.push('Lowest waiting time');
  if (acceptsInsurance) reasons.push("Accepts patient's insurance");
  if (hasPerfectSlot) reasons.push('Available in preferred time slot');
  if (reasons.length === 0) reasons.push('Good compatibility match');

  return {
    doctorId: doc.doctorId,
    name: doc.name,
    score,
    reasons,
    rating,
    experience,
    workload
  };
}

/**
 * Predicts the estimated waiting time for a doctor.
 */
export function predictWaitingTime(doc, timeframe) {
  const day = timeframe || 'Monday';
  const queueLength = doc.availableSlots.filter(s => s.isBooked && s.day.toLowerCase() === day.toLowerCase()).length;
  const avgDuration = doc.averageConsultationDuration || 15;
  
  // Estimated wait time: queue length * avg duration. Default buffer of 10 if queue is 0
  const waitTime = queueLength > 0 ? (queueLength * avgDuration) : 10;
  const confidence = Math.max(70, Math.min(98, 100 - (queueLength * 5)));
  
  return { waitTime, confidence };
}

/**
 * Generates email, SMS, and WhatsApp notifications.
 */
export function generateNotificationTemplates(patient, doctorName, slot, waitTime, appointmentId) {
  const patientName = patient ? patient.name : 'Patient';
  const day = slot ? slot.day : 'Scheduled Day';
  const time = slot ? slot.time : 'Scheduled Time';
  
  return {
    email: `Subject: Appointment Confirmed - MediSlot AI\n\nDear ${patientName},\n\nYour appointment with ${doctorName} has been successfully scheduled for ${day} at ${time}.\n\nHospital: MediSlot AI General Clinic\nEstimated Waiting Time: ${waitTime} minutes\nAppointment ID: ${appointmentId}\n\nThank you for choosing MediSlot AI. Please arrive 10 minutes early.`,
    sms: `MediSlot AI: Appointment confirmed with ${doctorName} on ${day} at ${time}. ID: ${appointmentId}. Est. wait: ${waitTime} mins.`,
    whatsapp: `Hello ${patientName}! 🌟 Your appointment at MediSlot AI is confirmed.\n\n👨‍⚕️ Doctor: ${doctorName}\n📅 Date: ${day}\n⏰ Time: ${time}\n🆔 ID: ${appointmentId}\n⏳ Est. Wait Time: ${waitTime} Minutes\n\nPlease reply with 'HELP' if you need assistance.`
  };
}

/**
 * Hardcoded rule-based scheduler (fallback + post-LLM validation).
 * Matches specialization, timeframe (day), preferredTime, and validates slot availability.
 */
export function rulesBasedSchedule(patient, requestSlots, availableDoctors) {
  const reqSpec = requestSlots.specialization;
  const reqTimeframe = requestSlots.timeframe || 'Monday';
  const reqPrefTime = requestSlots.preferredTime || 'Morning';

  // Filter doctors by specialization
  const matchingDoctors = availableDoctors.filter(
    doc => doc.specialization.toLowerCase() === reqSpec.toLowerCase()
  );

  if (matchingDoctors.length === 0) {
    return {
      verdict: 'waitlisted',
      assignedDoctor: null,
      confirmedSlot: null,
      reasoning: `No doctors found with specialization: ${reqSpec}. Patient placed on waitlist.`,
      policyReferences: ['Section 5: Priority Rules for Urgent Requests'],
      recommendationScore: 0,
      recommendationReasons: [],
      estimatedWaitingTime: 0,
      waitingTimeConfidence: 0,
      allRankedDoctors: []
    };
  }

  // Rank all matching doctors
  const rankedDoctorsList = matchingDoctors.map(doc => {
    // Check if doctor has a perfect slot match
    let hasPerfect = false;
    for (const slot of doc.availableSlots) {
      if (slot.isBooked) continue;
      const dayMatches = slot.day.toLowerCase() === reqTimeframe.toLowerCase();
      let timeMatches = false;
      if (reqPrefTime.toLowerCase() === 'morning') {
        const hour = parseInt(slot.startTime.split(':')[0], 10);
        timeMatches = hour < 12;
      } else if (reqPrefTime.toLowerCase() === 'afternoon') {
        const hour = parseInt(slot.startTime.split(':')[0], 10);
        timeMatches = hour >= 12 && hour < 17;
      } else if (reqPrefTime.toLowerCase() === 'evening') {
        const hour = parseInt(slot.startTime.split(':')[0], 10);
        timeMatches = hour >= 17;
      } else {
        timeMatches = slot.startTime === reqPrefTime || slot.endTime === reqPrefTime;
      }
      if (dayMatches && timeMatches) {
        hasPerfect = true;
        break;
      }
    }

    const rec = calculateDoctorRecommendation(doc, patient, requestSlots, hasPerfect);
    const wait = predictWaitingTime(doc, reqTimeframe);
    return {
      ...rec,
      estimatedWaitingTime: wait.waitTime,
      waitingTimeConfidence: wait.confidence,
      docRef: doc
    };
  });

  // Sort doctors from highest score to lowest
  rankedDoctorsList.sort((a, b) => b.score - a.score);

  // 1. Try to find a slot matching BOTH day (timeframe) and preferred time using ranked order
  for (const item of rankedDoctorsList) {
    const doc = item.docRef;
    const acceptsInsurance = doc.insurancePlansAccepted.includes(patient.insurancePlan) || patient.insurancePlan === 'None';
    
    for (const slot of doc.availableSlots) {
      if (slot.isBooked) continue;

      const dayMatches = slot.day.toLowerCase() === reqTimeframe.toLowerCase();
      let timeMatches = false;

      if (reqPrefTime.toLowerCase() === 'morning') {
        const hour = parseInt(slot.startTime.split(':')[0], 10);
        timeMatches = hour < 12;
      } else if (reqPrefTime.toLowerCase() === 'afternoon') {
        const hour = parseInt(slot.startTime.split(':')[0], 10);
        timeMatches = hour >= 12 && hour < 17;
      } else if (reqPrefTime.toLowerCase() === 'evening') {
        const hour = parseInt(slot.startTime.split(':')[0], 10);
        timeMatches = hour >= 17;
      } else {
        timeMatches = slot.startTime === reqPrefTime || slot.endTime === reqPrefTime;
      }

      if (dayMatches && timeMatches) {
        return {
          verdict: 'confirmed',
          assignedDoctor: doc.name,
          confirmedSlot: { day: slot.day, time: `${slot.startTime}-${slot.endTime}` },
          reasoning: `${doc.name} (${doc.specialization}) is available on ${slot.day} during your preferred time of ${slot.startTime}-${slot.endTime}. Insurance plan '${patient.insurancePlan}' ${acceptsInsurance ? 'is accepted' : 'requires self-pay deposit'}.`,
          policyReferences: [
            'Section 1: Booking Rules per Specialization',
            'Section 2: Insurance Coverage Rules'
          ],
          recommendationScore: item.score,
          recommendationReasons: item.reasons,
          estimatedWaitingTime: item.estimatedWaitingTime,
          waitingTimeConfidence: item.waitingTimeConfidence,
          allRankedDoctors: rankedDoctorsList.map(d => ({ name: d.name, score: d.score, reasons: d.reasons, estimatedWaitingTime: d.estimatedWaitingTime }))
        };
      }
    }
  }

  // 2. If no perfect slot matches preferred time, check any slot on the same day in ranked order
  for (const item of rankedDoctorsList) {
    const doc = item.docRef;
    for (const slot of doc.availableSlots) {
      if (slot.isBooked) continue;
      if (slot.day.toLowerCase() === reqTimeframe.toLowerCase()) {
        return {
          verdict: 'alternative_suggested',
          assignedDoctor: doc.name,
          confirmedSlot: { day: slot.day, time: `${slot.startTime}-${slot.endTime}` },
          reasoning: `${doc.name} has availability on ${slot.day} but at a different time than requested (${slot.startTime}-${slot.endTime}).`,
          policyReferences: ['Section 4: Walk-In vs Appointment-Only Departments'],
          recommendationScore: item.score,
          recommendationReasons: item.reasons,
          estimatedWaitingTime: item.estimatedWaitingTime,
          waitingTimeConfidence: item.waitingTimeConfidence,
          allRankedDoctors: rankedDoctorsList.map(d => ({ name: d.name, score: d.score, reasons: d.reasons, estimatedWaitingTime: d.estimatedWaitingTime }))
        };
      }
    }
  }

  // 3. Check any slot on ANY day for matching doctors in ranked order
  for (const item of rankedDoctorsList) {
    const doc = item.docRef;
    for (const slot of doc.availableSlots) {
      if (slot.isBooked) continue;
      return {
        verdict: 'alternative_suggested',
        assignedDoctor: doc.name,
        confirmedSlot: { day: slot.day, time: `${slot.startTime}-${slot.endTime}` },
        reasoning: `${doc.name} is not available on ${reqTimeframe}, but we can offer an alternative slot on ${slot.day} at ${slot.startTime}-${slot.endTime}.`,
        policyReferences: ['Section 4: Walk-In vs Appointment-Only Departments'],
        recommendationScore: item.score,
        recommendationReasons: item.reasons,
        estimatedWaitingTime: item.estimatedWaitingTime,
        waitingTimeConfidence: item.waitingTimeConfidence,
        allRankedDoctors: rankedDoctorsList.map(d => ({ name: d.name, score: d.score, reasons: d.reasons, estimatedWaitingTime: d.estimatedWaitingTime }))
      };
    }
  }

  // 4. Default to waitlisted
  const bestDoc = rankedDoctorsList[0];
  return {
    verdict: 'waitlisted',
    assignedDoctor: null,
    confirmedSlot: null,
    reasoning: `All doctors in ${reqSpec} are currently fully booked. Placed on waitlist.`,
    policyReferences: ['Section 5: Priority Rules for Urgent Requests'],
    recommendationScore: bestDoc ? bestDoc.score : 0,
    recommendationReasons: bestDoc ? bestDoc.reasons : [],
    estimatedWaitingTime: bestDoc ? bestDoc.estimatedWaitingTime : 0,
    waitingTimeConfidence: bestDoc ? bestDoc.waitingTimeConfidence : 0,
    allRankedDoctors: rankedDoctorsList.map(d => ({ name: d.name, score: d.score, reasons: d.reasons, estimatedWaitingTime: d.estimatedWaitingTime }))
  };
}

/**
 * Generates an appointment scheduling decision.
 */
export async function generateAppointmentDecision(patient, requestSlots, availableDoctors, ragChunks) {
  console.log(`[Decision Engine] Generating verdict for Patient ID: ${patient.patientId}, Dept: ${requestSlots.specialization}`);

  if (!groq) {
    console.log('[Decision Engine] Groq not configured. Using deterministic rules engine.');
    return rulesBasedSchedule(patient, requestSlots, availableDoctors);
  }

  // Even with Groq, we leverage the ranking helper to enrich the decision
  const baseDecision = rulesBasedSchedule(patient, requestSlots, availableDoctors);

  const promptText = `
    You are the scheduling decision engine for MediSlot AI hospital.
    You must evaluate an appointment booking request and determine the scheduling verdict.

    BLOCK 1 - PATIENT PROFILE:
    ${JSON.stringify(patient, null, 2)}

    BLOCK 2 - REQUESTED SLOTS:
    ${JSON.stringify(requestSlots, null, 2)}

    BLOCK 3 - DOCTOR AVAILABILITY:
    ${JSON.stringify(availableDoctors, null, 2)}

    BLOCK 4 - RAG POLICY CHUNKS:
    ${JSON.stringify(ragChunks, null, 2)}

    Determine the verdict:
    - "confirmed": If there is a matching doctor in the requested specialization, and they have an unbooked slot matching the patient's requested day (timeframe) and preferred time, and the patient's request adheres to policy (e.g. Cardiology needs 24hr advance, Orthopedics needs referral if new).
    - "alternative_suggested": If a matching doctor exists but the requested slot is booked or doesn't match, or if a minor policy condition is met, suggest another available slot.
    - "waitlisted": If all matching doctors are fully booked, or no doctors match that specialization.

    You must output a raw JSON object and nothing else. Do not wrap in markdown blocks.
    The response structure must be EXACTLY:
    {
      "verdict": "confirmed" | "alternative_suggested" | "waitlisted",
      "assignedDoctor": "<Doctor Name>" | null,
      "confirmedSlot": {"day": "<Day of week>", "time": "<Start-End Time>"} | null,
      "reasoning": "<Explanation citing policies and reasons>",
      "policyReferences": ["<List of policy sections referenced>"]
    }
  `;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a hospital scheduling engine that outputs strict JSON decisions.' },
        { role: 'user', content: promptText }
      ],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 350
    });

    const content = chatCompletion.choices[0].message.content;
    const decision = JSON.parse(content);

    // Validation guard: If LLM claims 'confirmed', check that the assigned doctor actually has this slot unbooked.
    if (decision.verdict === 'confirmed') {
      const doc = availableDoctors.find(d => d.name === decision.assignedDoctor);
      if (!doc) {
        console.warn(`[Decision Engine Validation] LLM confirmed doctor '${decision.assignedDoctor}' who is not in available doctors list. Overriding to alternative.`);
        return baseDecision;
      }

      // Check if slot exists and is unbooked
      const slotExists = doc.availableSlots.some(s => 
        !s.isBooked && 
        s.day.toLowerCase() === decision.confirmedSlot.day.toLowerCase() &&
        (decision.confirmedSlot.time.includes(s.startTime) || s.startTime.includes(decision.confirmedSlot.time))
      );

      if (!slotExists) {
        console.warn(`[Decision Engine Validation] LLM confirmed slot ${decision.confirmedSlot.day} ${decision.confirmedSlot.time} but it is booked or unavailable. Overriding.`);
        return baseDecision;
      }
    }

    // Enrich the LLM decision with ranking parameters
    const matchedRanked = baseDecision.allRankedDoctors.find(d => d.name === decision.assignedDoctor);
    return {
      ...decision,
      recommendationScore: matchedRanked ? matchedRanked.score : (baseDecision.recommendationScore || 85),
      recommendationReasons: matchedRanked ? matchedRanked.reasons : (baseDecision.recommendationReasons || ['Selected specialist']),
      estimatedWaitingTime: baseDecision.estimatedWaitingTime,
      waitingTimeConfidence: baseDecision.waitingTimeConfidence,
      allRankedDoctors: baseDecision.allRankedDoctors
    };

  } catch (error) {
    console.error('[Decision Engine] LLM generation failed. Falling back to rules engine:', error.message);
    return baseDecision;
  }
}
