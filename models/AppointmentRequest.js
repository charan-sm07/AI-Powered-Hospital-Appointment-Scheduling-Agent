import mongoose from 'mongoose';

const appointmentRequestSchema = new mongoose.Schema({
  patientId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  specializationRequested: { type: String },
  preferredTime: { type: String },
  timeframe: { type: String },
  isExistingPatient: { type: Boolean },
  verdict: { type: String, enum: ['confirmed', 'alternative_suggested', 'waitlisted', 'flagged'] },
  assignedDoctor: { type: String, default: null },
  confirmedSlot: {
    day: { type: String, default: null },
    time: { type: String, default: null }
  },
  reasoning: { type: String },
  policyReferences: [{ type: String }],
  status: { type: String, default: 'pending' }, // e.g. 'pending', 'completed', 'quarantined'
  estimatedWaitingTime: { type: Number, default: 0 },
  conversationSummary: {
    symptoms: { type: String, default: '' },
    detectedDepartment: { type: String, default: '' },
    doctorSelected: { type: String, default: '' },
    reasoning: { type: String, default: '' }
  },
  smartNotifications: {
    email: { type: String, default: '' },
    sms: { type: String, default: '' },
    whatsapp: { type: String, default: '' }
  }
}, { timestamps: true });

export default mongoose.model('AppointmentRequest', appointmentRequestSchema);
