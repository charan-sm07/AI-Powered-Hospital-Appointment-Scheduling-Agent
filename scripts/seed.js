import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Doctor from '../models/Doctor.js';
import Patient from '../models/Patient.js';

const seedDatabase = async () => {
  try {
    await connectDB();

    // Clear existing data
    await Doctor.deleteMany({});
    await Patient.deleteMany({});
    console.log('[Seed] Cleared existing Doctors and Patients collections.');

    // 6 Mock Doctors
    const doctors = [
      {
        doctorId: 'D201',
        name: 'Dr. Elizabeth Blackwell',
        specialization: 'Cardiology',
        insurancePlansAccepted: ['MediCare', 'ShieldCross'],
        rating: 4.8,
        yearsOfExperience: 15,
        averageConsultationDuration: 20,
        availableSlots: [
          { day: 'Monday', startTime: '09:00', endTime: '10:00', isBooked: false },
          { day: 'Monday', startTime: '10:00', endTime: '11:00', isBooked: false },
          { day: 'Wednesday', startTime: '14:00', endTime: '15:00', isBooked: false }
        ]
      },
      {
        doctorId: 'D202',
        name: 'Dr. Charles Drew',
        specialization: 'Dermatology',
        insurancePlansAccepted: ['ShieldCross', 'CareFirst'],
        rating: 4.6,
        yearsOfExperience: 10,
        averageConsultationDuration: 15,
        availableSlots: [
          { day: 'Tuesday', startTime: '10:00', endTime: '11:00', isBooked: false },
          { day: 'Tuesday', startTime: '11:00', endTime: '12:00', isBooked: false },
          { day: 'Thursday', startTime: '15:00', endTime: '16:00', isBooked: false }
        ]
      },
      {
        doctorId: 'D203',
        name: 'Dr. Virginia Apgar',
        specialization: 'Pediatrics',
        insurancePlansAccepted: ['CareFirst', 'MediCare'],
        rating: 4.9,
        yearsOfExperience: 18,
        averageConsultationDuration: 20,
        availableSlots: [
          { day: 'Monday', startTime: '13:00', endTime: '14:00', isBooked: false },
          { day: 'Wednesday', startTime: '09:00', endTime: '10:00', isBooked: false },
          { day: 'Wednesday', startTime: '10:00', endTime: '11:00', isBooked: false }
        ]
      },
      {
        doctorId: 'D204',
        name: 'Dr. Jonas Salk',
        specialization: 'General Medicine',
        insurancePlansAccepted: ['MediCare', 'ShieldCross', 'CareFirst'],
        rating: 4.7,
        yearsOfExperience: 12,
        averageConsultationDuration: 15,
        availableSlots: [
          { day: 'Monday', startTime: '08:00', endTime: '09:00', isBooked: false },
          { day: 'Wednesday', startTime: '11:00', endTime: '12:00', isBooked: false },
          { day: 'Friday', startTime: '09:00', endTime: '10:00', isBooked: false },
          { day: 'Friday', startTime: '10:00', endTime: '11:00', isBooked: false }
        ]
      },
      {
        doctorId: 'D205',
        name: 'Dr. Daniel Hale Williams',
        specialization: 'Orthopedics',
        insurancePlansAccepted: ['ShieldCross'],
        rating: 4.5,
        yearsOfExperience: 9,
        averageConsultationDuration: 30,
        availableSlots: [
          { day: 'Thursday', startTime: '09:00', endTime: '10:00', isBooked: false },
          { day: 'Thursday', startTime: '10:00', endTime: '11:00', isBooked: false },
          { day: 'Friday', startTime: '14:00', endTime: '15:00', isBooked: false }
        ]
      },
      {
        doctorId: 'D206',
        name: 'Dr. Helen Taussig',
        specialization: 'ENT',
        insurancePlansAccepted: ['MediCare', 'CareFirst'],
        rating: 4.4,
        yearsOfExperience: 7,
        averageConsultationDuration: 15,
        availableSlots: [
          { day: 'Tuesday', startTime: '14:00', endTime: '15:00', isBooked: false },
          { day: 'Thursday', startTime: '11:00', endTime: '12:00', isBooked: false }
        ]
      }
    ];

    // 5 Mock Patients
    const patients = [
      {
        patientId: 'P101',
        name: 'John Doe',
        isExisting: true,
        insurancePlan: 'MediCare',
        visitHistory: [
          { date: new Date('2026-01-15T10:00:00Z'), specialization: 'General Medicine' }
        ]
      },
      {
        patientId: 'P102',
        name: 'Jane Smith',
        isExisting: true,
        insurancePlan: 'ShieldCross',
        visitHistory: [
          { date: new Date('2026-03-22T14:00:00Z'), specialization: 'Dermatology' }
        ]
      },
      {
        patientId: 'P103',
        name: 'Bob Johnson',
        isExisting: false,
        insurancePlan: 'CareFirst',
        visitHistory: []
      },
      {
        patientId: 'P104',
        name: 'Alice Williams',
        isExisting: true,
        insurancePlan: 'None',
        visitHistory: [
          { date: new Date('2025-11-05T09:30:00Z'), specialization: 'Pediatrics' }
        ]
      },
      {
        patientId: 'P105',
        name: 'Charlie Brown',
        isExisting: false,
        insurancePlan: 'ShieldCross',
        visitHistory: []
      }
    ];

    await Doctor.insertMany(doctors);
    console.log(`[Seed] Successfully inserted ${doctors.length} doctors.`);

    await Patient.insertMany(patients);
    console.log(`[Seed] Successfully inserted ${patients.length} patients.`);

    await mongoose.disconnect();
    console.log('[Seed] Database seeding complete and connection closed.');
  } catch (error) {
    console.error(`[Seed] Critical error: ${error.message}`);
    process.exit(1);
  }
};

seedDatabase();
