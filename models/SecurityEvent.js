import mongoose from 'mongoose';

const securityEventSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  messageText: { type: String, required: true },
  suspicionScore: { type: Number, required: true },
  actionTaken: { type: String, required: true } // e.g. 'none', 'warned', 'quarantined'
}, { timestamps: true });

export default mongoose.model('SecurityEvent', securityEventSchema);
