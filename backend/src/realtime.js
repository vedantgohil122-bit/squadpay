// ============================================================
// REALTIME — thin holder for the Socket.IO server instance.
// server.js creates the actual io instance (it needs the raw HTTP
// server to attach to) and calls setIO() once at startup. Every other
// file that needs to broadcast an event just imports getIO() — this
// avoids a circular import between server.js and every controller
// that wants to emit something.
//
// Render's free tier note: WebSockets work fine on Render's free tier,
// but the free tier spins the server down after ~15 min of inactivity.
// A dropped connection just reconnects automatically (Socket.IO's
// client does this natively) after the cold start — usually 30-50s.
// The in-app notification bell and its 30s poll remain the fallback
// for anyone whose socket happened to drop at the wrong moment.
// ============================================================
let io = null;

export function setIO(instance) { io = instance; }
export function getIO() { return io; }

// Broadcasts to everyone currently viewing this squad's Treasury page.
// Silently no-ops if Socket.IO hasn't initialized (e.g. local dev
// running the API without the frontend connected) — a broadcast
// failing to send should never break the actual payment/API request
// that triggered it.
export function broadcastToSquad(squadId, event, payload) {
  if (!io) return;
  io.to(`squad:${squadId}`).emit(event, payload);
}
