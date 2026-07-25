import { Router } from 'express';
import {
  register, verifyRegisterOtp,
  login, verifyLoginOtp,
  resendOtp,
  forgotPassword, resetPassword,
  me, updateProfile, uploadAvatar, avatarUpload,
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();

// Registration: 2-step (request OTP -> verify OTP + create account)
r.post('/register', register);
r.post('/register/verify', verifyRegisterOtp);

// Login: 2-step (verify password + request OTP -> verify OTP + get token)
r.post('/login', login);
r.post('/login/verify', verifyLoginOtp);

r.post('/otp/resend', resendOtp);

// Forgot password flow
r.post('/forgot-password', forgotPassword);
r.post('/reset-password', resetPassword);

r.get('/me', requireAuth, me);
r.patch('/profile', requireAuth, updateProfile);
r.post('/avatar', requireAuth, avatarUpload.single('avatar'), uploadAvatar);

export default r;
