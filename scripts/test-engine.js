import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { generateAppointmentDecision } from '../services/decision/engine.js';
import Doctor from '../models/Doctor.js';
import Patient from '../models/Patient.js';
import { retrieve } from '../services/rag/retriever.js';

const runTests = async () => {
  try {
    await connectDB();

    console.log('\n--- Running Decision Engine Tests ---\n');

    // Fetch mock patients
    const john = await Patient.findOne({ patientId: 'P101' }); // Existing, Medicare
    const jane = await Patient.findOne({ patientId: 'P102' }); // Existing, ShieldCross
    const bob = await Patient.findOne({ patientId: 'P103' });  // New, CareFirst

    // Fetch doctors
    const doctors = await Doctor.find({});

    // ----------------------------------------------------
    // CASE 1: Doctor Available (Should confirm)
    // John requests Cardiology on Monday Morning
    // ----------------------------------------------------
    console.log('=== Test Case 1: Perfect Slot Available (Expected: confirmed) ===');
    const req1 = { specialization: 'Cardiology', timeframe: 'Monday', preferredTime: 'Morning' };
    const chunks1 = await retrieve('Cardiology booking rules', 2);
    
    // Filter matching doctors from DB
    const matchingDocs1 = doctors.filter(d => d.specialization === req1.specialization);
    const decision1 = await generateAppointmentDecision(john, req1, matchingDocs1, chunks1);
    
    console.log('Verdict:', decision1.verdict);
    console.log('Assigned Doctor:', decision1.assignedDoctor);
    console.log('Confirmed Slot:', decision1.confirmedSlot);
    console.log('Reasoning:', decision1.reasoning);
    console.log('Policy References:', decision1.policyReferences);
    console.log('--------------------------------------------------\n');

    // ----------------------------------------------------
    // CASE 2: Doctor available but slot mismatch (Expected: alternative_suggested)
    // Jane requests Dermatology on Tuesday Afternoon
    // Dr. Drew is only available Tuesday Morning (10:00-12:00) or Thursday Afternoon (15:00)
    // ----------------------------------------------------
    console.log('=== Test Case 2: Time Slot Mismatch (Expected: alternative_suggested) ===');
    const req2 = { specialization: 'Dermatology', timeframe: 'Tuesday', preferredTime: 'Afternoon' };
    const chunks2 = await retrieve('Dermatology booking rules', 2);
    const matchingDocs2 = doctors.filter(d => d.specialization === req2.specialization);
    
    const decision2 = await generateAppointmentDecision(jane, req2, matchingDocs2, chunks2);
    
    console.log('Verdict:', decision2.verdict);
    console.log('Assigned Doctor:', decision2.assignedDoctor);
    console.log('Confirmed Slot:', decision2.confirmedSlot);
    console.log('Reasoning:', decision2.reasoning);
    console.log('Policy References:', decision2.policyReferences);
    console.log('--------------------------------------------------\n');

    // ----------------------------------------------------
    // CASE 3: Fully booked/No doctor available (Expected: waitlisted)
    // Bob requests Cardiology on Friday (No cardiologist is available on Friday)
    // ----------------------------------------------------
    console.log('=== Test Case 3: Fully Booked / No Doctor on Day (Expected: waitlisted or alternative suggested if other days open) ===');
    // To guarantee waitlisted, we will pass an empty doctors array or fully booked doctors
    const req3 = { specialization: 'Cardiology', timeframe: 'Friday', preferredTime: 'Afternoon' };
    const chunks3 = await retrieve('Cardiology booking rules', 2);
    
    // We simulate doctors being fully booked by passing available slots as empty or booked
    const fullyBookedDoctors = doctors
      .filter(d => d.specialization === req3.specialization)
      .map(doc => {
        const docObj = doc.toObject();
        docObj.availableSlots = docObj.availableSlots.map(s => ({ ...s, isBooked: true }));
        return docObj;
      });

    const decision3 = await generateAppointmentDecision(bob, req3, fullyBookedDoctors, chunks3);
    
    console.log('Verdict:', decision3.verdict);
    console.log('Assigned Doctor:', decision3.assignedDoctor);
    console.log('Confirmed Slot:', decision3.confirmedSlot);
    console.log('Reasoning:', decision3.reasoning);
    console.log('Policy References:', decision3.policyReferences);
    console.log('--------------------------------------------------\n');

    await mongoose.disconnect();
    console.log('Disconnected from database.');
  } catch (error) {
    console.error('Error running decision engine tests:', error);
    process.exit(1);
  }
};

runTests();
