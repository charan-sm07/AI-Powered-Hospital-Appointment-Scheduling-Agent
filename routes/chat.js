import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getSession, createSession, States, getSlotNameForState, getPromptForState, transitionState, detectLanguage } from '../services/nlp/state.js';
import { scoreMessage } from '../services/security/scorer.js';
import { extractSlot, detectEmergency, detectManagementIntent, predictSymptomSpecialist } from '../services/nlp/extractor.js';
import { retrieve } from '../services/rag/retriever.js';
import { generateAppointmentDecision, generateNotificationTemplates } from '../services/decision/engine.js';
import { validateRealName, validateRealPhone } from '../services/security/validator.js';
import Doctor from '../models/Doctor.js';
import Patient from '../models/Patient.js';
import AppointmentRequest from '../models/AppointmentRequest.js';
import SecurityEvent from '../models/SecurityEvent.js';

const router = express.Router();

async function getAvailableSlots(specialization) {
  if (!specialization) return [];
  try {
    const doctors = await Doctor.find({ specialization });
    const availableSlots = [];
    doctors.forEach(doc => {
      (doc.availableSlots || []).forEach(slot => {
        if (!slot.isBooked) {
          availableSlots.push({
            doctorId: doc.doctorId,
            doctorName: doc.name,
            specialization: doc.specialization,
            day: slot.day,
            startTime: slot.startTime,
            endTime: slot.endTime
          });
        }
      });
    });
    return availableSlots;
  } catch (err) {
    console.error('[Chat API] Error fetching available slots:', err);
    return [];
  }
}

// Helper to check for affirmative (yes) / negative (no) responses
function isAffirmative(text) {
  const t = text.trim().toLowerCase();
  return t === 'yes' || t === 'y' || t === 'correct' || t === 'yeah' || t === 'sure' || t === 'ok' || t === 'ஆம்' || t === 'हाँ' || t === 'हाँजी';
}

function isNegative(text) {
  const t = text.trim().toLowerCase();
  return t === 'no' || t === 'n' || t === 'incorrect' || t === 'nope' || t === 'இல்லை' || t === 'नहीं' || t === 'नही';
}

async function checkAndPrefillPatient(session) {
  if (session.slots.isExistingPatient && session.slots.patientId && !session.slots.patientName) {
    try {
      const patient = await Patient.findOne({ patientId: session.slots.patientId });
      if (patient) {
        session.slots.patientName = patient.name;
        session.slots.patientPhone = patient.phoneNumber || null;
        console.log(`[Pre-fill] Found existing patient ${patient.name}. Pre-filled name & phone.`);
        transitionState(session);
      }
    } catch (dbErr) {
      console.error('[Pre-fill] DB error:', dbErr);
    }
  }
}

/**
 * Extracts doctor name mentions dynamically from the message.
 */
async function extractDoctorMention(text, specialization) {
  if (!text) return null;
  try {
    const query = specialization ? { specialization } : {};
    const doctors = await Doctor.find(query);
    for (const doc of doctors) {
      const cleanName = doc.name.toLowerCase().replace('dr. ', '').trim();
      const cleanText = text.toLowerCase();
      
      const nameParts = cleanName.split(/\s+/);
      const hasLastName = nameParts.length > 1 && cleanText.includes(nameParts[nameParts.length - 1]);
      const hasFullName = cleanText.includes(cleanName);
      
      if (hasFullName || (hasLastName && nameParts[nameParts.length - 1].length > 3)) {
        return doc.name;
      }
    }
  } catch (err) {
    console.error('[Mention Extractor] Error:', err);
  }
  return null;
}

/**
 * POST /api/chat/start
 * Initializes a new scheduling session.
 */
router.post('/start', (req, res) => {
  try {
    const sessionId = uuidv4();
    const session = createSession(sessionId);
    const welcomePrompt = getPromptForState(session);
    
    res.status(200).json({
      sessionId,
      currentState: session.currentState,
      message: welcomePrompt,
      slots: session.slots,
      availableSlots: []
    });
  } catch (err) {
    console.error('[Chat API] Start error:', err);
    res.status(500).json({ error: 'Failed to start chat session.' });
  }
});

/**
 * POST /api/chat/message
 * Handles message exchanges, security, slot extraction, and decision triggers.
 */
