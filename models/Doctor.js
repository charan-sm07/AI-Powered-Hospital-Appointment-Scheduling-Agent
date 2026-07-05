import mongoose from 'mongoose';

const slotSchema = new mongoose.Schema({
  day: { type: String, required: true }, // e.g., 'Monday', 'Tuesday'
  startTime: { type: String, required: true }, // e.g., '09:00'
  endTime: { type: String, required: true }, // e.g., '10:00'
  isBooked: { type: Boolean, default: false }
});

const doctorSchema = new mongoose.Schema({
  doctorId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  specialization: { type: String, required: true }, // e.g., 'Cardiology', 'Dermatology'
  availableSlots: [slotSchema],
  insurancePlansAccepted: [{ type: String }],
  rating: { type: Number, default: 4.5 },
  yearsOfExperience: { type: Number, default: 8 },
  averageConsultationDuration: { type: Number, default: 15 } // in minutes
}, { timestamps: true });

export default mongoose.model('Doctor', doctorSchema);
