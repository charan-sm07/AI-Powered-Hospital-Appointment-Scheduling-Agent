let sessionId = null;

const messagesContainer = document.getElementById('chat-messages');
const thinkingIndicator = document.getElementById('thinking-indicator');
const chatForm = document.getElementById('chat-form');
const userInputField = document.getElementById('user-input');
const resetBtn = document.getElementById('reset-btn');

/**
 * Initializes a new scheduling session.
 */
async function startSession() {
  messagesContainer.innerHTML = '';
  showThinking(true);
  try {
    const response = await fetch('/api/chat/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    sessionId = data.sessionId;
    
    // Render first bot question
    appendBotMessage(data.message);
    renderSuggestionChips(data.currentState, data.availableSlots);
    
    // Auto-submit URL parameters if present
    checkQueryParamsAndAutoSubmit();
  } catch (error) {
    console.error('Error starting session:', error);
    appendSystemMessage('Unable to establish connection with MediSlot AI. Please ensure the backend is running.');
    renderSuggestionChips(null);
  } finally {
    showThinking(false);
  }
}

/**
 * Sends the user message to the API and handles the bot's reply.
 */
async function handleSendMessage(event) {
  event.preventDefault();
  const text = userInputField.value.trim();
  if (!text || !sessionId) return;
  userInputField.value = '';
  await sendMessage(text);
}

async function sendMessage(text, slotOverrides = null) {
  if (!sessionId) return;

  // Append user message
  appendUserMessage(text);

  // Show thinking pulse line
  showThinking(true);

  try {
    const response = await fetch('/api/chat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, text, slotOverrides })
    });
    
    const data = await response.json();

    if (data.flagged) {
      // Quarantine warning card
      appendSecurityEventCard(data.message);
      renderSuggestionChips(null);
    } else if (data.decision) {
      // Decision Verdict Card
      appendDecisionCard(data.decision);
      renderSuggestionChips(null);
    } else {
      // Standard slot gathering question
      if (data.validationFailed) {
        appendValidationWarningCard(data.message);
      } else {
        appendBotMessage(data.message);
      }
      renderSuggestionChips(data.currentState, data.availableSlots);
    }
  } catch (error) {
    console.error('Error sending message:', error);
    appendSystemMessage('Connection error. Please try sending your message again.');
    renderSuggestionChips(null);
  } finally {
    showThinking(false);
  }
}

/**
 * Appends a warning card when validation of name/phone fails.
 */
function appendValidationWarningCard(text) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const card = document.createElement('div');
  card.className = 'security-card validation-warning';
  
  const formatted = escapeHTML(text).replace(/\n/g, '<br>');
  card.innerHTML = `
    <div class="security-title">⚠️ Patient Verification Alert</div>
    <div class="security-text">${formatted}</div>
    <span class="message-time" style="color: var(--warning-dark, #d9480f); font-size: 0.75rem; margin-top: 8px; display: block;">${time}</span>
  `;
  messagesContainer.appendChild(card);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Helper to show/hide the animated EKG loading indicator.
 */
function showThinking(show) {
  if (show) {
    thinkingIndicator.classList.remove('hidden');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  } else {
    thinkingIndicator.classList.add('hidden');
  }
}

/**
 * Appends a standard user message bubble.
 */
