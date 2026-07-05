import mongoose from 'mongoose';

const visitHistorySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  specialization: { type: String, required: true }
});

const patientSchema = new mongoose.Schema({
  patientId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  isExisting: { type: Boolean, default: false },
  insurancePlan: { type: String }, // e.g., 'MediCare', 'ShieldCross', 'None'
  visitHistory: [visitHistorySchema]
}, { timestamps: true });

export default mongoose.model('Patient', patientSchema);