router.post('/message', async (req, res) => {
  const { sessionId, text, slotOverrides } = req.body;

  if (!sessionId || !text) {
    return res.status(400).json({ error: 'Missing sessionId or text.' });
  }

  try {
    const session = getSession(sessionId);
    session.history.push({ role: 'user', text });

    let skippedToNextPrompt = false;
    if (slotOverrides) {
      if (slotOverrides.patientType) {
        session.slots.isExistingPatient = slotOverrides.patientType.isExisting;
        session.slots.patientId = slotOverrides.patientType.patientId;
      }
      for (const key of ['specialization', 'preferredTime', 'timeframe', 'preferredDoctor', 'isExistingPatient', 'patientId', 'patientName', 'patientPhone']) {
        if (slotOverrides[key] !== undefined) {
          session.slots[key] = slotOverrides[key];
        }
      }
      await checkAndPrefillPatient(session);
      transitionState(session);
      skippedToNextPrompt = true;
      console.log(`[Slot Overrides] Applied overrides for session ${sessionId}:`, slotOverrides);
    }

    // Dynamic doctor mention extraction
    const mentionedDoc = await extractDoctorMention(text, session.slots.specialization);
    if (mentionedDoc) {
      session.slots.preferredDoctor = mentionedDoc;
      console.log(`[Mention Extractor] Detected preferred doctor mention: ${mentionedDoc} for session: ${sessionId}`);
    }

    // Auto-detect and store user language choice
    const detectedLang = detectLanguage(text);
    if (detectedLang !== 'en') {
      session.language = detectedLang;
      console.log(`[Language Detector] Detected language: ${detectedLang} for session: ${sessionId}`);
    }

    // Auto-prefill existing patient details if available
    await checkAndPrefillPatient(session);

    // Emergency Symptom Check
    if (detectEmergency(text)) {
      session.currentState = States.FROZEN;
      
      await new SecurityEvent({
        userId: sessionId,
        messageText: text,
        suspicionScore: 1.0,
        actionTaken: 'emergency'
      }).save();

      const lang = session.language || 'en';
      const emergencyMsg = lang === 'ta'
        ? '⚠️ **அவசரநிலை கண்டறியப்பட்டது**\n\nஉங்கள் அறிகுறிகளுக்கு உடனடி மருத்துவ கவனிப்பு தேவைப்படலாம்.\n\nதயவுசெய்து அவசர சிகிச்சை பிரிவுக்குச் செல்லவும் அல்லது உடனடியாக அவசர மருத்துவ சேவைகளைத் தொடர்பு கொள்ளவும்.'
        : lang === 'hi'
          ? '⚠️ **आपातकालीन स्थिति का पता चला**\n\nआपके लक्षणों के लिए तत्काल चिकित्सा ध्यान देने की आवश्यकता हो सकती है।\n\nकृपया तुरंत आपातकालीन विभाग में जाएं या आपातकालीन चिकित्सा सेवाओं से संपर्क करें।'
          : '⚠️ **Emergency Detected**\n\nYour symptoms may require immediate medical attention.\n\nPlease visit the Emergency Department or contact emergency medical services immediately.';

      return res.status(200).json({
        sessionId,
        currentState: States.FROZEN,
        message: emergencyMsg,
        flagged: true,
        isEmergency: true,
        slots: session.slots
      });
    }

    // Management Intent Check (Lookup / Cancellation)
    if (detectManagementIntent(text) && session.currentState !== States.CONFIRMING) {
      const lang = session.language || 'en';
      const managementMsg = lang === 'ta'
        ? '📅 **முன்பதிவு மேலாண்மை**\n\nஉங்கள் முன்பதிவை ரத்து செய்ய அல்லது பார்க்க, உங்கள் **நோயாளி ஐடி** (எ.கா: P101) அல்லது **குறிப்பு ஐடி** ஐ கீழே உள்ள "Manage Appointments" பொத்தானைப் பயன்படுத்தி பதிவு செய்யவும்.'
        : lang === 'hi'
          ? '📅 **अपॉइंटमेंट प्रबंधन**\n\nअपना अपॉइंटमेंट रद्द करने या देखने के लिए, कृपया अपनी **मरीज आईडी** (जैसे: P101) का उपयोग करें।'
          : '📅 **Appointment Management**\n\nTo view or cancel an active booking, click **"Manage Bookings"** or enter your **Patient ID** (e.g., P101).';

      session.history.push({ role: 'bot', text: managementMsg });
      return res.status(200).json({
        sessionId,
        currentState: session.currentState,
        message: managementMsg,
        isManagementIntent: true,
        slots: session.slots,
        availableSlots: []
      });
    }

    console.log(`[Flow] Session ${sessionId} | State: ${session.currentState} | User Input: "${text}"`);

    // 1. Security Check (Layer 1)
    console.log(`[Layer 1 - Security] Scoring safety of input message for session: ${sessionId}`);
    const securityResult = await scoreMessage(text, sessionId);
    if (!securityResult.isSafe) {
      session.currentState = States.FROZEN;
      return res.status(200).json({
        sessionId,
        currentState: States.FROZEN,
        message: 'This session has been flagged and quarantined due to a security violation.',
        flagged: true,
        slots: session.slots
      });
    }

    if (session.currentState === States.FROZEN) {
      return res.status(200).json({
        sessionId,
        currentState: States.FROZEN,
        message: 'This session is locked. Please refresh or contact administration.',
        flagged: true
      });
    }

    // 2. FSM State: CONFIRMING (Final Yes/No confirmation check)
    if (session.currentState === States.CONFIRMING) {
      if (isAffirmative(text)) {
        session.currentState = States.DECIDING;
        console.log(`[Flow] Confirmed! Fetching data for decision...`);

        // Fetch doctor/patient data for scheduling
        let patientRecord = null;
        if (session.slots.isExistingPatient && session.slots.patientId) {
          patientRecord = await Patient.findOne({ patientId: session.slots.patientId });
        }
        
        // If patient not found or is new, create a mock profile
        if (!patientRecord) {
          patientRecord = new Patient({
            patientId: session.slots.patientId || `P_NEW_${uuidv4().substring(0, 6).toUpperCase()}`,
            name: session.slots.patientName || (session.slots.isExistingPatient ? 'Unregistered Patient' : 'New Patient'),
            phoneNumber: session.slots.patientPhone || '',
            isExisting: session.slots.isExistingPatient || false,
            insurancePlan: session.slots.isExistingPatient ? 'None' : 'CareFirst', // default for new
            visitHistory: []
          });
          // Save patient info if new
          await patientRecord.save();
        } else {
          // Update phone number if missing in existing profile
          if (!patientRecord.phoneNumber && session.slots.patientPhone) {
            patientRecord.phoneNumber = session.slots.patientPhone;
            await patientRecord.save();
          }
        }

        const doctors = await Doctor.find({ specialization: session.slots.specialization });

        // Retrieve RAG policies
        const query = `${session.slots.specialization} booking rules and insurance coverage`;
        console.log(`[Layer 3 - RAG] Querying policy matching: "${query}"`);
        const policyChunks = await retrieve(query, 3);

        // Call Decision Engine (Layer 4)
        console.log(`[Layer 4 - Decision Engine] Evaluating profile, slots, availability, and RAG policy...`);
        const decision = await generateAppointmentDecision(
          patientRecord,
          session.slots,
          doctors,
          policyChunks
        );

        // Book slot in DB if confirmed
        let assignedDoctorDoc = null;
        if (decision.verdict === 'confirmed' && decision.confirmedSlot) {
          assignedDoctorDoc = await Doctor.findOne({
            name: decision.assignedDoctor,
            specialization: session.slots.specialization
          });

          if (assignedDoctorDoc) {
            const slot = assignedDoctorDoc.availableSlots.find(s => 
              s.day === decision.confirmedSlot.day &&
              s.startTime === decision.confirmedSlot.time.split('-')[0]
            );
            if (slot) {
              slot.isBooked = true;
              await assignedDoctorDoc.save();
              console.log(`[Flow] Successfully booked slot for doctor ${assignedDoctorDoc.name} on ${slot.day} at ${slot.startTime}`);
            }
          }
        }

        // Save AppointmentRequest document
        const appointmentRequest = new AppointmentRequest({
          patientId: patientRecord.patientId,
          patientName: session.slots.patientName || patientRecord.name,
          patientPhone: session.slots.patientPhone || patientRecord.phoneNumber,
          specializationRequested: session.slots.specialization,
          preferredTime: session.slots.preferredTime,
          timeframe: session.slots.timeframe,
          isExistingPatient: session.slots.isExistingPatient,
          verdict: decision.verdict,
          assignedDoctor: decision.assignedDoctor,
          confirmedSlot: decision.confirmedSlot,
          reasoning: decision.reasoning,
          policyReferences: decision.policyReferences,
          status: decision.verdict === 'confirmed' ? 'completed' : 'pending'
        });
        await appointmentRequest.save();

        // Calculate advanced metrics
        const appId = appointmentRequest._id.toString().substring(18).toUpperCase();
        const notifications = generateNotificationTemplates(
          patientRecord,
          decision.assignedDoctor || 'TBD',
          decision.confirmedSlot ? { day: decision.confirmedSlot.day, time: decision.confirmedSlot.time } : null,
          decision.estimatedWaitingTime || 10,
          appId
        );

        appointmentRequest.estimatedWaitingTime = decision.estimatedWaitingTime || 10;
        appointmentRequest.smartNotifications = notifications;
        appointmentRequest.conversationSummary = {
          symptoms: session.history.find(h => h.role === 'user')?.text || session.slots.specialization || '',
          detectedDepartment: session.slots.specialization,
          doctorSelected: decision.assignedDoctor || 'None',
          reasoning: decision.reasoning
        };
        await appointmentRequest.save();

        const enrichedDecision = {
          ...decision,
          estimatedWaitingTime: appointmentRequest.estimatedWaitingTime,
          smartNotifications: appointmentRequest.smartNotifications,
          conversationSummary: appointmentRequest.conversationSummary,
          appointmentId: appId
        };

        session.currentState = States.DONE;
        session.history.push({ role: 'bot', text: 'Appointment decision completed.', decision: enrichedDecision });
        
        return res.status(200).json({
          sessionId,
          currentState: States.DONE,
          message: 'Scheduling evaluation completed.',
          decision: enrichedDecision,
          slots: session.slots
        });
      } else if (isNegative(text)) {
        // Reset and re-ask
        session.currentState = States.COLLECTING_SPECIALIZATION;
        session.slots = {
          specialization: null,
          preferredTime: null,
          timeframe: null,
          isExistingPatient: null,
          patientId: null,
          patientName: null,
          patientPhone: null
        };
        session.attempts = 0;
        session.clarificationValue = null;
        
        const prompt = getPromptForState(session);
        session.history.push({ role: 'bot', text: prompt });
        
        return res.status(200).json({
          sessionId,
          currentState: session.currentState,
          message: `Got it, let's start over. ${prompt}`,
          slots: session.slots
        });
      } else {
        // Not yes or no
        return res.status(200).json({
          sessionId,
          currentState: States.CONFIRMING,
          message: 'Please reply with either Yes (to confirm) or No (to restart).',
          slots: session.slots
        });
      }
    }

    if (!skippedToNextPrompt) {
      // 3. Handle Clarification Flow (Active 40-69% confidence checks)
      const slotName = getSlotNameForState(session.currentState);
      
      // Symptom Triage Interception for Specialization
      if (session.currentState === States.COLLECTING_SPECIALIZATION) {
        if (session.clarificationValue !== null) {
          if (isAffirmative(text)) {
            session.slots.specialization = session.clarificationValue;
            session.clarificationValue = null;
            session.attempts = 0;
            transitionState(session);
            const nextPrompt = getPromptForState(session);
            session.history.push({ role: 'bot', text: nextPrompt });
            return res.status(200).json({
              sessionId,
              currentState: session.currentState,
              message: nextPrompt,
              slots: session.slots,
              availableSlots: await getAvailableSlots(session.slots.specialization)
            });
          } else if (isNegative(text)) {
            session.clarificationValue = null;
            session.attempts = 0;
            const rePrompt = session.language === 'ta'
              ? 'சரி, தயவுசெய்து உங்கள் மருத்துவப் பிரிவை நேரடியாகத் தேர்ந்தெடுக்கவும் (எ.கா: Cardiology, Dermatology).'
              : session.language === 'hi'
                ? 'ठीक है, कृपया अपना चिकित्सा विभाग सीधे चुनें (जैसे: Cardiology, Dermatology)।'
                : 'Okay, please specify your medical department directly (e.g., Cardiology, Dermatology).';
            session.history.push({ role: 'bot', text: rePrompt });
            return res.status(200).json({
              sessionId,
              currentState: session.currentState,
              message: rePrompt,
              slots: session.slots,
              availableSlots: await getAvailableSlots(session.slots.specialization)
            });
          } else {
            const clarifyStr = session.language === 'ta'
              ? `தயவுசெய்து ஆம் அல்லது இல்லை என்று பதிலளிக்கவும். நீங்கள் ${session.clarificationValue} பிரிவை உறுதிப்படுத்த விரும்புகிறீர்களா?`
              : session.language === 'hi'
                ? `कृपया हाँ या नहीं में उत्तर दें। क्या आप ${session.clarificationValue} विभाग की पुष्टि करना चाहते हैं?`
                : `Please reply with Yes or No. Do you want to confirm ${session.clarificationValue}?`;
            return res.status(200).json({
              sessionId,
              currentState: session.currentState,
              message: clarifyStr,
              slots: session.slots,
              availableSlots: await getAvailableSlots(session.slots.specialization)
            });
          }
        } else {
          // First request: Check if they typed a specialization directly
          const extraction = await extractSlot(text, 'specialization', session.slots);
          if (extraction.value && extraction.confidence >= 70) {
            session.slots.specialization = extraction.value;
            session.attempts = 0;
            transitionState(session);
            const nextPrompt = getPromptForState(session);
            session.history.push({ role: 'bot', text: nextPrompt });
            return res.status(200).json({
              sessionId,
              currentState: session.currentState,
              message: nextPrompt,
              slots: session.slots,
              availableSlots: await getAvailableSlots(session.slots.specialization)
            });
          } else {
            // Fallback: Run symptom mapping recommendation
            const recommendation = await predictSymptomSpecialist(text, session.language || 'en');
            session.clarificationValue = recommendation.specialization;
            session.attempts = 0;
            
            const lang = session.language || 'en';
            let responseMsg = '';
            if (lang === 'ta') {
              responseMsg = `🩺 **அறிகுறி பரிந்துரை**\n\nஉங்கள் அறிகுறிகளின் அடிப்படையில், நாங்கள் பரிந்துரைக்கும் மருத்துவப் பிரிவு: **${recommendation.specialization}**\nநம்பிக்கை நிலை: **${recommendation.confidence}%**\nகாரணம்: ${recommendation.reason}\n\nஇதை உறுதிப்படுத்த விரும்புகிறீர்களா? (ஆம்/இல்லை)`;
            } else if (lang === 'hi') {
              responseMsg = `🩺 **लक्षण सिफारिश**\n\nआपके लक्षणों के आधार पर, हम इस विभाग की सिफारिश करते हैं: **${recommendation.specialization}**\nविश्वास स्तर: **${recommendation.confidence}%**\nकारण: ${recommendation.reason}\n\nक्या आप इसकी पुष्टि करना चाहते हैं? (हाँ/नहीं)`;
            } else {
              responseMsg = `🩺 **Symptom Recommendation**\n\nBased on your symptoms, we recommend: **${recommendation.specialization}**\nConfidence: **${recommendation.confidence}%**\nReason: ${recommendation.reason}\n\nWould you like to confirm this department? (Yes/No)`;
            }
            
            session.history.push({ role: 'bot', text: responseMsg });
            return res.status(200).json({
              sessionId,
              currentState: session.currentState,
              message: responseMsg,
              slots: session.slots,
              availableSlots: await getAvailableSlots(session.slots.specialization)
            });
          }
        }
      }

      if (session.clarificationValue !== null) {
        if (isAffirmative(text)) {
          // Accept the clarified value
          const val = session.clarificationValue;
          
          if (slotName === 'patientName') {
            const check = validateRealName(val);
            if (!check.isValid) {
              session.clarificationValue = null;
              session.attempts++;
              const errorMsg = `⚠️ **Invalid Name**\n\nThe clarified name ('${val}') is invalid: ${check.reason}. Please try again.`;
              session.history.push({ role: 'bot', text: errorMsg });
              return res.status(200).json({
                sessionId,
                currentState: session.currentState,
                message: errorMsg,
                validationFailed: true,
                slots: session.slots,
                availableSlots: await getAvailableSlots(session.slots.specialization)
              });
            }
          }

          if (slotName === 'patientPhone') {
            const check = validateRealPhone(val);
            if (!check.isValid) {
              session.clarificationValue = null;
              session.attempts++;
              const errorMsg = `⚠️ **Invalid Phone**\n\nThe clarified phone ('${val}') is invalid: ${check.reason}. Please try again.`;
              session.history.push({ role: 'bot', text: errorMsg });
              return res.status(200).json({
                sessionId,
                currentState: session.currentState,
                message: errorMsg,
                validationFailed: true,
                slots: session.slots,
                availableSlots: await getAvailableSlots(session.slots.specialization)
              });
            }
          }

          if (slotName === 'patientType') {
            session.slots.isExistingPatient = val.isExisting;
            session.slots.patientId = val.patientId;
          } else {
            session.slots[slotName] = val;
          }
          session.clarificationValue = null;
          session.attempts = 0;
          
          await checkAndPrefillPatient(session);
          transitionState(session);
          const nextPrompt = getPromptForState(session);
          session.history.push({ role: 'bot', text: nextPrompt });
          
          return res.status(200).json({
            sessionId,
            currentState: session.currentState,
            message: nextPrompt,
            slots: session.slots,
            availableSlots: await getAvailableSlots(session.slots.specialization)
          });
        } else if (isNegative(text)) {
          // Reject clarification, re-ask slot
          session.clarificationValue = null;
          session.attempts++;
          const reAskPrompt = session.attempts >= 3 
            ? getPromptForState(session)
            : `Okay, let's try again. What is your preferred ${slotName === 'patientType' ? 'patient status (new/existing)' : slotName}?`;
          
          session.history.push({ role: 'bot', text: reAskPrompt });
          return res.status(200).json({
            sessionId,
            currentState: session.currentState,
            message: reAskPrompt,
            slots: session.slots,
            availableSlots: await getAvailableSlots(session.slots.specialization)
          });
        } else {
          return res.status(200).json({
            sessionId,
            currentState: session.currentState,
            message: `Please confirm if you meant '${slotName === 'patientType' ? JSON.stringify(session.clarificationValue) : session.clarificationValue}' (Yes/No).`,
            slots: session.slots,
            availableSlots: await getAvailableSlots(session.slots.specialization)
          });
        }
      }

      // 4. Standard Slot Extraction Gating (Layer 2)
      console.log(`[Layer 2 - NLP Extractor] Processing slot: '${slotName}'`);
      const extraction = await extractSlot(text, slotName, session.slots);

      // If risk level is high, quarantine
      if (extraction.riskLevel === 'high') {
        session.currentState = States.FROZEN;
        await new SecurityEvent({
          userId: sessionId,
          messageText: text,
          suspicionScore: 0.8,
          actionTaken: 'quarantined'
        }).save();

        return res.status(200).json({
          sessionId,
          currentState: States.FROZEN,
          message: 'This session has been flagged and quarantined due to a security violation.',
          flagged: true,
          slots: session.slots,
          availableSlots: []
        });
      }

      const val = extraction.value;
      const conf = extraction.confidence;

      if (val !== null && conf >= 70) {
        if (slotName === 'patientName') {
          const check = validateRealName(val);
          if (!check.isValid) {
            session.attempts++;
            const errorMsg = session.language === 'ta'
              ? `⚠️ **தவறான பெயர் கண்டறியப்பட்டது**\n\nநீங்கள் உள்ளிட்ட பெயர் ('${val}') செல்லாததாகத் தெரிகிறது. காரணம்: ${check.reason}\n\nதயவுசெய்து உங்கள் உண்மையான முழு பெயரை உள்ளிடவும்.`
              : session.language === 'hi'
                ? `⚠️ **अमान्य नाम का पता चला**\n\nआपके द्वारा दर्ज किया गया नाम ('${val}') अमान्य प्रतीत होता है। कारण: ${check.reason}\n\nकृपया अपना वास्तविक पूरा नाम दर्ज करें।`
                : `⚠️ **Invalid Name Detected**\n\nThe name you entered ('${val}') appears to be invalid or a placeholder. Reason: ${check.reason}\n\nPlease provide your real full name.`;
            session.history.push({ role: 'bot', text: errorMsg });
            return res.status(200).json({
              sessionId,
              currentState: session.currentState,
              message: errorMsg,
              validationFailed: true,
              slots: session.slots,
              availableSlots: await getAvailableSlots(session.slots.specialization)
            });
          }
        }

        if (slotName === 'patientPhone') {
          const check = validateRealPhone(val);
          if (!check.isValid) {
            session.attempts++;
            const errorMsg = session.language === 'ta'
              ? `⚠️ **தவறான தொலைபேசி எண் கண்டறியப்பட்டது**\n\nநீங்கள் உள்ளிட்ட எண் ('${val}') செல்லாததாகத் தெரிகிறது. காரணம்: ${check.reason}\n\nதயவுசெய்து ஒரு சரியான தொலைபேசி எண்ணை உள்ளிடவும்.`
              : session.language === 'hi'
                ? `⚠️ **अमान्य फ़ोन नंबर का पता चला**\n\nआपके द्वारा दर्ज किया गया नंबर ('${val}') अमान्य प्रतीत होता है। कारण: ${check.reason}\n\nकृपया एक वैध फ़ोन नंबर प्रदान करें।`
                : `⚠️ **Invalid Phone Number Detected**\n\nThe number you entered ('${val}') appears to be invalid or fake. Reason: ${check.reason}\n\nPlease provide a valid contact number.`;
            session.history.push({ role: 'bot', text: errorMsg });
            return res.status(200).json({
              sessionId,
              currentState: session.currentState,
              message: errorMsg,
              validationFailed: true,
              slots: session.slots,
              availableSlots: await getAvailableSlots(session.slots.specialization)
            });
          }
        }

        // Auto-accept slot
        if (slotName === 'patientType') {
          session.slots.isExistingPatient = val.isExisting;
          session.slots.patientId = val.patientId;
        } else {
          session.slots[slotName] = val;
        }
        session.attempts = 0;
        await checkAndPrefillPatient(session);
        transitionState(session);
      } else if (val !== null && conf >= 40) {
        // Clarify slot
        session.clarificationValue = val;
        const clarifyText = slotName === 'patientType'
          ? `Did you mean you are a ${val.isExisting ? `Existing Patient (ID: ${val.patientId || 'None'})` : 'New Patient'}?`
          : `Did you mean '${val}' for your ${slotName}?`;
        
        session.history.push({ role: 'bot', text: clarifyText });
        return res.status(200).json({
          sessionId,
          currentState: session.currentState,
          message: clarifyText,
          slots: session.slots,
          availableSlots: await getAvailableSlots(session.slots.specialization)
        });
      } else {
        // Conf < 40 or null (Failed extraction)
        session.attempts++;
      }
    }

    // Determine output message after slot checks
    transitionState(session); // double check transitions
    const nextPrompt = getPromptForState(session);
    session.history.push({ role: 'bot', text: nextPrompt });

    res.status(200).json({
      sessionId,
      currentState: session.currentState,
      message: nextPrompt,
      slots: session.slots,
      availableSlots: await getAvailableSlots(session.slots.specialization)
    });

  } catch (err) {
    console.error('[Chat API] Message processing failed:', err);
    res.status(500).json({ error: 'Error processing message.' });
  }
});

