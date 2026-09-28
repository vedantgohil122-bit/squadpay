import { io, Socket } from 'socket.io-client';
import { BASE } from './api';

let socket: Socket | null = null;

// One shared connection for the whole app, created lazily on first use and
// reused everywhere — pages join/leave specific squad "rooms" on top of
// this rather than each opening their own connection. Auth is the same
// JWT used for every other API call, sent once at handshake time.
export function getSocket(): Socket {
  if (socket) return socket;
  const token = localStorage.getItem('squadpay_token');
  const origin = BASE.replace(/\/api\/?$/, '');
  socket = io(origin, { auth: { token }, transports: ['websocket', 'polling'] });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
