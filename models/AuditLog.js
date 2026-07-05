import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  username: { type: String, required: true, index: true },
  action: { type: String, required: true },
  status: { type: String, enum: ['Success', 'Failed'], required: true },
  ipAddress: { type: String },
  userAgent: { type: String },
  timestamp: { type: Date, default: Date.now },
  sessionId: { type: String }
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
