import express from 'express';
import AppointmentRequest from '../models/AppointmentRequest.js';
import SecurityEvent from '../models/SecurityEvent.js';
import Doctor from '../models/Doctor.js';
import AuditLog from '../models/AuditLog.js';

const router = express.Router();

/**
 * GET /api/admin/requests
 * Returns all scheduling requests sorted by latest first.
 */
router.get('/requests', async (req, res) => {
  try {
    const requests = await AppointmentRequest.find({}).sort({ timestamp: -1 });
    res.status(200).json(requests);
  } catch (err) {
    console.error('[Admin API] Error fetching requests:', err);
    res.status(500).json({ error: 'Failed to retrieve appointment requests.' });
  }
});

/**
 * GET /api/admin/security-events
 * Returns all logged security alerts sorted by latest first.
 */
router.get('/security-events', async (req, res) => {
  try {
    const events = await SecurityEvent.find({}).sort({ timestamp: -1 });
    res.status(200).json(events);
  } catch (err) {
    console.error('[Admin API] Error fetching security events:', err);
    res.status(500).json({ error: 'Failed to retrieve security events.' });
  }
});

/**
 * GET /api/admin/doctors
 * Returns all doctors.
 */
router.get('/doctors', async (req, res) => {
  try {
    const doctors = await Doctor.find({});
    res.status(200).json(doctors);
  } catch (err) {
    console.error('[Admin API] Error fetching doctors:', err);
    res.status(500).json({ error: 'Failed to retrieve doctors.' });
  }
});

/**
 * GET /api/admin/audit-logs
 * Returns all security audit log events.
 */
router.get('/audit-logs', async (req, res) => {
  try {
    const logs = await AuditLog.find({}).sort({ timestamp: -1 });
    res.status(200).json(logs);
  } catch (err) {
    console.error('[Admin API] Error fetching audit logs:', err);
    res.status(500).json({ error: 'Failed to retrieve security audit logs.' });
  }
});


/**
 * POST /api/admin/toggle-slot
 * Manually blocks or releases a doctor's slot.
 */
router.post('/toggle-slot', async (req, res) => {
  const { doctorId, day, startTime, isBooked } = req.body;

  if (!doctorId || !day || !startTime) {
    return res.status(400).json({ error: 'Missing required parameters: doctorId, day, startTime.' });
  }

  try {
    const doc = await Doctor.findOne({ doctorId });
    if (!doc) {
      return res.status(404).json({ error: 'Doctor not found.' });
    }

    const slot = doc.availableSlots.find(s => s.day === day && s.startTime === startTime);
    if (!slot) {
      return res.status(404).json({ error: 'Slot not found.' });
    }

    slot.isBooked = !!isBooked;
    await doc.save();

    // Log the administrative action in the Audit Logs
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const ua = req.headers['user-agent'] || 'Unknown';
    await new AuditLog({
      username: 'admin',
      action: slot.isBooked ? 'BLOCK_DOCTOR_SLOT' : 'RELEASE_DOCTOR_SLOT',
      status: 'Success',
      ipAddress: ip,
      userAgent: ua
    }).save();

    res.status(200).json({ message: 'Slot toggled successfully.', slot });
  } catch (err) {
    console.error('[Admin API] Error toggling doctor slot:', err);
    res.status(500).json({ error: 'Failed to toggle doctor slot.' });
  }
});

export default router;
