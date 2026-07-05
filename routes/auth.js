import express from 'express';
import crypto from 'crypto';
import User from '../models/User.js';
import Session from '../models/Session.js';
import AuditLog from '../models/AuditLog.js';

const router = express.Router();

// Helper to extract IP and User-Agent
function getRequestMetadata(req) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const ua = req.headers['user-agent'] || 'Unknown';
  return { ip, ua };
}

/**
 * POST /api/auth/login
 * Handles secure login with rate limiting and timing attack resistance.
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const { ip, ua } = getRequestMetadata(req);

  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return res.status(401).json({ error: 'Invalid username or password. Please try again.' });
  }

  try {
    const user = await User.findOne({ username: username.trim() });

    // Timing-attack prevention: run a dummy hash if user does not exist
    if (!user) {
      crypto.pbkdf2Sync('dummy_password', 'dummy_salt', 10000, 64, 'sha512');
      
      // Log failed attempt for audit log
      await new AuditLog({
        username: username,
        action: 'LOGIN',
        status: 'Failed',
        ipAddress: ip,
        userAgent: ua
      }).save();

      return res.status(401).json({ error: 'Invalid username or password. Please try again.' });
    }

    // Check Lockout
    if (user.lockoutUntil && user.lockoutUntil > Date.now()) {
      const remainingMs = user.lockoutUntil - Date.now();
      const remainingMins = Math.ceil(remainingMs / 60000);
      
      await new AuditLog({
        username: user.username,
        action: 'LOGIN_ATTEMPT_LOCKED',
        status: 'Failed',
        ipAddress: ip,
        userAgent: ua
      }).save();

      return res.status(401).json({ 
        error: `Account is temporarily locked. Please try again in ${remainingMins} minute(s).` 
      });
    }

    // Verify Password
    const isValid = user.verifyPassword(password);

    if (isValid) {
      // Reset lock details
      user.failedLoginAttempts = 0;
      user.lockoutUntil = undefined;
      user.lastLogin = new Date();
      await user.save();

      // Session Rotation: Destroy old sessions for this user
      await Session.deleteMany({ userId: user._id });

      // Create new session ID
      const sessionId = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      await new Session({
        sessionId,
        userId: user._id,
        expiresAt,
        lastActivity: new Date()
      }).save();

      // Write Audit Log
      await new AuditLog({
        username: user.username,
        action: 'LOGIN',
        status: 'Success',
        ipAddress: ip,
        userAgent: ua,
        sessionId
      }).save();

      // Set cookie
      res.cookie('session_id', sessionId, {
        httpOnly: true,
        secure: false, // Set to true if running on HTTPS
        sameSite: 'Strict',
        maxAge: 30 * 60 * 1000 // 30 mins
      });

      return res.status(200).json({
        message: 'Authentication Successful',
        username: user.username
      });
    } else {
      // Increment failures
      user.failedLoginAttempts += 1;
      
      let isLocked = false;
      if (user.failedLoginAttempts >= 5) {
        user.lockoutUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins lock
        isLocked = true;
      }
      await user.save();

      // Write Audit Log
      await new AuditLog({
        username: user.username,
        action: isLocked ? 'LOCKOUT' : 'LOGIN',
        status: 'Failed',
        ipAddress: ip,
        userAgent: ua
      }).save();

      if (isLocked) {
        return res.status(401).json({ 
          error: 'Account is temporarily locked due to 5 failed attempts. Please try again in 15 minutes.' 
        });
      }

      return res.status(401).json({ error: 'Invalid username or password. Please try again.' });
    }
  } catch (err) {
    console.error('[Auth Route] Error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * POST /api/auth/logout
 * Securely terminates sessions.
 */
router.post('/logout', async (req, res) => {
  const sessionId = req.cookies?.session_id || req.headers['x-session-id'];
  const { ip, ua } = getRequestMetadata(req);

  if (!sessionId) {
    return res.status(200).json({ message: 'Already logged out.' });
  }

  try {
    const session = await Session.findOne({ sessionId }).populate('userId');
    if (session) {
      await new AuditLog({
        username: session.userId?.username || 'unknown',
        action: 'LOGOUT',
        status: 'Success',
        ipAddress: ip,
        userAgent: ua,
        sessionId
      }).save();

      await Session.deleteOne({ sessionId });
    }
  } catch (err) {
    console.error('[Auth Route] Logout error:', err);
  }

  res.clearCookie('session_id');
  return res.status(200).json({ message: 'Successfully logged out.' });
});

/**
 * GET /api/auth/status
 * Check if the active browser session is valid.
 */
router.get('/status', async (req, res) => {
  const sessionId = req.cookies?.session_id;

  if (!sessionId) {
    return res.status(200).json({ loggedIn: false });
  }

  try {
    const session = await Session.findOne({ sessionId }).populate('userId');
    if (!session || session.expiresAt < new Date()) {
      if (session) await Session.deleteOne({ sessionId });
      return res.status(200).json({ loggedIn: false });
    }

    // Session is valid
    return res.status(200).json({
      loggedIn: true,
      username: session.userId.username,
      lastLogin: session.userId.lastLogin
    });
  } catch (err) {
    return res.status(200).json({ loggedIn: false });
  }
});

export default router;
