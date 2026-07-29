import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { useOffline } from '../hooks/useOffline';

export function OfflineBanner() {
  const { isOnline, queueCount, isSyncing } = useOffline();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold"
          style={{ background: '#ff3d6e', color: 'white' }}
        >
          <WifiOff className="h-4 w-4" />
          Offline ho — changes queue mein save ho rahe hain {queueCount > 0 && `(${queueCount})`}
        </motion.div>
      )}
      {isOnline && queueCount > 0 && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold"
          style={{ background: '#f5a623', color: '#0e0c0a' }}
        >
          {isSyncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
          {isSyncing ? `Sync ho raha hai... ${queueCount} pending` : `${queueCount} changes sync pending — online ho to auto-sync hoga`}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
