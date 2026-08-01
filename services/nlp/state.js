export const States = {
  COLLECTING_SPECIALIZATION: 'COLLECTING_SPECIALIZATION',
  COLLECTING_TIME: 'COLLECTING_TIME',
  COLLECTING_TIMEFRAME: 'COLLECTING_TIMEFRAME',
  COLLECTING_PATIENT_TYPE: 'COLLECTING_PATIENT_TYPE',
  COLLECTING_PATIENT_NAME: 'COLLECTING_PATIENT_NAME',
  COLLECTING_PATIENT_PHONE: 'COLLECTING_PATIENT_PHONE',
  CONFIRMING: 'CONFIRMING',
  DECIDING: 'DECIDING',
  DONE: 'DONE',
  FROZEN: 'FROZEN'
};

// In-memory sessions map: sessionId -> session object
const sessions = new Map();

// Localized strings for each state
const TRANSLATIONS = {
  en: {
    specialization: 'Hello! Which medical department or specialist do you need to book an appointment with today? (e.g., Cardiology, Dermatology or describe symptoms)',
    preferredTime: 'What time of day do you prefer? (e.g., Morning, Afternoon, or a specific time like 10:00)',
    timeframe: 'Which day of the week works best for you? (e.g., Monday, Tuesday, tomorrow)',
    patientType: 'Are you a new or existing patient? If existing, please provide your Patient ID (e.g., P101).',
    patientName: 'Please enter your full name for the booking records.',
    patientPhone: 'Please enter your contact phone number.',
    confirm: 'Please confirm your request details:\n- Department: {specialization}\n- Day: {timeframe}\n- Preferred Time: {preferredTime}\n- Preferred Doctor: {preferredDoctor}\n- Name: {patientName}\n- Phone: {patientPhone}\n- Patient Status: {typeStr}\n\nIs this correct? (Yes/No)',
    done: 'Your appointment decision has been made. Thank you!',
    frozen: 'This session has been locked due to security flags. Please contact administrative support.',
    default: 'How can I assist you?',
    specHelp: 'Please choose one of the following specializations: Cardiology, Dermatology, General Medicine, Orthopedics, Pediatrics, or ENT.',
    timeHelp: 'Please provide a general time like "Morning", "Afternoon", or a specific hour like "10:00".',
    timeframeHelp: 'Please specify a weekday, such as "Monday" or "Friday".',
    patientTypeHelp: 'Are you an existing patient? Please type "existing" followed by your ID (e.g. "P101"), or type "new patient".',
    nameHelp: 'Please enter a valid full name (letters only, no placeholder names).',
    phoneHelp: 'Please enter a valid phone number (between 7 and 15 digits).'
  },
  ta: {
    specialization: 'வணக்கம்! இன்று நீங்கள் எந்த மருத்துவப் பிரிவை அல்லது நிபுணரை முன்பதிவு செய்ய வேண்டும்? (கார்டியாலஜி, டெர்மட்டாலஜி அல்லது உங்கள் அறிகுறிகளை விளக்குங்கள்)',
    preferredTime: 'உங்களுக்கு நாளின் எந்த நேரம் வசதியானது? (காலை, மதியம், மாலை அல்லது ஒரு குறிப்பிட்ட நேரம், எ.கா: 10:00)',
    timeframe: 'வாரத்தின் எந்த நாள் உங்களுக்குச் சிறந்தது? (திங்கள், செவ்வாய், நாளை)',
    patientType: 'நீங்கள் புதியவரா அல்லது ஏற்கனவே உள்ள நோயாளிதானா? ஏற்கனவே உள்ள நோயாளி என்றால், உங்கள் நோயாளி ஐடியை (எ.கா., P101) வழங்கவும்.',
    patientName: 'முன்பதிவு பதிவுகளுக்காக உங்கள் முழு பெயரை உள்ளிடவும்.',
    patientPhone: 'உங்கள் தொடர்பு தொலைபேசி எண்ணை உள்ளிடவும்.',
    confirm: 'தயவுசெய்து உங்கள் விவரங்களை உறுதிப்படுத்தவும்:\n- மருத்துவப் பிரிவு: {specialization}\n- நாள்: {timeframe}\n- விரும்பிய நேரம்: {preferredTime}\n- விரும்பிய மருத்துவர்: {preferredDoctor}\n- பெயர்: {patientName}\n- தொலைபேசி: {patientPhone}\n- நோயாளி நிலை: {typeStr}\n\nஇது சரியானதா? (ஆம்/இல்லை)',
    done: 'உங்கள் முன்பதிவு இறுதி செய்யப்பட்டது. நன்றி!',
    frozen: 'பாதுகாப்பு காரணங்களுக்காக இந்த அமர்வு பூட்டப்பட்டுள்ளது. தயவுசெய்து நிர்வாக ஆதரவைத் தொடர்பு கொள்ளவும்.',
    default: 'நான் உங்களுக்கு எப்படி உதவ முடியும்?',
    specHelp: 'தயவுசெய்து பின்வரும் பிரிவுகளில் ஒன்றைத் தேர்ந்தெடுக்கவும்: Cardiology, Dermatology, General Medicine, Orthopedics, Pediatrics, அல்லது ENT.',
    timeHelp: 'காலை, மதியம், அல்லது "10:00" போன்ற குறிப்பிட்ட நேரத்தை வழங்கவும்.',
    timeframeHelp: 'திங்கட்கிழமை அல்லது வெள்ளிக்கிழமை போன்ற வாரநாளைக் குறிப்பிடவும்.',
    patientTypeHelp: 'நீங்கள் ஏற்கனவே உள்ள நோயாளி என்றால் "existing P101" என்றும், புதியவர் என்றால் "new" என்றும் தட்டச்சு செய்யவும்.',
    nameHelp: 'தயவுசெய்து சரியான முழு பெயரை உள்ளிடவும் (எழுத்துக்கள் மட்டும், போலி பெயர்கள் அல்ல).',
    phoneHelp: 'தயவுசெய்து சரியான தொலைபேசி எண்ணை உள்ளிடவும் (7 முதல் 15 இலக்கங்கள்).'
  },
  hi: {
    specialization: 'नमस्ते! आज आपको किस चिकित्सा विभाग या विशेषज्ञ के साथ अपॉइंटमेंट बुक करना है? (जैसे, कार्डियोलॉजी, डर्मेटोलॉजी या अपने लक्षणों का वर्णन करें)',
    preferredTime: 'आप दिन का कौन सा समय पसंद करते हैं? (जैसे, सुबह, दोपहर, या कोई विशिष्ट समय जैसे 10:00)',
    timeframe: 'सप्ताह का कौन सा दिन आपके लिए सबसे अच्छा है? (जैसे, सोमवार, मंगलवार, कल)',
    patientType: 'क्या आप नए या पुराने मरीज हैं? यदि आप पुराने मरीज हैं, तो कृपया अपनी मरीज आईडी (जैसे, P101) प्रदान करें।',
    patientName: 'कृपया बुकिंग रिकॉर्ड के लिए अपना पूरा नाम दर्ज करें।',
    patientPhone: 'कृपया अपना संपर्क फ़ोन नंबर दर्ज करें।',
    confirm: 'कृपया अपने विवरण की पुष्टि करें:\n- विभाग: {specialization}\n- दिन: {timeframe}\n- पसंदीदा समय: {preferredTime}\n- पसंदीदा डॉक्टर: {preferredDoctor}\n- नाम: {patientName}\n- फ़ोन: {patientPhone}\n- मरीज की स्थिति: {typeStr}\n\nक्या यह सही है? (हाँ/नहीं)',
    done: 'आपका अपॉइंटमेंट तय हो गया है। धन्यवाद!',
    frozen: 'सुरक्षा कारणों से यह सत्र लॉक कर दिया गया है। कृपया व्यवस्थापक से संपर्क करें।',
    default: 'मैं आपकी किस प्रकार सहायता कर सकता हूँ?',
    specHelp: 'कृपया इनमें से कोई एक विभाग चुनें: Cardiology, Dermatology, General Medicine, Orthopedics, Pediatrics, या ENT.',
    timeHelp: 'कृपया "सुबह", "दोपहर" या विशिष्ट समय जैसे "10:00" प्रदान करें।',
    timeframeHelp: 'कृपया एक सप्ताह का दिन निर्दिष्ट करें, जैसे "सोमवार" या "सोमवार"।',
    patientTypeHelp: 'क्या आप पुराने मरीज हैं? कृपया "existing" के साथ अपनी आईडी (जैसे "P101") लिखें, या "new patient" लिखें।',
    nameHelp: 'कृपया एक वैध पूरा नाम दर्ज करें (केवल अक्षर, नकली नाम नहीं)।',
    phoneHelp: 'कृपया एक वैध फ़ोन नंबर दर्ज करें (7 से 15 अंक)।'
  }
};

