"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { LocateFixed, Minus, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { distanceM } from "@/lib/geo";
import type { LatLng, Place, PlaceKind } from "@/lib/types";

/**
 * Official OpenStreetMap tiles: free, no key, no account (CARTO's light tiles now need an API key).
 * A CSS filter gives them a light, washed-out look; dark mode inverts them (see globals.css).
 */
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const ORANGE = "#ea580c";
const GREEN = "#059669";
const DARK = "#09090b";

/** Orange for "active" spots (smokers, cafés, bars), green for "calm" ones (benches, shelters, parks). */
const ACTIVE: PlaceKind[] = ["smoking", "cafe", "bar", "terrace"];
export const markerColor = (kind: PlaceKind) => (ACTIVE.includes(kind) ? ORANGE : GREEN);

const toLL = (p: LatLng): [number, number] => [p.lat, p.lng];

function Tiles() {
  return <TileLayer url={TILES} attribution={ATTRIBUTION} maxZoom={19} className="pause-tiles" />;
}

/** The user's position: a dark dot with a white ring. */
function Me({ at }: { at: LatLng }) {
  return (
    <>
      <CircleMarker center={toLL(at)} radius={13} pathOptions={{ stroke: false, fillColor: DARK, fillOpacity: 0.12 }} interactive={false} />
      <CircleMarker center={toLL(at)} radius={7} pathOptions={{ color: "#fff", weight: 3, fillColor: DARK, fillOpacity: 1 }} interactive={false} />
    </>
  );
}

