import express from 'express';
import cors from 'cors';
import path from 'path';
import { PORT } from './config/env.js';
import { connectDB } from './config/db.js';
import chatRouter from './routes/chat.js';
import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import { authMiddleware } from './middleware/auth.js';
import User from './models/User.js';

const app = express();

// Custom Cookie Parser Middleware
app.use((req, res, next) => {
  req.cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      req.cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
    });
  }
  next();
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Guard protected files BEFORE static serving to prevent direct bypasses
app.get('/admin.html', authMiddleware, (req, res) => {
  res.sendFile(path.resolve('private/admin.html'));
});

// Serve static public assets
app.use(express.static('public'));

// Routers
app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);
app.use('/api/admin', authMiddleware, adminRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date(),
    message: 'MediSlot AI Server is running'
  });
});

// Auto-seeding default admin
const seedAdmin = async () => {
  try {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount === 0) {
      // This default administrator account is intended for local development only.
      // In production, administrators should be created securely and required to change the default password during initial setup.
      const { salt, hash } = User.hashPassword('admin123');
      await new User({
        username: 'admin',
        passwordHash: hash,
        salt,
        role: 'admin',
        lastLogin: new Date()
      }).save();
      console.log('[Database] Auto-seeded default admin user: admin / admin123');
    }
  } catch (err) {
    console.error('[Database] Failed to seed default admin:', err);
  }
};

// Start database and server
const startServer = async () => {
  await connectDB();
  await seedAdmin();
  app.listen(PORT, () => {
    console.log(`[Server] MediSlot AI running on http://localhost:${PORT}`);
  });
};

startServer().catch(err => {
  console.error('[Server] Critical failure on startup:', err);
});
