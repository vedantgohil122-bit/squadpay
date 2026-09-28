// ============================================================
// CENTRAL ERROR HANDLING
// One place where every error lands — no scattered try/catch
// chaos. Routes just `throw` and this catches.
// ============================================================

// Custom error with an HTTP status attached
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// 404 — route does not exist
export function notFound(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// Final catcher
export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const message = status === 500 ? 'Something went wrong' : err.message;

  if (status === 500) console.error('💥', err); // log real cause server-side only

  res.status(status).json({ success: false, error: message });
}