/**
 * GET /api/chat/history/:patientId
 * Returns all past appointment requests for a specific patient.
 */
router.get('/history/:patientId', async (req, res) => {
  const { patientId } = req.params;
  try {
    const history = await AppointmentRequest.find({ patientId }).sort({ timestamp: -1 });
    res.status(200).json(history);
  } catch (err) {
    console.error('[Chat API] History fetch error:', err);
    res.status(500).json({ error: 'Failed to retrieve history.' });
  }
});

/**
 * GET /api/chat/doctors
 * Returns all active doctors publicly (excluding slot booking logs).
 */
router.get('/doctors', async (req, res) => {
  try {
    const doctors = await Doctor.find({}, {
      doctorId: 1,
      name: 1,
      specialization: 1,
      insurancePlansAccepted: 1,
      rating: 1,
      yearsOfExperience: 1,
      averageConsultationDuration: 1,
      availableSlots: 1
    });
    res.status(200).json(doctors);
  } catch (err) {
    console.error('[Chat API] Public doctors fetch error:', err);
    res.status(500).json({ error: 'Failed to retrieve doctors.' });
  }
});

/**
 * GET /api/chat/wait-times
 * Returns dynamic estimated wait times for all specializations.
 */
router.get('/wait-times', async (req, res) => {
  try {
    const doctors = await Doctor.find({});
    
    // Group doctors by specialization
    const specGroups = {};
    doctors.forEach(doc => {
      if (!specGroups[doc.specialization]) {
        specGroups[doc.specialization] = [];
      }
      specGroups[doc.specialization].push(doc);
    });

    const waitTimes = Object.keys(specGroups).map(spec => {
      const docs = specGroups[spec];
      const numDoctors = docs.length;
      
      // Count total booked slots
      let bookedSlotsCount = 0;
      let totalConsultDuration = 0;
      
      docs.forEach(d => {
        bookedSlotsCount += (d.availableSlots || []).filter(s => s.isBooked).length;
        totalConsultDuration += d.averageConsultationDuration || 15;
      });

      const avgDuration = totalConsultDuration / numDoctors;
      
      // Calculate wait time: Base 5 mins + (booked slots * avgDuration) / doctors
      // Let's add a small base wait time per specialty to keep it realistic
      const baseWait = spec === 'Emergency' ? 8 : 10;
      const calculatedWait = Math.round(baseWait + (bookedSlotsCount * avgDuration) / numDoctors);
      
      let status = 'Normal';
      let statusClass = 'status-low';
      if (calculatedWait >= 30) {
        status = 'High';
        statusClass = 'status-high';
      } else if (calculatedWait >= 15) {
        status = 'Moderate';
        statusClass = 'status-moderate';
      }

      return {
        specialization: spec,
        waitTime: calculatedWait,
        queueLength: bookedSlotsCount,
        status,
        statusClass,
        doctorsCount: numDoctors
      };
    });

    res.status(200).json(waitTimes);
  } catch (err) {
    console.error('[Chat API] Wait times calculation error:', err);
    res.status(500).json({ error: 'Failed to calculate wait times.' });
  }
});