/**
 * Automatically detects input text language (English, Tamil, Hindi)
 * by scanning character ranges.
 */
export function detectLanguage(text) {
  const tamilRegex = /[\u0B80-\u0BFF]/;
  const devanagariRegex = /[\u0900-\u097F]/;
  
  if (tamilRegex.test(text)) return 'ta';
  if (devanagariRegex.test(text)) return 'hi';
  return 'en';
}

/**
 * Creates a new session or resets an existing one.
 */
export function createSession(sessionId) {
  const session = {
    sessionId,
    currentState: States.COLLECTING_SPECIALIZATION,
    slots: {
      specialization: null,
      preferredTime: null,
      timeframe: null,
      preferredDoctor: null,
      isExistingPatient: null,
      patientId: null,
      patientName: null,
      patientPhone: null
    },
    attempts: 0,
    clarificationValue: null, // Temporary store for 40-69% confidence values
    language: 'en', // 'en' | 'ta' | 'hi'
    history: [] // Holds chat conversation logs
  };
  sessions.set(sessionId, session);
  return session;
}

/**
 * Retrieves a session by ID.
 */
export function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    return createSession(sessionId);
  }
  return sessions.get(sessionId);
}

/**
 * Deletes a session.
 */
export function deleteSession(sessionId) {
  sessions.delete(sessionId);
}