function appendUserMessage(text) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message message-user';
  msgDiv.innerHTML = `${escapeHTML(text)}<span class="message-time">${time}</span>`;
  messagesContainer.appendChild(msgDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Appends a standard bot message bubble.
 */
function appendBotMessage(text) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message message-bot';
  // Use innerHTML but only for formatting newlines
  const formatted = escapeHTML(text).replace(/\n/g, '<br>');
  msgDiv.innerHTML = `${formatted}<span class="message-time">${time} <button type="button" class="speech-btn" title="Speak Response">🔊</button></span>`;
  messagesContainer.appendChild(msgDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // Bind Voice synthesis to the speech button
  const speechBtn = msgDiv.querySelector('.speech-btn');
  if (speechBtn) {
    speechBtn.addEventListener('click', () => speakText(text));
  }
}

/**
 * Appends a system connection error notice.
 */
function appendSystemMessage(text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message message-bot';
  msgDiv.style.backgroundColor = '#f1f3f5';
  msgDiv.style.color = 'var(--muted)';
  msgDiv.innerHTML = `<em>${escapeHTML(text)}</em>`;
  messagesContainer.appendChild(msgDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Appends a flagged security warning card.
 */
function appendSecurityEventCard(text) {
  const card = document.createElement('div');
  const isEmergency = text.includes('Emergency') || text.includes('அவசரநிலை') || text.includes('आपातकालीन');
  
  if (isEmergency) {
    card.className = 'security-card security-emergency';
    card.innerHTML = `
      <div class="security-title">🚨 MEDICAL EMERGENCY DETECTED</div>
      <div class="security-text">${escapeHTML(text).replace(/\n/g, '<br>')}</div>
      <div class="security-action">
        <a href="tel:911" class="emergency-call-btn">📞 Call Emergency (911)</a>
        <a href="https://www.google.com/maps/search/emergency+room+near+me" target="_blank" class="emergency-maps-btn">📍 Find Nearest ER</a>
      </div>
    `;
  } else {
    card.className = 'security-card security-threat';
    card.innerHTML = `
      <div class="security-title">⚠️ ACCESS SECURITY QUARANTINE</div>
      <div class="security-text">${escapeHTML(text)}</div>
      <div class="security-action-threat">
        This session has been blocked due to suspicious activity scoring. Please restart your session if this was an error.
      </div>
    `;
  }
  messagesContainer.appendChild(card);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * Renders the final appointment decision as a distinct, premium ticket card.
 */
function appendDecisionCard(decision) {
  const card = document.createElement('div');
  const verdict = decision.verdict; // 'confirmed' | 'alternative_suggested' | 'waitlisted'
  
  let verdictClass = 'decision-card-confirmed';
  let badgeClass = 'badge-confirmed';
  let badgeText = 'Confirmed';

  if (verdict === 'alternative_suggested') {
    verdictClass = 'decision-card-alternative';
    badgeClass = 'badge-alternative';
    badgeText = 'Alternative Suggested';
  } else if (verdict === 'waitlisted') {
    verdictClass = 'decision-card-waitlisted';
    badgeClass = 'badge-waitlisted';
    badgeText = 'Waitlisted';
  }

  card.className = `decision-card ${verdictClass}`;

  // Generate reference pills
  const refPills = (decision.policyReferences || [])
    .map(ref => `<span class="ref-pill">${escapeHTML(ref)}</span>`)
    .join('');

  // Ticket detail display
  const doctorVal = decision.assignedDoctor ? decision.assignedDoctor : 'N/A';
  const dayVal = decision.confirmedSlot ? decision.confirmedSlot.day : 'N/A';
  const timeVal = decision.confirmedSlot ? decision.confirmedSlot.time : 'N/A';

  const recScore = decision.recommendationScore || 85;
  const recReasons = (decision.recommendationReasons || [])
    .map(reason => `<li>${escapeHTML(reason)}</li>`)
    .join('');
  
  const waitTime = decision.estimatedWaitingTime || 10;
  const waitConf = decision.waitingTimeConfidence || 90;
  const appId = decision.appointmentId || 'N/A';

  const otherRanked = (decision.allRankedDoctors || [])
    .filter(doc => doc.name !== decision.assignedDoctor)
    .map(doc => `
      <div class="other-rankings-item">
        <span>${escapeHTML(doc.name)}</span>
        <span>Score: ${doc.score}% | Est. Wait: ${doc.estimatedWaitingTime}m</span>
      </div>
    `)
    .join('');

  card.innerHTML = `
    <div class="card-header">
      <div class="card-title">Appointment Ticket #${appId}</div>
      <span class="card-badge ${badgeClass}">${badgeText}</span>
    </div>
    <div class="card-body">
      <div class="ticket-details">
        <div class="ticket-row">
          <span class="ticket-label">Assigned Specialist:</span>
          <span class="ticket-value">${escapeHTML(doctorVal)}</span>
        </div>
        <div class="ticket-row">
          <span class="ticket-label">Scheduled Day:</span>
          <span class="ticket-value">${escapeHTML(dayVal)}</span>
        </div>
        <div class="ticket-row">
          <span class="ticket-label">Time Window:</span>
          <span class="ticket-value">${escapeHTML(timeVal)}</span>
        </div>
      </div>

      <div class="wait-time-row">
        <span class="wait-time-label">⏳ Est. Waiting Time:</span>
        <span class="wait-time-value">${waitTime} Mins (${waitConf}% conf)</span>
      </div>

      <div class="rec-section">
        <div class="rec-title">
          <span>⭐ Recommended Specialist</span>
          <span class="rec-score-badge">${recScore}% Match</span>
        </div>
        <div class="rec-doctor-name">${escapeHTML(doctorVal)}</div>
        <ul class="rec-reasons">
          ${recReasons}
        </ul>
      </div>

      ${otherRanked ? `
        <div class="other-rankings">
          <div class="other-rankings-title">Other Specialization Matches:</div>
          ${otherRanked}
        </div>
      ` : ''}

      <div class="card-reasoning" style="margin-top: 10px;">
        <strong>Clinical Review Notes:</strong><br>
        ${escapeHTML(decision.reasoning)}
      </div>

      <div class="card-references">
        ${refPills}
      </div>

      <div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
        <button type="button" class="btn download-pdf-btn">Print Pass / PDF</button>
        <button type="button" class="btn download-ics-btn" style="background-color: var(--surface-card); color: var(--ink); border: 1px solid var(--border);">📅 Add to Calendar (.ics)</button>
      </div>
    </div>
  `;

  messagesContainer.appendChild(card);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // Bind print event listener
  const printBtn = card.querySelector('.download-pdf-btn');
  if (printBtn) {
    printBtn.addEventListener('click', () => downloadPDF(decision));
  }

  // Bind .ics calendar download listener
  const icsBtn = card.querySelector('.download-ics-btn');
  if (icsBtn) {
    icsBtn.addEventListener('click', () => downloadICS(decision));
  }

  // Trigger simulated smart notifications if confirmed
  if (verdict === 'confirmed') {
    triggerSmartNotifications(decision);
  }
}

/**
 * Generates and downloads an iCal (.ics) calendar file for the appointment.
 */
function downloadICS(decision) {
  const docName = decision.assignedDoctor || 'Specialist';
  const dayStr = decision.confirmedSlot ? decision.confirmedSlot.day : 'Scheduled Day';
  const timeStr = decision.confirmedSlot ? decision.confirmedSlot.time : '09:00 AM';
  const appId = decision.appointmentId || 'MEDISLOT';

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MediSlot AI//Hospital Appointment Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `SUMMARY:Medical Appointment with ${docName} (${dayStr})`,
    `DESCRIPTION:Confirmed appointment ticket #${appId} with ${docName}. Estimated wait time: ${decision.estimatedWaitingTime || 10} minutes. Notes: ${decision.reasoning || 'MediSlot AI Verified'}`,
    'LOCATION:City General Hospital, 100 Medical Plaza Blvd',
    'STATUS:CONFIRMED',
    `UID:medislot-${appId}-${Date.now()}@hospital.org`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `appointment_${appId}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToastNotification('📅', 'Appointment added to calendar (.ics exported)!');
}

/**
 * Generates and prints the clean, styled PDF ticket.
 */
function downloadPDF(decision) {
  const printWindow = window.open('', '_blank');
  const doctorVal = decision.assignedDoctor ? decision.assignedDoctor : 'N/A';
  const dayVal = decision.confirmedSlot ? decision.confirmedSlot.day : 'N/A';
  const timeVal = decision.confirmedSlot ? decision.confirmedSlot.time : 'N/A';
  const appId = decision.appointmentId || 'N/A';
  const waitTime = decision.estimatedWaitingTime || 10;
  
  const htmlContent = `
    <html>
      <head>
        <title>MediSlot AI - Appointment Ticket #${appId}</title>
        <style>
          body {
            font-family: 'Inter', sans-serif;
            background-color: #fff;
            color: #16232B;
            padding: 40px;
          }
          .ticket-container {
            border: 2px dashed #0E6E63;
            border-radius: 12px;
            padding: 30px;
            max-width: 600px;
            margin: 0 auto;
            background-color: #F6F8F9;
          }
          h1 {
            color: #0E6E63;
            font-size: 24px;
            margin-bottom: 5px;
            text-align: center;
          }
          .subtitle {
            font-size: 14px;
            color: #666;
            text-align: center;
            margin-bottom: 30px;
          }
          .row {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid #E1E6EB;
          }
          .label {
            font-weight: 600;
            color: #555;
          }
          .val {
            font-family: 'IBM Plex Mono', monospace;
            font-weight: bold;
          }
          .reasoning {
            margin-top: 30px;
            font-size: 14px;
            line-height: 1.5;
            background-color: #fff;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #0E6E63;
          }
          .footer {
            margin-top: 40px;
            font-size: 12px;
            color: #888;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="ticket-container">
          <h1>MediSlot AI Appointment Ticket</h1>
          <div class="subtitle">Official Scheduling Confirmation</div>
          <div class="row">
            <span class="label">Appointment ID</span>
            <span class="val">#${appId}</span>
          </div>
          <div class="row">
            <span class="label">Specialist</span>
            <span class="val">${doctorVal}</span>
          </div>
          <div class="row">
            <span class="label">Date / Day</span>
            <span class="val">${dayVal}</span>
          </div>
          <div class="row">
            <span class="label">Time Slot</span>
            <span class="val">${timeVal}</span>
          </div>
          <div class="row">
            <span class="label">Est. Waiting Time</span>
            <span class="val">${waitTime} Minutes</span>
          </div>
          <div class="reasoning">
            <strong>Clinical Review Notes:</strong><br>
            ${decision.reasoning}
          </div>
          <div class="footer">
            Thank you for scheduling with MediSlot AI. Please present this ticket at reception.
          </div>
        </div>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
    </html>
  `;
  
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

/**
 * Triggers simulated smart notifications upon booking confirmation.
 */
function triggerSmartNotifications(decision) {
  const appId = decision.appointmentId || 'N/A';
  const notifications = [
    { type: 'email', icon: '📧', text: `Email confirmation sent for Ticket #${appId}` },
    { type: 'sms', icon: '💬', text: `SMS Alert sent to patient's mobile device` },
    { type: 'whatsapp', icon: '🟢', text: `WhatsApp status receipt delivered` }
  ];

  notifications.forEach((notif, index) => {
    setTimeout(() => {
      showToastNotification(notif.icon, notif.text);
    }, (index + 1) * 1200);
  });
}

/**
 * Creates and displays a beautiful, dynamic, sliding glassmorphic toast notification.
 */
function showToastNotification(icon, message) {
  // Ensure a toast container exists in the body
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${escapeHTML(message)}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);

  // Auto-remove toast after 4.5 seconds
  setTimeout(() => {
    toast.style.animation = 'toastSlideOut 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 4500);
}

/**
 * Escapes HTML characters to prevent XSS.
 */
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Speech Recognition / Voice Input
const micBtn = document.getElementById('mic-btn');
if (micBtn) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    let isRecording = false;

    micBtn.addEventListener('click', () => {
      if (!isRecording) {
        recognition.start();
        micBtn.classList.add('recording');
        micBtn.textContent = '🛑';
        isRecording = true;
      } else {
        recognition.stop();
      }
    });

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      userInputField.value = transcript;
    };

    recognition.onend = () => {
      micBtn.classList.remove('recording');
      micBtn.textContent = '🎤';
      isRecording = false;
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      micBtn.classList.remove('recording');
      micBtn.textContent = '🎤';
      isRecording = false;
    };
  } else {
    micBtn.style.display = 'none';
  }
}

const quickRepliesContainer = document.getElementById('quick-replies');

function renderSuggestionChips(state, availableSlots = []) {
  if (!quickRepliesContainer) return;
  quickRepliesContainer.innerHTML = '';
  
  if (!state || state === 'DONE' || state === 'FROZEN' || state === 'DECIDING') {
    quickRepliesContainer.classList.add('hidden');
    return;
  }

  // Visual Interactive Slot Picker Grid
  if ((state === 'COLLECTING_TIME' || state === 'COLLECTING_TIMEFRAME') && availableSlots && availableSlots.length > 0) {
    const gridDiv = document.createElement('div');
    gridDiv.className = 'slot-picker-grid';

    const gridHeader = document.createElement('div');
    gridHeader.style.width = '100%';
    gridHeader.style.fontSize = '0.8rem';
    gridHeader.style.fontWeight = '600';
    gridHeader.style.color = 'var(--muted)';
    gridHeader.style.marginBottom = '4px';
    gridHeader.style.textAlign = 'left';
    gridHeader.innerText = 'Or select an available time directly:';
    gridDiv.appendChild(gridHeader);

    availableSlots.forEach(slot => {
      const card = document.createElement('div');
      card.className = 'slot-picker-card';
      card.innerHTML = `
        <span class="slot-card-doctor">${escapeHTML(slot.doctorName)}</span>
        <span class="slot-card-time">⏰ ${slot.day} - ${slot.startTime}</span>
        <span class="slot-card-day">${escapeHTML(slot.specialization)}</span>
      `;
      card.addEventListener('click', () => {
        const descMsg = `Booked ${slot.day} at ${slot.startTime} with ${slot.doctorName}`;
        const overrides = {
          specialization: slot.specialization,
          timeframe: slot.day,
          preferredTime: slot.startTime
        };
        quickRepliesContainer.classList.add('hidden');
        sendMessage(descMsg, overrides);
      });
      gridDiv.appendChild(card);
    });

    quickRepliesContainer.appendChild(gridDiv);
    quickRepliesContainer.classList.remove('hidden');
    return;
  }

  let chips = [];
  if (state === 'COLLECTING_SPECIALIZATION') {
    chips = ['Cardiology', 'Dermatology', 'General Medicine', 'Pediatrics'];
  } else if (state === 'COLLECTING_TIME') {
    chips = ['Morning', 'Afternoon', '10:00 AM', '02:00 PM'];
  } else if (state === 'COLLECTING_TIMEFRAME') {
    chips = ['Monday', 'Tomorrow', 'Tuesday', 'Wednesday'];
  } else if (state === 'COLLECTING_PATIENT_TYPE') {
    chips = ['New Patient', 'Existing Patient'];
  } else if (state === 'CONFIRMING') {
    chips = ['Yes', 'No'];
  }

  if (chips.length === 0) {
    quickRepliesContainer.classList.add('hidden');
    return;
  }

  chips.forEach(chipText => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'quick-reply-chip';
    chip.innerText = chipText;
    
    chip.addEventListener('click', () => {
      let inputVal = chipText;
      if (inputVal === 'Existing Patient') {
        inputVal = 'Existing P101'; // Default ID for demonstration
      } else if (inputVal === 'New Patient') {
        inputVal = 'New';
      }
      
      userInputField.value = inputVal;
      quickRepliesContainer.classList.add('hidden');
      chatForm.dispatchEvent(new Event('submit'));
    });
    quickRepliesContainer.appendChild(chip);
  });

  quickRepliesContainer.classList.remove('hidden');
}

// Bind Listeners
chatForm.addEventListener('submit', handleSendMessage);
resetBtn.addEventListener('click', startSession);

// Theme Toggle Switcher
const themeToggleBtn = document.getElementById('theme-toggle-btn');
if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });
}

