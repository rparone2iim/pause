// MapLibre draws the map in a Web Worker. Its 2 files are served by our own site (/maplibre/), copied from the
// package at each dev/build so they always match the installed version (no third-party script, CSP stays 'self').
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public/maplibre", { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(`node_modules/maplibre-gl/dist/${f}`, `public/maplibre/${f}`);