function ZoomButtons({ onLocate }: { onLocate?: () => void }) {
  const map = useMap();
  return (
    <div className="absolute bottom-8 right-3 z-[1000] flex flex-col gap-2">
      {onLocate && (
        <Button variant="secondary" size="icon-lg" onClick={onLocate} aria-label="Ma position" className="rounded-full bg-background shadow-lg hover:bg-muted">
          <LocateFixed />
        </Button>
      )}
      <div className="hidden sm:flex flex-col rounded-full bg-background shadow-lg overflow-hidden">
        <Button variant="ghost" size="icon-lg" className="rounded-none" onClick={() => map.zoomIn()} aria-label="Zoomer">
          <Plus />
        </Button>
        <Button variant="ghost" size="icon-lg" className="rounded-none" onClick={() => map.zoomOut()} aria-label="Dézoomer">
          <Minus />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExploreMap: spots + radius circle + "Search this area"

interface ExploreProps {
  center: LatLng;
  radiusM: number;
  places: Place[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onLocate: () => void;
  onSearchArea: (center: LatLng) => void;
  /** Shown right under the selected spot, and follows it when the map moves. */
  selectedCard?: React.ReactNode;
  children?: React.ReactNode;
}

/** Follows the search center and fits the radius whenever one of them changes. */
function FitRadius({ center, radiusM }: { center: LatLng; radiusM: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyToBounds(L.latLng(center.lat, center.lng).toBounds(radiusM * 2), { padding: [24, 24], duration: 0.6 });
  }, [map, center.lat, center.lng, radiusM]);
  return null;
}

/** Shows "Search this area" once the map has been moved away from the search center. */
function SearchAreaButton({ center, radiusM, onSearch }: { center: LatLng; radiusM: number; onSearch: (c: LatLng) => void }) {
  const [view, setView] = useState<LatLng | null>(null);
  useMapEvents({
    moveend: (e) => {
      const c = e.target.getCenter();
      setView({ lat: c.lat, lng: c.lng });
    },
  });
  const moved = view && distanceM(view, center) > Math.max(150, radiusM * 0.3);
  if (!moved) return null;
  return (
    <div className="absolute top-16 inset-x-0 z-[1000] flex justify-center pointer-events-none">
      <Button size="sm" className="animate-pop pointer-events-auto rounded-full shadow-lg" onClick={() => onSearch(view)}>
        <Search /> Chercher dans cette zone
      </Button>
    </div>
  );
}

/** Pans just enough for the selected spot and the card under it to be fully visible. */
function KeepInView({ place }: { place?: Place }) {
  const map = useMap();
  useEffect(() => {
    if (!place) return;
    const { x: w, y: h } = map.getSize();
    const pt = map.latLngToContainerPoint(toLL(place));
    const [minX, maxX] = [160, w - 160];
    const [minY, maxY] = [80, h - 110];
    const dx = minX > maxX ? pt.x - w / 2 : pt.x < minX ? pt.x - minX : pt.x > maxX ? pt.x - maxX : 0;
    const dy = minY > maxY ? pt.y - h / 2 : pt.y < minY ? pt.y - minY : pt.y > maxY ? pt.y - maxY : 0;
    if (dx || dy) map.panBy([dx, dy]);
  }, [map, place]);
  return null;
}

export function ExploreMap({ center, radiusM, places, selectedId, onSelect, onLocate, onSearchArea, selectedCard, children }: ExploreProps) {
  const selected = places.find((p) => p.id === selectedId);
  return (
    <div className="absolute inset-0 bg-map-bg">
      <MapContainer center={toLL(center)} zoom={15} zoomControl={false} className="absolute inset-0" style={{ background: "transparent" }}>
        <Tiles />
        <Circle center={toLL(center)} radius={radiusM} pathOptions={{ color: ORANGE, weight: 1.5, dashArray: "4 6", fillColor: ORANGE, fillOpacity: 0.05 }} interactive={false} />
        {selected && <Polyline positions={[toLL(center), toLL(selected)]} pathOptions={{ color: ORANGE, weight: 3, dashArray: "2 8", lineCap: "round" }} interactive={false} />}
        {places.map((p) => (
          <CircleMarker
            key={p.id}
            center={toLL(p)}
            radius={p.id === selectedId ? 11 : 7}
            pathOptions={{
              color: p.id === selectedId ? DARK : p.source === "community" ? GREEN : "#fff",
              weight: p.id === selectedId || p.source === "community" ? 3 : 2,
              fillColor: markerColor(p.kind),
              fillOpacity: 1,
            }}
            eventHandlers={{ click: () => onSelect(p.id) }}
            bubblingMouseEvents={false}
          >
            {p.id === selectedId && selectedCard && (
              <Tooltip permanent interactive direction="bottom" offset={[0, 14]} className="pause-card-tooltip">
                {selectedCard}
              </Tooltip>
            )}
          </CircleMarker>
        ))}
        <Me at={center} />
        <FitRadius center={center} radiusM={radiusM} />
        <KeepInView place={selected} />
        <SearchAreaButton center={center} radiusM={radiusM} onSearch={onSearchArea} />
        <ZoomButtons onLocate={onLocate} />
      </MapContainer>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MiniMap: one spot (spot page)

export function MiniMap({ spot, from }: { spot: Place; from?: LatLng }) {
  const bounds = useMemo(() => {
    const b = L.latLngBounds([toLL(spot)]);
    if (from && distanceM(from, spot) < 5000) b.extend(toLL(from));
    return b;
  }, [spot, from]);
  return (
    <div className="absolute inset-0 bg-map-bg">
      <MapContainer bounds={bounds} boundsOptions={{ padding: [40, 40], maxZoom: 17 }} zoomControl={false} scrollWheelZoom={false} className="absolute inset-0" style={{ background: "transparent" }}>
        <Tiles />
        {from && distanceM(from, spot) < 5000 && (
          <>
            <Polyline positions={[toLL(from), toLL(spot)]} pathOptions={{ color: ORANGE, weight: 3, dashArray: "2 8", lineCap: "round" }} interactive={false} />
            <Me at={from} />
          </>
        )}
        <CircleMarker center={toLL(spot)} radius={11} pathOptions={{ color: "#fff", weight: 3, fillColor: markerColor(spot.kind), fillOpacity: 1 }} />
      </MapContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PickMap: click (or drag the pin) to place a new spot

const PIN = L.divIcon({
  className: "",
  iconSize: [36, 44],
  iconAnchor: [18, 42],
  html: `<div style="display:flex;flex-direction:column;align-items:center;cursor:grab"><div style="width:36px;height:36px;border-radius:9999px;background:${ORANGE};color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(0,0,0,.25);border:2px solid #fff"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg></div></div>`,
});

function ClickToPick({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function Follow({ at }: { at: LatLng }) {
  const map = useMap();
  useEffect(() => {
    if (!map.getBounds().pad(-0.1).contains(toLL(at))) map.panTo(toLL(at));
  }, [map, at]);
  return null;
}

export function PickMap({ pos, onPick, me }: { pos: LatLng; onPick: (p: LatLng) => void; me?: LatLng }) {
  const markerRef = useRef<L.Marker>(null);
  return (
    <div className="absolute inset-0 bg-map-bg">
      <MapContainer center={toLL(pos)} zoom={17} zoomControl={false} className="absolute inset-0" style={{ background: "transparent" }}>
        <Tiles />
        {me && <Me at={me} />}
        <Marker
          ref={markerRef}
          position={toLL(pos)}
          icon={PIN}
          draggable
          title="Emplacement du spot : fais-le glisser, ou clique sur la carte"
          alt="Emplacement du spot"
          eventHandlers={{
            dragend: () => {
              const ll = markerRef.current?.getLatLng();
              if (ll) onPick({ lat: ll.lat, lng: ll.lng });
            },
          }}
        />
        <ClickToPick onPick={onPick} />
        <Follow at={pos} />
        <ZoomButtons />
      </MapContainer>
    </div>
  );
}