// Uses Web Speech Synthesis API to read text out loud.
function speakText(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    
    // Remove formatting symbols/markdown
    const cleanText = text.replace(/\*\*|⚠️|🩺|⭐|⏰|📅/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Auto-select language based on characters
    const hasTamil = /[\u0B80-\u0BFF]/.test(text);
    const hasHindi = /[\u0900-\u097F]/.test(text);

    if (hasTamil) {
      utterance.lang = 'ta-IN';
    } else if (hasHindi) {
      utterance.lang = 'hi-IN';
    } else {
      utterance.lang = 'en-US';
    }

    window.speechSynthesis.speak(utterance);
  } else {
    alert('Text-to-Speech is not supported in this browser.');
  }
}

// Patient History Modal / Drawer
function initPatientHistory() {
  const modal = document.getElementById('history-modal');
  const toggleBtn = document.getElementById('history-toggle-btn');
  const closeBtn = document.getElementById('close-history-btn');
  const searchBtn = document.getElementById('search-history-btn');
  const patientIdInput = document.getElementById('history-patient-id');
  const resultsContainer = document.getElementById('history-results');

  if (!modal || !toggleBtn || !closeBtn || !searchBtn) return;

  toggleBtn.addEventListener('click', () => {
    modal.classList.add('active');
    patientIdInput.focus();
  });

  closeBtn.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });

  searchBtn.addEventListener('click', async () => {
    const patientId = patientIdInput.value.trim();
    if (!patientId) {
      resultsContainer.innerHTML = `<div class="empty-state" style="color: var(--accent);">Please enter a valid Patient ID.</div>`;
      return;
    }

    resultsContainer.innerHTML = `<div class="empty-state">Searching history...</div>`;

    try {
      const response = await fetch(`/api/chat/history/${encodeURIComponent(patientId)}`);
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();

      if (data.length === 0) {
        resultsContainer.innerHTML = `<div class="empty-state">No appointments found for Patient ID: ${escapeHTML(patientId)}</div>`;
        return;
      }

      resultsContainer.innerHTML = data.map((app, index) => {
        const dateStr = new Date(app.timestamp).toLocaleString();
        const hasTicket = app.verdict === 'confirmed' && app.confirmedSlot && app.status !== 'cancelled';
        const ticketBtn = hasTicket 
          ? `<button type="button" class="btn download-ticket-btn" data-index="${index}" style="padding: 6px 12px; font-size: 0.78rem; border-radius: 6px; cursor: pointer;">Download PDF</button>`
          : '';

        const slotInfo = app.confirmedSlot 
          ? `${app.confirmedSlot.day} ${app.confirmedSlot.time}` 
          : (app.preferredTime || 'N/A');

        const isConfirmed = app.verdict === 'confirmed' && app.status !== 'cancelled';
        const cancelBtn = isConfirmed
          ? `<button type="button" class="btn-danger-soft cancel-appointment-btn" data-id="${app._id.toString().substring(18).toUpperCase()}" data-patient="${escapeHTML(patientId)}">Cancel Appointment</button>`
          : '';

        const appStatus = app.status || 'pending';
        let statusClass = 'status-pill-pending';
        let statusText = appStatus;
        
        if (appStatus === 'completed') {
          statusClass = 'status-pill-completed';
          statusText = app.verdict || 'confirmed';
        } else if (appStatus === 'cancelled') {
          statusClass = 'status-pill-cancelled';
          statusText = 'cancelled';
        }
        
        const statusBadgeHtml = `<span class="status-pill ${statusClass}">${escapeHTML(statusText)}</span>`;

        return `
          <div class="history-card">
            <div class="history-card-header">
              <span>ID: #${app._id.toString().substring(18).toUpperCase()}</span>
              <span>${dateStr}</span>
            </div>
            <div class="history-card-body">
              <div>Specialization: <strong style="color: var(--ink);">${escapeHTML(app.specializationRequested)}</strong></div>
              <div>Time/Slot: <strong>${escapeHTML(slotInfo)}</strong></div>
              <div>Status: ${statusBadgeHtml}</div>
              <div style="font-size: 0.8rem; color: var(--muted); margin-top: 4px;">Notes: ${escapeHTML(app.reasoning)}</div>
            </div>
            <div class="history-card-footer" style="display: flex; gap: 8px; justify-content: flex-end;">
              ${ticketBtn}
              ${cancelBtn}
            </div>
          </div>
        `;
      }).join('');

      // Bind print events to tickets
      const ticketButtons = resultsContainer.querySelectorAll('.download-ticket-btn');
      ticketButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const appIndex = parseInt(btn.dataset.index);
          const app = data[appIndex];
          const decisionObj = {
            assignedDoctor: app.assignedDoctor,
            confirmedSlot: app.confirmedSlot,
            appointmentId: app._id.toString().substring(18).toUpperCase(),
            estimatedWaitingTime: app.estimatedWaitingTime,
            reasoning: app.reasoning
          };
          downloadPDF(decisionObj);
        });
      });

      // Bind cancel event listeners
      const cancelButtons = resultsContainer.querySelectorAll('.cancel-appointment-btn');
      cancelButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
          const appVal = btn.dataset.id;
          const patVal = btn.dataset.patient;
          
          if (confirm(`Are you sure you want to cancel appointment #${appVal}?`)) {
            try {
              const cancelRes = await fetch('/api/chat/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ appointmentId: appVal, patientId: patVal })
              });
              
              const cancelData = await cancelRes.json();
              if (cancelRes.ok) {
                alert(cancelData.message || 'Appointment cancelled successfully.');
                // Re-trigger search to update UI
                searchBtn.click();
              } else {
                alert(cancelData.error || 'Failed to cancel appointment.');
              }
            } catch (err) {
              console.error('Cancellation error:', err);
              alert('Failed to connect to server for cancellation.');
            }
          }
        });
      });

    } catch (err) {
      console.error(err);
      resultsContainer.innerHTML = `<div class="empty-state" style="color: var(--accent);">Failed to load history. Please try again.</div>`;
    }
  });

  patientIdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchBtn.click();
    }
  });
}

