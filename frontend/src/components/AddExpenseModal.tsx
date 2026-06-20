// ============================================================
// ADD EXPENSE MODAL — shared component
// Used from SquadPage (Kharcha Likho FAB) and TripDetailPage
// (Trip Kharcha Likho FAB, pre-locks tripId so every expense
// added from inside a trip automatically tags to it)
// ============================================================
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { toPaise } from '../lib/money';
import { Button, Input, Modal, ErrorText, Avatar } from './ui';

interface Member { id: string; name: string; avatar_url?: string }
interface TripOption { id: string; name: string; emoji: string; status: string }

const CATS = ['food','travel','movies','fuel','events','shopping','stay','other'] as const;
const CE: Record<string,string> = { food:'🍕',travel:'🚕',movies:'🎬',fuel:'⛽',events:'🎉',shopping:'🛍️',stay:'🏨',other:'📦' };

export default function AddExpenseModal({
  open, onClose, squadId, members, meId, onCreated, presetTripId, presetTripLabel,
}: {
  open: boolean; onClose: () => void; squadId: string; members: Member[]; meId?: string; onCreated: () => void;
  /** When set (e.g. opened from inside a Trip page), the trip field is pre-filled and locked. */
  presetTripId?: string;
  /** Display label for the locked trip, e.g. "🏖️ Goa Trip" */
  presetTripLabel?: string;
}) {
  const [form, setForm] = useState({
    title: '', amount: '', category: 'food', paidBy: meId || '',
    splitType: 'equal' as 'equal' | 'percentage' | 'custom' | 'shares',
    treasuryAmount: '', tripId: presetTripId || '',
  });
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Only fetch the trip picker list when there's no preset (i.e. opened from Squad page)
  useEffect(() => {
    if (open && !presetTripId) {
      api<{ trips: TripOption[] }>(`/trips/squad/${squadId}`)
        .then((d) => setTrips(d.trips.filter((t) => t.status === 'active')))
        .catch(() => {});
    }
  }, [open, squadId, presetTripId]);

  useEffect(() => {
    if (open) {
      setSelected(Object.fromEntries(members.map((m) => [m.id, true])));
      setForm((f) => ({ ...f, paidBy: meId || members[0]?.id || '', tripId: presetTripId || '' }));
      setValues({}); setError('');
    }
  }, [open, members, meId, presetTripId]);

  const chosen = members.filter((m) => selected[m.id]);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const participants = chosen.map((m) => ({
        userId: m.id,
        ...(form.splitType !== 'equal' ? { value: form.splitType === 'custom' ? toPaise(values[m.id] || 0) : Number(values[m.id] || 0) } : {}),
      }));
      await api('/expenses', {
        method: 'POST',
        body: JSON.stringify({
          squadId, title: form.title, amount: toPaise(form.amount), category: form.category,
          paidBy: form.paidBy, splitType: form.splitType, participants,
          treasuryAmount: form.treasuryAmount ? toPaise(form.treasuryAmount) : 0,
          tripId: form.tripId || null,
        }),
      });
      onCreated();
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={presetTripId ? `${presetTripLabel || 'Trip'} ka kharcha 🧾` : 'Kharcha add karo 🧾'}>
      <form onSubmit={submit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <Input label="Kya tha?" placeholder="Pizza Night 🍕" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <Input label="Kitna? (₹)" type="number" step="0.01" min="0.01" placeholder="1800" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(245,240,232,0.5)' }}>Category</span>
          <div className="flex flex-wrap gap-1.5">
            {CATS.map((c) => (
              <button key={c} type="button" onClick={() => setForm({ ...form, category: c })}
                className={`rounded-xl px-3 py-2 text-xs font-bold border-2 transition active:scale-95 ${form.category === c ? 'border-marigold bg-marigold/20 text-marigold' : 'border-bone/10 bg-ink-800'}`}
                style={{ color: form.category === c ? '#f5a623' : 'rgba(245,240,232,0.7)' }}>
                {CE[c]} {c}
              </button>
            ))}
          </div>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(245,240,232,0.5)' }}>Kisne diya?</span>
          <select value={form.paidBy} onChange={(e) => setForm({ ...form, paidBy: e.target.value })} className="binput">
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(245,240,232,0.5)' }}>Split type</span>
          <div className="grid grid-cols-4 gap-1.5">
            {(['equal', 'percentage', 'shares', 'custom'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setForm({ ...form, splitType: t })}
                className={`rounded-xl py-2 text-[11px] font-bold border-2 transition active:scale-95 ${form.splitType === t ? 'border-aqua bg-aqua/20 text-aqua' : 'border-bone/10 bg-ink-800'}`}
                style={{ color: form.splitType === t ? '#00d4c8' : 'rgba(245,240,232,0.6)' }}>
                {t}
              </button>
            ))}
          </div>
        </label>

        <div className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(245,240,232,0.5)' }}>Kaun kaun mein?</span>
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <button type="button" onClick={() => setSelected({ ...selected, [m.id]: !selected[m.id] })}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-sm font-bold transition active:scale-[0.98] ${selected[m.id] ? 'border-marigold bg-marigold/10' : 'border-bone/10 bg-ink-800 opacity-50'}`}>
                  <Avatar url={m.avatar_url} name={m.name} size="h-6 w-6" />
                  <span className="truncate" style={{ color: '#f5f0e8' }}>{m.name.split(' ')[0]}</span>
                </button>
                {selected[m.id] && form.splitType !== 'equal' && (
                  <input type="number" step="any" inputMode="decimal" placeholder={form.splitType === 'percentage' ? '%' : form.splitType === 'shares' ? 'sh' : '₹'}
                    value={values[m.id] || ''} onChange={(e) => setValues({ ...values, [m.id]: e.target.value })}
                    className="binput w-20 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Trip field: locked + visible when presetTripId is set, otherwise a free picker */}
        {presetTripId ? (
          <div className="rounded-xl px-3 py-2.5 flex items-center justify-between" style={{ background: 'rgba(255,61,110,0.08)', border: '2px solid rgba(255,61,110,0.3)' }}>
            <span className="text-xs font-bold" style={{ color: 'rgba(245,240,232,0.5)' }}>🧳 Trip</span>
            <span className="text-sm font-display font-extrabold" style={{ color: '#ff3d6e' }}>{presetTripLabel}</span>
          </div>
        ) : trips.length > 0 && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(245,240,232,0.5)' }}>Trip mein add karo? (optional)</span>
            <select value={form.tripId} onChange={(e) => setForm({ ...form, tripId: e.target.value })} className="binput">
              <option value="">No trip — squad general</option>
              {trips.map((t) => <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}
            </select>
          </label>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(245,240,232,0.5)' }}>Treasury se? (₹, optional)</span>
          <input type="number" step="0.01" min="0" placeholder="0 (leave empty if not using treasury)"
            value={form.treasuryAmount} onChange={(e) => setForm({ ...form, treasuryAmount: e.target.value })}
            className="binput" />
          <p className="mt-1 text-[10px]" style={{ color: 'rgba(245,240,232,0.4)' }}>🏦 Treasury se kitna amount use hoga?</p>
        </label>

        <ErrorText msg={error} />
        <Button type="submit" disabled={busy || chosen.length === 0} className="w-full justify-center py-3">
          {busy ? 'Add ho raha hai...' : 'Kharcha Add Karo ✅'}
        </Button>
      </form>
    </Modal>
  );
}