/**
 * POST /api/chat/cancel
 * Cancels an appointment request and releases the doctor slot.
 */
router.post('/cancel', async (req, res) => {
  const { appointmentId, patientId } = req.body;

  if (!appointmentId || !patientId) {
    return res.status(400).json({ error: 'Missing appointmentId or patientId.' });
  }

  try {
    // Find all appointment requests for this patient
    const requests = await AppointmentRequest.find({ patientId });
    
    // Find the one where the last 6 chars of _id matches appointmentId
    const appointment = requests.find(
      r => r._id.toString().substring(18).toUpperCase() === appointmentId.toUpperCase()
    );

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    if (appointment.status === 'cancelled') {
      return res.status(400).json({ error: 'Appointment is already cancelled.' });
    }

    // Set status to cancelled
    appointment.status = 'cancelled';
    await appointment.save();

    // Release slot if confirmed
    if (appointment.assignedDoctor && appointment.confirmedSlot && appointment.confirmedSlot.day && appointment.confirmedSlot.time) {
      const doctor = await Doctor.findOne({
        name: appointment.assignedDoctor,
        specialization: appointment.specializationRequested
      });

      if (doctor) {
        const startTime = appointment.confirmedSlot.time.split('-')[0];
        const slot = doctor.availableSlots.find(
          s => s.day === appointment.confirmedSlot.day && s.startTime === startTime
        );

        if (slot) {
          slot.isBooked = false;
          await doctor.save();
          console.log(`[Cancellation] Released slot for doctor ${doctor.name} on ${slot.day} at ${slot.startTime}`);
        } else {
          console.warn(`[Cancellation] Doctor ${doctor.name} slot not found for ${appointment.confirmedSlot.day} ${startTime}`);
        }
      } else {
        console.warn(`[Cancellation] Doctor ${appointment.assignedDoctor} not found.`);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Appointment cancelled successfully and slot released.'
    });
  } catch (err) {
    console.error('[Chat API] Cancellation error:', err);
    res.status(500).json({ error: 'Failed to cancel appointment.' });
  }
});

