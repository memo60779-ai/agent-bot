import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface LatLng { lat: number; lng: number }

export const PIN_SVG =
  '<svg viewBox="0 0 36 44" width="36" height="44" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M18 43s15-14.2 15-25.5C33 8.4 26.3 1.5 18 1.5S3 8.4 3 17.5C3 28.8 18 43 18 43z" fill="#FF7700" stroke="#fff" stroke-width="3"/>' +
  '<circle cx="18" cy="17.5" r="6" fill="#203048"/></svg>';

/**
 * OpenStreetMap via Leaflet (free, no key). Loaded lazily — see LocationMap.tsx.
 *  - mode "pick": the pin is fixed at the center and the user pans the map under it;
 *    every pan reports the new center. `target` moves the map (e.g. after GPS).
 *  - mode "view": static map with a pin at `target`.
 */
export default function LeafletMap({ target, mode, onCenter, className }: {
  target: LatLng; mode: 'pick' | 'view'; onCenter?: (c: LatLng) => void; className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const onCenterRef = useRef(onCenter);
  onCenterRef.current = onCenter;

  useEffect(() => {
    if (!el.current) return;
    const view = mode === 'view';
    const m = L.map(el.current, {
      center: [target.lat, target.lng],
      zoom: view ? 16 : 17,
      zoomControl: !view,
      dragging: !view,
      touchZoom: view ? false : 'center',
      scrollWheelZoom: view ? false : 'center',
      doubleClickZoom: view ? false : 'center',
      boxZoom: false,
      keyboard: !view,
      attributionControl: true,
    });
    m.attributionControl.setPrefix(false);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(m);
    if (view) {
      L.marker([target.lat, target.lng], {
        icon: L.divIcon({ html: PIN_SVG, className: '', iconSize: [36, 44], iconAnchor: [18, 43] }),
        interactive: false,
      }).addTo(m);
    } else {
      m.on('moveend', () => {
        const c = m.getCenter();
        onCenterRef.current?.({ lat: c.lat, lng: c.lng });
      });
    }
    map.current = m;
    // the container may still be animating in; recompute its size once it settles
    const t = window.setTimeout(() => m.invalidateSize(), 250);
    return () => { window.clearTimeout(t); m.remove(); map.current = null; };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const c = m.getCenter();
    if (Math.abs(c.lat - target.lat) > 1e-6 || Math.abs(c.lng - target.lng) > 1e-6) {
      m.setView([target.lat, target.lng], Math.max(m.getZoom(), 17));
    }
  }, [target]); // new object = explicit move request (e.g. "my location" pressed again)

  return (
    <div className={className} style={{ position: 'relative' }} dir="ltr">
      <div ref={el} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
      {mode === 'pick' && (
        <div
          style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -100%)', zIndex: 500, pointerEvents: 'none' }}
          dangerouslySetInnerHTML={{ __html: PIN_SVG }}
        />
      )}
    </div>
  );
}
