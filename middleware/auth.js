import Session from '../models/Session.js';
import AuditLog from '../models/AuditLog.js';

export const authMiddleware = async (req, res, next) => {
  const sessionId = req.cookies?.session_id;

  if (!sessionId) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const ua = req.headers['user-agent'] || 'Unknown';
    
    await new AuditLog({
      username: 'anonymous',
      action: 'UNAUTHORIZED_ACCESS',
      status: 'Failed',
      ipAddress: ip,
      userAgent: ua
    }).save();

    if (req.xhr || req.path.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Unauthorized administrative access.' });
    }
    return res.redirect('/login.html');
  }

  try {
    const session = await Session.findOne({ sessionId }).populate('userId');
    if (!session || session.expiresAt < new Date()) {
      if (session) await Session.deleteOne({ sessionId });

      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      const ua = req.headers['user-agent'] || 'Unknown';

      await new AuditLog({
        username: session?.userId?.username || 'expired_session',
        action: 'SESSION_EXPIRED',
        status: 'Failed',
        ipAddress: ip,
        userAgent: ua,
        sessionId
      }).save();

      res.clearCookie('session_id');
      if (req.xhr || req.path.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
      }
      return res.redirect('/login.html');
    }

    // Session is valid. Reset activity timer and roll expiresAt by 30 mins
    session.lastActivity = new Date();
    session.expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await session.save();

    req.user = session.userId;
    req.sessionId = sessionId;
    next();
  } catch (err) {
    console.error('[Auth Middleware] Error:', err);
    if (req.xhr || req.path.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ error: 'Internal server error during authentication.' });
    }
    return res.redirect('/login.html');
  }
};
