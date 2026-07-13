import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Doctor from '../models/Doctor.js';
import AppointmentRequest from '../models/AppointmentRequest.js';

async function runCancellationTest() {
  try {
    await connectDB();
    console.log('\n--- Running Appointment Cancellation and Slot Release Tests ---\n');

    // 1. Prepare dummy doctor
    const doctorName = 'Test Cancellation Doctor';
    const specialization = 'Cardiology';
    
    // Clean up any previous test data
    await Doctor.deleteOne({ name: doctorName });
    
    const testDoctor = new Doctor({
      doctorId: 'DOC_TEST_CANCEL',
      name: doctorName,
      specialization: specialization,
      availableSlots: [
        { day: 'Monday', startTime: '09:00', endTime: '10:00', isBooked: true }
      ],
      maxDailyAppointments: 5,
      currentDailyAppointments: 1,
      hospitalAffiliation: 'MediSlot Main Campus'
    });
    await testDoctor.save();
    console.log(`[Setup] Created test doctor: ${doctorName} with a booked slot on Monday 09:00.`);

    // 2. Prepare dummy appointment request
    const patientId = 'P999_TEST';
    
    // Clean up any previous test appointments
    await AppointmentRequest.deleteMany({ patientId });

    const testAppointment = new AppointmentRequest({
      patientId: patientId,
      specializationRequested: specialization,
      preferredTime: 'Morning',
      timeframe: 'Monday',
      verdict: 'confirmed',
      status: 'completed',
      assignedDoctor: doctorName,
      confirmedSlot: {
        day: 'Monday',
        time: '09:00-10:00'
      },
      reasoning: 'Test appointment slot cancellation verification.',
      smartNotifications: []
    });
    await testAppointment.save();
    
    const shortId = testAppointment._id.toString().substring(18).toUpperCase();
    console.log(`[Setup] Created test appointment request ID: #${shortId} for Patient: ${patientId}`);

    // 3. Simulate Cancellation Logic
    console.log('\n[Action] Triggering cancellation logic...');
    
    // Find requests for patient
    const requests = await AppointmentRequest.find({ patientId });
    
    // Find by short ID
    const appointmentToCancel = requests.find(
      r => r._id.toString().substring(18).toUpperCase() === shortId
    );

    if (!appointmentToCancel) {
      throw new Error('Appointment request not found using short ID matching!');
    }

    // Cancel appointment
    appointmentToCancel.status = 'cancelled';
    await appointmentToCancel.save();
    console.log(`[Result] Updated appointment status to 'cancelled'.`);

    // Release slot
    if (appointmentToCancel.assignedDoctor && appointmentToCancel.confirmedSlot) {
      const doc = await Doctor.findOne({
        name: appointmentToCancel.assignedDoctor,
        specialization: appointmentToCancel.specializationRequested
      });

      if (doc) {
        const startTime = appointmentToCancel.confirmedSlot.time.split('-')[0];
        const slot = doc.availableSlots.find(
          s => s.day === appointmentToCancel.confirmedSlot.day && s.startTime === startTime
        );

        if (slot) {
          slot.isBooked = false;
          await doc.save();
          console.log(`[Result] Released slot on ${slot.day} at ${slot.startTime} for doctor ${doc.name}.`);
        } else {
          throw new Error('Slot was not found on the doctor record!');
        }
      } else {
        throw new Error('Doctor was not found!');
      }
    }

    // 4. Verify Database state
    const updatedAppointment = await AppointmentRequest.findById(testAppointment._id);
    const updatedDoctor = await Doctor.findOne({ name: doctorName });
    const updatedSlot = updatedDoctor.availableSlots[0];

    console.log('\n--- VERIFICATION ASSERTIONS ---');
    console.log(`Appointment Status Updated: ${updatedAppointment.status === 'cancelled' ? 'PASS ✅' : 'FAIL ❌'} (${updatedAppointment.status})`);
    console.log(`Doctor Slot isBooked Status: ${updatedSlot.isBooked === false ? 'PASS ✅' : 'FAIL ❌'} (isBooked: ${updatedSlot.isBooked})`);

    // 5. Clean up test data
    await Doctor.deleteOne({ name: doctorName });
    await AppointmentRequest.deleteMany({ patientId });
    console.log('\n[Cleanup] Cleaned up temporary test data.');

    await mongoose.disconnect();
    console.log('Disconnected from database.');
  } catch (error) {
    console.error('Error running cancellation test:', error);
    process.exit(1);
  }
}

runCancellationTest();
