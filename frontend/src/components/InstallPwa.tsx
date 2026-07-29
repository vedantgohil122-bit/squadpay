import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone, Monitor, Apple } from 'lucide-react';

export function InstallPwaBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<'windows' | 'mac' | 'android' | 'ios' | 'other'>('other');

  useEffect(() => {
    // Detect platform
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('android')) setPlatform('android');
    else if (ua.includes('iphone') || ua.includes('ipad')) setPlatform('ios');
    else if (ua.includes('mac')) setPlatform('mac');
    else if (ua.includes('win')) setPlatform('windows');

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const dismissed = localStorage.getItem('squadpay_install_dismissed');
      const last = dismissed ? parseInt(dismissed) : 0;
      if (Date.now() - last > 7 * 24 * 60 * 60 * 1000) setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS manual prompt after 10s if not installed
    if (platform === 'ios' && !(window.navigator as any).standalone) {
      const timer = setTimeout(() => {
        const dismissed = localStorage.getItem('squadpay_install_dismissed');
        if (!dismissed) setShow(true);
      }, 8000);
      return () => clearTimeout(timer);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [platform]);

  if (!show) return null;

  const install = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setShow(false);
      setDeferredPrompt(null);
    } else {
      // iOS instruction
      setShow(false);
      alert(
        platform === 'ios'
          ? 'iOS pe install karne ke liye: Safari mein Share button dabao -> Add to Home Screen'
          : 'Browser menu se Install / Add to Home Screen select karo'
      );
    }
  };

  const dismiss = () => {
    localStorage.setItem('squadpay_install_dismissed', Date.now().toString());
    setShow(false);
  };

  const Icon = platform === 'windows' ? Monitor : platform === 'mac' ? Monitor : platform === 'android' ? Smartphone : Apple;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-20 left-4 right-4 z-40 mx-auto max-w-md rounded-2xl p-4 shadow-2xl sm:bottom-6"
        style={{ background: 'var(--card)', border: '2px solid var(--marigold)', boxShadow: '4px 4px 0 var(--marigold)' }}
      >
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(245,166,35,0.15)' }}>
            <Icon className="h-5 w-5" style={{ color: 'var(--marigold)' }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display font-extrabold text-sm" style={{ color: 'var(--text)' }}>
              {platform === 'android' ? 'Android pe install karo 📱' : platform === 'windows' ? 'Windows pe install karo 💻' : platform === 'mac' ? 'Mac pe install karo 🍎' : 'SquadPay install karo 🚀'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
              {platform === 'android'
                ? 'Home screen se instant access, offline bhi kaam karega'
                : platform === 'ios'
                ? 'Safari Share -> Add to Home Screen'
                : 'Desktop app jaisa experience, offline support ke saath'}
            </p>
          </div>
          <button onClick={dismiss} className="shrink-0 p-1" style={{ color: 'var(--text-faint)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={install} className="bbtn flex-1 justify-center gap-2 text-xs py-2">
            <Download className="h-4 w-4" /> Install Karo
          </button>
          <button onClick={dismiss} className="bbtn bbtn-ghost px-4 py-2 text-xs">
            Baad mein
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
