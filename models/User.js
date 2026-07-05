import crypto from 'crypto';
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  salt: { type: String, required: true },
  role: { type: String, default: 'admin' },
  lastLogin: { type: Date },
  failedLoginAttempts: { type: Number, default: 0 },
  lockoutUntil: { type: Date }
});

userSchema.methods.verifyPassword = function(password) {
  const hash = crypto.pbkdf2Sync(password, this.salt, 10000, 64, 'sha512').toString('hex');
  return this.passwordHash === hash;
};

userSchema.statics.hashPassword = function(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { salt, hash };
};

const User = mongoose.model('User', userSchema);
export default User;
