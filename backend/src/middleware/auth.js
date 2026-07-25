import jwt from 'jsonwebtoken';
import { ApiError } from './errorHandler.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, 'Login required'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, name: payload.name };
    next();
  } catch {
    next(new ApiError(401, 'Session expired — please log in again'));
  }
}
