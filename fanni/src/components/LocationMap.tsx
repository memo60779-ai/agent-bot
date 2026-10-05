import { lazy, Suspense, useState } from 'react';
import { Crosshair, MapPin, Navigation, Share2, Trash2 } from 'lucide-react';
import type { LatLng } from './map/LeafletMap';
import { Button } from './ui';
import { cn, whatsappLink } from '../lib/utils';

// Leaflet (~45 KB) loads only when a map is actually shown.
const LeafletMap = lazy(() => import('./map/LeafletMap'));

/** Karbala city center — where the picker opens when GPS is unavailable. */
const KARBALA: LatLng = { lat: 32.6160, lng: 44.0330 };

export const mapsDirectionsUrl = (p: LatLng) =>
  `https://www.google.com/maps/dir/?api=1&destination=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
export const mapsPointUrl = (p: LatLng) =>
  `https://maps.google.com/?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

function MapFallback({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-gray-100', className)} />;
}

function getPosition(): Promise<LatLng | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}

/** Request wizard: drop a pin on the house. Optional, but strongly suggested. */
export function LocationPicker({ value, onChange }: { value: LatLng | null; onChange: (v: LatLng | null) => void }) {
  const [target, setTarget] = useState<LatLng | null>(value);
  const [locating, setLocating] = useState(false);
  const [gpsFailed, setGpsFailed] = useState(false);

  async function locate() {
    setLocating(true);
    const p = await getPosition();
    setLocating(false);
    setGpsFailed(!p);
    const next = p ?? target ?? KARBALA;
    setTarget(next);
    onChange(next);
  }

  if (!target) {
    return (
      <button
        type="button"
        onClick={locate}
        disabled={locating}
        className="pressable flex w-full items-center gap-3 rounded-3xl border-2 border-dashed border-accent/40 bg-accent-50 p-4 text-start"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-white">
          {locating ? <Crosshair className="h-6 w-6 animate-spin" /> : <MapPin className="h-6 w-6" />}
        </span>
        <span className="flex-1">
          <span className="block font-extrabold text-ink">{locating ? 'دنحدد موقعك…' : 'حدد البيت على الخريطة'}</span>
          <span className="block text-xs text-gray-600">حتى يوصلك الفني بدون ما يتصل ويسأل وين البيت</span>
        </span>
        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-accent">يُنصح بيه</span>
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-card">
      <Suspense fallback={<MapFallback className="h-64" />}>
        <LeafletMap mode="pick" target={target} onCenter={onChange} className="h-64" />
      </Suspense>
      <div className="space-y-2 p-3">
        <p className="text-sm font-bold text-ink">
          {gpsFailed
            ? 'ما گدرنا نحدد موقعك تلقائياً. حرّك الخريطة لحد ما يصير الدبوس فوق بيتك.'
            : 'حرّك الخريطة لحد ما يصير الدبوس فوق بيتك بالضبط.'}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={locate} loading={locating} className="flex-1">
            <Crosshair className="h-4 w-4" /> موقعي الحالي
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { setTarget(null); onChange(null); setGpsFailed(false); }}
          >
            <Trash2 className="h-4 w-4" /> إزالة
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Request details: the pinned house + directions / share actions. */
export function LocationCard({ point, title, sendToPhone }: {
  point: LatLng; title: string; sendToPhone?: string | null;
}) {
  const share = sendToPhone
    ? `${whatsappLink(sendToPhone)}?text=${encodeURIComponent(`📍 موقع البيت:\n${mapsPointUrl(point)}`)}`
    : null;
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-card">
      <a href={mapsPointUrl(point)} target="_blank" rel="noreferrer" aria-label="افتح الموقع بالخريطة" className="block">
        <Suspense fallback={<MapFallback className="h-44" />}>
          <LeafletMap mode="view" target={point} className="pointer-events-none h-44" />
        </Suspense>
      </a>
      <div className="space-y-2 p-3">
        <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <MapPin className="h-4 w-4 text-accent" /> {title}
        </p>
        <div className="flex gap-2">
          <a
            href={mapsDirectionsUrl(point)}
            target="_blank"
            rel="noreferrer"
            className="pressable flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-3 text-sm font-bold text-white"
          >
            <Navigation className="h-4 w-4" /> الاتجاهات
          </a>
          {share && (
            <a
              href={share}
              target="_blank"
              rel="noreferrer"
              className="pressable flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-3 text-sm font-bold text-emerald-700"
            >
              <Share2 className="h-4 w-4" /> دز الموقع بالواتساب
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
