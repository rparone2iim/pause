"use client";
// Cartes Leaflet + OpenStreetMap (gratuit, pas de clé API).
// Ce fichier n'est chargé QUE côté navigateur (voir maps.tsx), car Leaflet a besoin de `window`.
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import Link from "next/link";
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, useMap, useMapEvents } from "react-leaflet";
import { TYPE_LABELS } from "@/lib/constants";
import type { SpotSummary } from "@/lib/types";

type LatLng = { lat: number; lng: number };
const TONE = { warm: "#ea580c", calm: "#059669" } as const;

function Tiles() {
  return <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />;
}

function Recenter({ center, zoom }: { center: LatLng; zoom?: number }) {
  const map = useMap();
  useEffect(() => { map.setView([center.lat, center.lng], zoom ?? map.getZoom()); }, [center.lat, center.lng, zoom, map]);
  return null;
}

function FlyTo({ target }: { target: LatLng | null }) {
  const map = useMap();
  useEffect(() => { if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 17), { duration: 0.5 }); }, [target, map]);
  return null;
}

function MoveWatcher({ onMove }: { onMove: (c: LatLng) => void }) {
  useMapEvents({ moveend: (e) => { const c = e.target.getCenter(); onMove({ lat: c.lat, lng: c.lng }); } });
  return null;
}

export function ExploreMap(props: {
  center: LatLng; radius: number; spots: SpotSummary[]; selectedId: string | null;
  onSelect: (id: string) => void; onMove: (c: LatLng) => void;
}) {
  const selected = props.spots.find((s) => s.id === props.selectedId) ?? null;
  return (
    <MapContainer center={[props.center.lat, props.center.lng]} zoom={16} scrollWheelZoom>
      <Tiles />
      <Recenter center={props.center} />
      <FlyTo target={selected} />
      <MoveWatcher onMove={props.onMove} />
      <Circle center={[props.center.lat, props.center.lng]} radius={props.radius} pathOptions={{ color: "#09090b", weight: 1, dashArray: "4 6", fillOpacity: 0.03 }} />
      <CircleMarker center={[props.center.lat, props.center.lng]} radius={6} pathOptions={{ color: "#fff", weight: 2, fillColor: "#09090b", fillOpacity: 1 }} />
      {props.spots.map((s) => {
        const t = TYPE_LABELS[s.type];
        const sel = s.id === props.selectedId;
        return (
          <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={sel ? 13 : 9}
            pathOptions={{ color: "#fff", weight: 2, fillColor: TONE[t.tone], fillOpacity: 0.95 }}
            eventHandlers={{ click: () => props.onSelect(s.id) }}>
            <Popup>
              <strong>{t.emoji} {s.name}</strong><br />
              {s.walkMin} min à pied · {s.distanceM} m<br />
              <Link href={`/spots/${s.id}`}>Voir la fiche →</Link>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

export function MiniMap({ point, tone }: { point: LatLng; tone: "warm" | "calm" }) {
  return (
    <MapContainer center={[point.lat, point.lng]} zoom={17} scrollWheelZoom={false}>
      <Tiles />
      <CircleMarker center={[point.lat, point.lng]} radius={10} pathOptions={{ color: "#fff", weight: 2, fillColor: TONE[tone], fillOpacity: 1 }} />
    </MapContainer>
  );
}

function ClickToPick({ onPick }: { onPick: (c: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export function PickMap({ center, value, onPick }: { center: LatLng; value: LatLng | null; onPick: (c: LatLng) => void }) {
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={17} scrollWheelZoom>
      <Tiles />
      <Recenter center={center} zoom={17} />
      <ClickToPick onPick={onPick} />
      {value && <CircleMarker center={[value.lat, value.lng]} radius={11} pathOptions={{ color: "#fff", weight: 3, fillColor: "#ea580c", fillOpacity: 1 }} />}
    </MapContainer>
  );
}
