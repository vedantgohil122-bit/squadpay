// ============================================================
// EMAIL SERVICE — Brevo Transactional Email API (HTTP, not SMTP)
//
// Why HTTP instead of SMTP: Render's free tier blocks outbound
// traffic on SMTP ports (25/465/587) as of late 2025, so
// nodemailer + Gmail SMTP times out and hangs forever on Render
// specifically (works fine locally, fails silently in production —
// classic "it's not your code, it's the platform" issue). Brevo's
// API sends over plain HTTPS instead, which is never blocked.
//
// Requires BREVO_API_KEY in .env. Get one free at brevo.com ->
// Settings -> SMTP & API -> API Keys -> Generate a new API key.
// Also requires a verified sender email in Brevo (Settings -> Senders).
// ============================================================

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

const BRAND = { name: 'SquadPay', color: '#f5a623', dark: '#0e0c0a' };

function otpTemplate(code, purpose) {
  const heading = purpose === 'register' ? 'Squad mein aane ka code 🎉'
    : purpose === 'reset_password' ? 'Password reset karo 🔒'
    : 'Login confirm karo 👋';
  const sub = purpose === 'register' ? 'Ye code daal ke apna account confirm karo.'
    : purpose === 'reset_password' ? 'Ye code use karke naya password set karo.'
    : 'Ye code daal ke login complete karo.';
  return `
  <div style="background:${BRAND.dark};padding:40px 20px;font-family:Arial,sans-serif;">
    <div style="max-width:420px;margin:0 auto;background:#161310;border:2px solid ${BRAND.color};border-radius:20px;padding:32px;text-align:center;">
      <p style="color:#f5f0e8;font-size:22px;font-weight:800;margin:0 0 4px;">Squad<span style="color:${BRAND.color}">Pay</span></p>
      <h2 style="color:#f5f0e8;font-size:18px;margin:20px 0 6px;">${heading}</h2>
      <p style="color:rgba(245,240,232,0.6);font-size:13px;margin:0 0 24px;">${sub}</p>
      <div style="background:rgba(245,166,35,0.12);border:2px solid ${BRAND.color};border-radius:14px;padding:18px;margin-bottom:20px;">
        <span style="font-size:32px;font-weight:800;letter-spacing:8px;color:${BRAND.color};">${code}</span>
      </div>
      <p style="color:rgba(245,240,232,0.4);font-size:12px;margin:0;">Ye code 10 minute mein expire ho jayega. Kisi ko bhi share na karo.</p>
    </div>
  </div>`;
}

export async function sendOtpEmail(to, code, purpose) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  const subject = purpose === 'register' ? 'SquadPay — Apna account confirm karo'
    : purpose === 'reset_password' ? 'SquadPay — Password reset code'
    : 'SquadPay — Login code';

  if (!apiKey || !senderEmail) {
    console.log(`\n📧 [DEV MODE - no email sent] OTP for ${to} (${purpose}): ${code}\n`);
    return;
  }

  await sendViaBrevo(to, subject, otpTemplate(code, purpose));
}

// ── LOGIN NOTIFICATION ────────────────────────────────────────
// Fired the moment a login is fully confirmed (after OTP verify), so the
// real account owner sees "someone just logged in" in near-real-time —
// this is what actually catches a takeover in progress, as opposed to the
// OTP step which only stops one. Never blocks the login response itself;
// callers fire-and-forget this (see verifyLoginOtp in auth.controller.js).
function loginNotificationTemplate({ time, ip, device }) {
  return `
  <div style="background:${BRAND.dark};padding:40px 20px;font-family:Arial,sans-serif;">
    <div style="max-width:420px;margin:0 auto;background:#161310;border:2px solid ${BRAND.color};border-radius:20px;padding:32px;">
      <p style="color:#f5f0e8;font-size:22px;font-weight:800;margin:0 0 4px;text-align:center;">Squad<span style="color:${BRAND.color}">Pay</span></p>
      <h2 style="color:#f5f0e8;font-size:18px;margin:20px 0 6px;text-align:center;">Naya login hua 👀</h2>
      <p style="color:rgba(245,240,232,0.6);font-size:13px;margin:0 0 20px;text-align:center;">Tumhare account mein abhi login hua hai.</p>
      <div style="background:rgba(245,240,232,0.05);border:1px solid rgba(245,240,232,0.1);border-radius:14px;padding:16px;margin-bottom:20px;">
        <p style="color:rgba(245,240,232,0.5);font-size:11px;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.05em;">Time</p>
        <p style="color:#f5f0e8;font-size:13px;margin:0 0 12px;font-weight:600;">${time}</p>
        <p style="color:rgba(245,240,232,0.5);font-size:11px;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.05em;">Device</p>
        <p style="color:#f5f0e8;font-size:13px;margin:0 0 12px;font-weight:600;">${device}</p>
        <p style="color:rgba(245,240,232,0.5);font-size:11px;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.05em;">IP Address</p>
        <p style="color:#f5f0e8;font-size:13px;margin:0;font-weight:600;">${ip}</p>
      </div>
      <p style="color:rgba(245,240,232,0.4);font-size:12px;margin:0;text-align:center;">Agar ye tum nahi the, turant apna password reset karo aur humein batao.</p>
    </div>
  </div>`;
}

export async function sendLoginNotification(to, { time, ip, device }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  if (!apiKey || !senderEmail) {
    console.log(`\n🔔 [DEV MODE - no email sent] Login notification for ${to}: ${device} from ${ip} at ${time}\n`);
    return;
  }

  // Deliberately swallow errors here — a failed notification email must
  // never surface as a login failure to the user. Logged for visibility only.
  try {
    await sendViaBrevo(to, 'SquadPay — Naya login hua', loginNotificationTemplate({ time, ip, device }));
  } catch (err) {
    console.error('Login notification email failed (non-fatal):', err.message);
  }
}

// ── SHARED BREVO SEND ──────────────────────────────────────────
async function sendViaBrevo(to, subject, htmlContent) {
  const res = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: 'SquadPay', email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`Brevo send failed (${res.status}):`, errText);
    throw new Error('Email bhejne mein problem hui — thodi der baad try karo');
  }
}