// Parse query parameters
function checkQueryParamsAndAutoSubmit() {
  const params = new URLSearchParams(window.location.search);
  const spec = params.get('spec');
  const doc = params.get('doc');
  const day = params.get('day');
  const time = params.get('time');
  
  if (spec) {
    setTimeout(() => {
      if (doc && day && time) {
        // Direct E2E booking override shortcut
        const messageText = `Booking ${spec} on ${day} at ${time} with ${doc}`;
        const slotOverrides = {
          specialization: spec,
          timeframe: day,
          preferredTime: time,
          preferredDoctor: doc
        };
        sendMessage(messageText, slotOverrides);
      } else {
        const messageText = doc ? `I want to book ${spec} with ${doc}` : spec;
        const slotOverrides = {
          specialization: spec
        };
        if (doc) {
          slotOverrides.preferredDoctor = doc;
        }
        sendMessage(messageText, slotOverrides);
      }
    }, 600);
  }
}

/**
 * Doctor Schedules & Slots Modal Handler
 */
function initDoctorSchedulesModal() {
  const modal = document.getElementById('doctors-modal');
  const toggleBtn = document.getElementById('doctors-toggle-btn');
  const closeBtn = document.getElementById('close-doctors-btn');
  const resultsContainer = document.getElementById('doctors-results');

  if (!modal || !toggleBtn || !closeBtn || !resultsContainer) return;

  async function loadDoctors() {
    resultsContainer.innerHTML = `<div class="empty-state">Loading active doctor schedules...</div>`;
    try {
      const response = await fetch('/api/chat/doctors');
      if (!response.ok) throw new Error('Failed to load doctors');
      const doctors = await response.json();

      if (doctors.length === 0) {
        resultsContainer.innerHTML = `<div class="empty-state">No doctors currently registered.</div>`;
        return;
      }

      resultsContainer.innerHTML = doctors.map(doc => {
        const availableSlots = (doc.availableSlots || []).filter(s => !s.isBooked);
        const slotsHtml = availableSlots.length > 0
          ? availableSlots.map(s => `
              <span class="slot-badge-btn" data-doc="${escapeHTML(doc.name)}" data-spec="${escapeHTML(doc.specialization)}" data-day="${s.day}" data-time="${s.startTime}" style="display: inline-block; background: var(--teal-light, #DCEEEA); color: var(--primary); padding: 4px 8px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; margin: 2px; cursor: pointer;">
                ⏰ ${s.day} ${s.startTime}
              </span>
            `).join('')
          : `<span style="font-size: 0.8rem; color: var(--muted);">No open slots this week</span>`;

        return `
          <div class="doctor-schedule-card" style="background: var(--surface-card, #fff); border: 1px solid var(--border); border-radius: 10px; padding: 15px; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
            <div style="font-weight: 700; font-size: 1rem; color: var(--ink);">${escapeHTML(doc.name)}</div>
            <div style="font-size: 0.82rem; color: var(--primary); font-weight: 600; margin-bottom: 6px;">🩺 ${escapeHTML(doc.specialization)}</div>
            <div style="font-size: 0.8rem; color: var(--muted); margin-bottom: 10px;">
              Exp: <strong>${doc.yearsOfExperience || 5} yrs</strong> | Rating: ⭐ <strong>${doc.rating || 4.8}</strong>
            </div>
            <div style="font-size: 0.8rem; font-weight: 600; color: var(--ink); margin-bottom: 6px;">Available Slots:</div>
            <div style="margin-bottom: 10px;">${slotsHtml}</div>
          </div>
        `;
      }).join('');

      // Bind slot click to auto-book in chat
      resultsContainer.querySelectorAll('.slot-badge-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const doc = btn.dataset.doc;
          const spec = btn.dataset.spec;
          const day = btn.dataset.day;
          const time = btn.dataset.time;
          
          modal.classList.remove('active');
          const msg = `I want to book an appointment with ${doc} for ${spec} on ${day} at ${time}`;
          const overrides = {
            specialization: spec,
            preferredDoctor: doc,
            timeframe: day,
            preferredTime: time
          };
          sendMessage(msg, overrides);
        });
      });
    } catch (err) {
      console.error('[Doctor Modal] Load error:', err);
      resultsContainer.innerHTML = `<div class="empty-state" style="color: var(--accent);">Failed to load doctor schedules.</div>`;
    }
  }

  toggleBtn.addEventListener('click', () => {
    modal.classList.add('active');
    loadDoctors();
  });

  closeBtn.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
}

// Initialize on page load
window.addEventListener('load', () => {
  startSession();
  initPatientHistory();
  initDoctorSchedulesModal();
});