/**
 * GET /api/chat/pre-intake/:appointmentId
 * Pre-Appointment Intake & Clinical Preparation Checklist Generator
 */
router.get('/pre-intake/:appointmentId', async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const requests = await AppointmentRequest.find();
    const app = requests.find(
      r => r._id.toString().substring(18).toUpperCase() === appointmentId.toUpperCase()
    );

    if (!app) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    const dept = (app.specializationRequested || 'General Medicine').toLowerCase();
    
    // Custom prep guidelines based on department
    let prepChecklist = [
      'Bring a valid Photo ID and Insurance Card (if applicable).',
      'Bring a list of all current prescription and over-the-counter medications.',
      'Arrive 15 minutes prior to your scheduled time slot.'
    ];

    if (dept.includes('cardio')) {
      prepChecklist.push('Bring previous ECG, Echocardiogram reports, or blood pressure logs if available.');
      prepChecklist.push('Avoid caffeinated beverages 2 hours prior to consultation.');
      prepChecklist.push('Fast for 8-10 hours if fasting lipid profile or blood glucose tests are scheduled.');
    } else if (dept.includes('derm')) {
      prepChecklist.push('Avoid applying heavy makeup, lotions, or creams on the skin area to be inspected.');
      prepChecklist.push('Note down when skin symptoms first appeared and any triggers.');
    } else if (dept.includes('pedia')) {
      prepChecklist.push("Bring the child's immunization / vaccination history card.");
      prepChecklist.push('Note down symptoms, fever logs, and child weight if recorded.');
    } else if (dept.includes('ortho')) {
      prepChecklist.push('Bring previous X-rays, MRI scans, or orthopedic consultation notes.');
      prepChecklist.push('Wear loose, comfortable clothing for physical mobility assessment.');
    } else {
      prepChecklist.push('List all primary symptoms and when they started.');
    }

    res.status(200).json({
      success: true,
      appointmentId,
      patientId: app.patientId,
      specialization: app.specializationRequested,
      doctor: app.assignedDoctor || 'Assigned Specialist',
      slot: app.confirmedSlot,
      prepChecklist,
      hospitalLocation: 'City General Hospital — 100 Medical Plaza Blvd, Suite 400',
      contactPhone: '+1 (800) 555-SLOT'
    });
  } catch (err) {
    console.error('[Chat API] Pre-intake error:', err);
    res.status(500).json({ error: 'Failed to retrieve pre-appointment intake guide.' });
  }
});

export default router;