/**
 * Gets the next slot name based on the current state.
 */
export function getSlotNameForState(state) {
  switch (state) {
    case States.COLLECTING_SPECIALIZATION:
      return 'specialization';
    case States.COLLECTING_TIME:
      return 'preferredTime';
    case States.COLLECTING_TIMEFRAME:
      return 'timeframe';
    case States.COLLECTING_PATIENT_TYPE:
      return 'patientType';
    case States.COLLECTING_PATIENT_NAME:
      return 'patientName';
    case States.COLLECTING_PATIENT_PHONE:
      return 'patientPhone';
    default:
      return null;
  }
}

/**
 * Gets the prompt message for the user based on the current state and language.
 */
export function getPromptForState(session) {
  const state = session.currentState;
  const slotName = getSlotNameForState(state);
  const lang = session.language || 'en';
  const dict = TRANSLATIONS[lang] || TRANSLATIONS['en'];
  
  if (session.attempts >= 3) {
    switch (slotName) {
      case 'specialization':
        return dict.specHelp;
      case 'preferredTime':
        return dict.timeHelp;
      case 'timeframe':
        return dict.timeframeHelp;
      case 'patientType':
        return dict.patientTypeHelp;
      case 'patientName':
        return dict.nameHelp;
      case 'patientPhone':
        return dict.phoneHelp;
    }
  }

  switch (state) {
    case States.COLLECTING_SPECIALIZATION:
      return dict.specialization;
    case States.COLLECTING_TIME:
      return dict.preferredTime;
    case States.COLLECTING_TIMEFRAME:
      return dict.timeframe;
    case States.COLLECTING_PATIENT_TYPE:
      return dict.patientType;
    case States.COLLECTING_PATIENT_NAME:
      return dict.patientName;
    case States.COLLECTING_PATIENT_PHONE:
      return dict.patientPhone;
    case States.CONFIRMING:
      const { specialization, preferredTime, timeframe, preferredDoctor, patientName, patientPhone } = session.slots;
      const typeStr = session.slots.isExistingPatient 
        ? (lang === 'ta' ? `ஏற்கனவே உள்ள நோயாளி (ID: ${session.slots.patientId})` : lang === 'hi' ? `पुराने मरीज (ID: ${session.slots.patientId})` : `Existing (ID: ${session.slots.patientId})`)
        : (lang === 'ta' ? 'புதியவர்' : lang === 'hi' ? 'नए मरीज' : 'New');
      
      const docStr = preferredDoctor || (lang === 'ta' ? 'கிடைக்கக்கூடிய எந்த ஒரு நிபுணரும்' : lang === 'hi' ? 'कोई भी उपलब्ध विशेषज्ञ' : 'Any Available Specialist');

      return dict.confirm
        .replace('{specialization}', specialization)
        .replace('{timeframe}', timeframe)
        .replace('{preferredTime}', preferredTime)
        .replace('{preferredDoctor}', docStr)
        .replace('{patientName}', patientName || 'N/A')
        .replace('{patientPhone}', patientPhone || 'N/A')
        .replace('{typeStr}', typeStr);
    case States.DONE:
      return dict.done;
    case States.FROZEN:
      return dict.frozen;
    default:
      return dict.default;
  }
}

/**
 * State machine transition driver.
 */
export function transitionState(session) {
  let changed = true;
  while (changed) {
    const prevState = session.currentState;

    switch (session.currentState) {
      case States.COLLECTING_SPECIALIZATION:
        if (session.slots.specialization) {
          session.currentState = States.COLLECTING_TIME;
          session.attempts = 0;
        }
        break;
      case States.COLLECTING_TIME:
        if (session.slots.preferredTime) {
          session.currentState = States.COLLECTING_TIMEFRAME;
          session.attempts = 0;
        }
        break;
      case States.COLLECTING_TIMEFRAME:
        if (session.slots.timeframe) {
          session.currentState = States.COLLECTING_PATIENT_TYPE;
          session.attempts = 0;
        }
        break;
      case States.COLLECTING_PATIENT_TYPE:
        if (session.slots.isExistingPatient !== null) {
          // If they are existing, make sure we have patientId
          if (session.slots.isExistingPatient && !session.slots.patientId) {
            // Keep collecting ID
          } else {
            session.currentState = States.COLLECTING_PATIENT_NAME;
            session.attempts = 0;
          }
        }
        break;
      case States.COLLECTING_PATIENT_NAME:
        if (session.slots.patientName) {
          session.currentState = States.COLLECTING_PATIENT_PHONE;
          session.attempts = 0;
        }
        break;
      case States.COLLECTING_PATIENT_PHONE:
        if (session.slots.patientPhone) {
          session.currentState = States.CONFIRMING;
          session.attempts = 0;
        }
        break;
      default:
        break;
    }

    changed = session.currentState !== prevState;
  }
}
