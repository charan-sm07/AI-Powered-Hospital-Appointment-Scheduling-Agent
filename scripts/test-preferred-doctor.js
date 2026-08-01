import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { generateAppointmentDecision, rulesBasedSchedule } from '../services/decision/engine.js';
import Patient from '../models/Patient.js';

const runTests = async () => {
  try {
    await connectDB();

    console.log('\n--- Running Preferred Doctor Scheduling Tests ---\n');

    // Get a patient
    const patient = await Patient.findOne({ patientId: 'P101' }) || new Patient({
      patientId: 'P101',
      name: 'John Miller',
      insurancePlan: 'MediCare'
    });

    // Mock two Cardiologists
    const mockDoctors = [
      {
        doctorId: 'D201',
        name: 'Dr. Elizabeth Blackwell',
        specialization: 'Cardiology',
        insurancePlansAccepted: ['MediCare'],
        rating: 4.5,
        yearsOfExperience: 10,
        availableSlots: [
          { day: 'Monday', startTime: '09:00', endTime: '10:00', isBooked: false }
        ]
      },
      {
        doctorId: 'D999',
        name: 'Dr. Jane Doe',
        specialization: 'Cardiology',
        insurancePlansAccepted: ['MediCare'],
        rating: 4.5,
        yearsOfExperience: 10,
        availableSlots: [
          { day: 'Monday', startTime: '09:00', endTime: '10:00', isBooked: false }
        ]
      }
    ];

    // CASE 1: No preferred doctor (should assign Dr. Elizabeth Blackwell by default or Jane Doe, depending on database order)
    console.log('=== Case 1: No Preferred Doctor ===');
    const req1 = {
      specialization: 'Cardiology',
      timeframe: 'Monday',
      preferredTime: '09:00',
      preferredDoctor: null
    };
    const decision1 = rulesBasedSchedule(patient, req1, mockDoctors);
    console.log('Assigned Doctor:', decision1.assignedDoctor);
    console.log('Confirmed Slot:', decision1.confirmedSlot);
    console.log('--------------------------------------------------\n');

    // CASE 2: Preferred Doctor is Dr. Jane Doe (should assign Dr. Jane Doe)
    console.log('=== Case 2: Preferred Doctor is Dr. Jane Doe ===');
    const req2 = {
      specialization: 'Cardiology',
      timeframe: 'Monday',
      preferredTime: '09:00',
      preferredDoctor: 'Dr. Jane Doe'
    };
    const decision2 = rulesBasedSchedule(patient, req2, mockDoctors);
    console.log('Assigned Doctor:', decision2.assignedDoctor);
    console.log('Confirmed Slot:', decision2.confirmedSlot);
    if (decision2.assignedDoctor === 'Dr. Jane Doe') {
      console.log('✅ Success: Correctly matched and assigned preferred doctor!');
    } else {
      console.log('❌ Failure: Did not match preferred doctor.');
    }
    console.log('--------------------------------------------------\n');

    // CASE 3: Preferred Doctor name matches partially (e.g. "Jane" or "blackwell")
    console.log('=== Case 3: Preferred Doctor partial name match ("blackwell") ===');
    const req3 = {
      specialization: 'Cardiology',
      timeframe: 'Monday',
      preferredTime: '09:00',
      preferredDoctor: 'blackwell'
    };
    const decision3 = rulesBasedSchedule(patient, req3, mockDoctors);
    console.log('Assigned Doctor:', decision3.assignedDoctor);
    console.log('Confirmed Slot:', decision3.confirmedSlot);
    if (decision3.assignedDoctor === 'Dr. Elizabeth Blackwell') {
      console.log('✅ Success: Correctly matched partial name!');
    } else {
      console.log('❌ Failure: Did not match partial name.');
    }
    console.log('--------------------------------------------------\n');

    await mongoose.disconnect();
    console.log('Disconnected from database.');
  } catch (error) {
    console.error('Error running preferred doctor tests:', error);
    process.exit(1);
  }
};

runTests();
