// Razorpay Checkout ships as a script tag, not an npm package. Loaded
// lazily (only when someone actually taps "Pay") rather than on every
// page load, since most visits never touch a payment screen.
let loading: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if ((window as any).Razorpay) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Razorpay load nahi hua — internet check karo'));
    document.body.appendChild(script);
  });
  return loading;
}

export interface RazorpayCheckoutResult {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

// Opens the checkout modal. The promise resolves with the client-side
// success payload — which, per the payment flow's own rules, is NOT proof
// of payment on its own. The caller still has to wait for the backend
// webhook (via the "verifying..." step + socket update) before treating
// the money as actually received.
export async function openRazorpayCheckout(opts: {
  keyId: string; amount: number; orderId: string; name?: string; description?: string;
  prefillName?: string; prefillEmail?: string;
}): Promise<RazorpayCheckoutResult> {
  await loadRazorpayScript();
  return new Promise((resolve, reject) => {
    const rzp = new (window as any).Razorpay({
      key: opts.keyId,
      amount: opts.amount,
      currency: 'INR',
      name: opts.name || 'SquadPay',
      description: opts.description || 'Treasury contribution',
      order_id: opts.orderId,
      prefill: { name: opts.prefillName, email: opts.prefillEmail },
      theme: { color: '#f5a623' },
      handler: (response: RazorpayCheckoutResult) => resolve(response),
      modal: { ondismiss: () => reject(new Error('cancelled')) },
    });
    rzp.on('payment.failed', () => reject(new Error('Payment fail ho gaya')));
    rzp.open();
  });
}
