import type { Map as MapLibreMap, ExpressionSpecification } from 'maplibre-gl';

/** OpenFreeMap's "liberty" vector style: free, no key. Its layers are recolored per theme below. */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export type PinMapTheme = 'dark' | 'light';

const SAT_LAYER = 'satellite';
// Esri World Imagery: free to load, no key. Check Esri's terms before relying on it in production; swap the URL to move to another provider.
const SAT_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

/** Adds the imagery layer, hidden, just under the first label so names, POIs and the pin still sit on top (a hybrid view). */
export function addSatellite(map: MapLibreMap) {
  if (map.getSource(SAT_LAYER)) return;
  map.addSource(SAT_LAYER, { type: 'raster', tiles: [SAT_TILES], tileSize: 256, maxzoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' });
  // Above every fill, line and extrusion (some labels sit between them in this style, so "first label" is too low), below the rest of the labels.
  const layers = map.getStyle().layers;
  const lastShape = layers.findLastIndex((l) => l.type !== 'symbol');
  map.addLayer({ id: SAT_LAYER, type: 'raster', source: SAT_LAYER, layout: { visibility: 'none' } }, layers[lastShape + 1]?.id);
}

export const setSatellite = (map: MapLibreMap, on: boolean) => map.setLayoutProperty(SAT_LAYER, 'visibility', on ? 'visible' : 'none');

interface Palette {
  land: string;
  water: string;
  green: string;
  building: string;
  road: string;
  roadMajor: string;
  casing: string;
  path: string;
  boundary: string;
  text: string;
  halo: string;
  /** Points of interest: their names, and how loud their icons are. */
  poi: string;
  poiIcon: number;
}

const PALETTES: Record<PinMapTheme, Palette> = {
  dark: {
    land: '#1b1714', water: '#16222b', green: '#1f2420', building: '#352d27',
    road: '#3a332d', roadMajor: '#4d433a', casing: '#12100d', path: '#2f2924', boundary: '#4a4038',
    text: '#8f857b', halo: '#1b1714', poi: '#f0a67c', poiIcon: 0.85,
  },
  light: {
    land: '#f4f1ec', water: '#cfe0e8', green: '#e3e9dc', building: '#dfd7ca',
    road: '#ffffff', roadMajor: '#ffffff', casing: '#dcd5cb', path: '#e4ded5', boundary: '#cfc6ba',
    text: '#6e655c', halo: '#f4f1ec', poi: '#c2410c', poiIcon: 1,
  },
};

/** The only places worth a label when someone is placing a restaurant: where people eat, bank, pray, sleep or get treated. */
const POI_KEEP = ['restaurant', 'fast_food', 'cafe', 'bar', 'bank', 'hospital', 'school', 'college', 'lodging', 'place_of_worship', 'grocery', 'stadium', 'post'];

/** Maps whose POI layers already carry POI_KEEP, so a second theme pass does not stack the filter. */
const filtered = new WeakSet<MapLibreMap>();

/**
 * Recolors the loaded style in place, by layer id and type: near-monochrome land, quiet roads, no 3D, and
 * points of interest cut down to POI_KEEP with their names in the theme's accent. Safe to call again on a
 * theme or satellite change.
 */
export function themeMap(map: MapLibreMap, theme: PinMapTheme, satellite = false) {
  const c = PALETTES[theme];
  const paint = (id: string, prop: Parameters<MapLibreMap['setPaintProperty']>[1], value: Parameters<MapLibreMap['setPaintProperty']>[2]) => map.setPaintProperty(id, prop, value);
  const hide = (id: string) => map.setLayoutProperty(id, 'visibility', 'none');
  for (const { id, type } of map.getStyle().layers) {
    if (id === SAT_LAYER) continue;
    if (type === 'background') paint(id, 'background-color', c.land);
    else if (type === 'raster') hide(id);
    else if (type === 'fill-extrusion') {
      // Past zoom 14 buildings exist only as extrusions; seen from straight above they read as footprints, so the colour must stand off the land.
      paint(id, 'fill-extrusion-color', c.building);
      paint(id, 'fill-extrusion-opacity', 1);
      map.setLayoutProperty(id, 'visibility', satellite ? 'none' : 'visible'); // imagery already shows the real roofs
    }
    else if (type === 'fill') {
      if (/pattern|wetland/.test(id)) hide(id);
      else {
        const color = id === 'water' ? c.water : /park|wood|grass|pitch|cemetery/.test(id) ? c.green : id === 'building' ? c.building : c.land;
        paint(id, 'fill-color', color);
        if (id === 'park' || id === 'building') paint(id, 'fill-outline-color', color);
      }
    } else if (type === 'line') {
      const color = id.startsWith('waterway') ? c.water
        : id === 'park_outline' ? c.green
        : id.startsWith('boundary') ? c.boundary
        : id.includes('casing') ? c.casing
        : /path|pedestrian|track|rail|hatching/.test(id) ? c.path
        : /motorway|trunk|primary|secondary/.test(id) ? c.roadMajor
        : c.road;
      paint(id, 'line-color', color);
    } else if (type === 'symbol') {
      const poi = id.startsWith('poi_');
      if (map.getLayoutProperty(id, 'icon-image') && !poi && !/airport/.test(id)) paint(id, 'icon-opacity', 0); // road arrows, shields, place dots
      if (map.getLayoutProperty(id, 'text-field') === undefined) continue;
      // Over imagery the theme's greys vanish: names go white on a dark halo.
      paint(id, 'text-color', poi ? c.poi : satellite ? '#ffffff' : c.text);
      paint(id, 'text-halo-color', satellite ? 'rgb(0 0 0 / 0.75)' : c.halo);
      if (poi) {
        paint(id, 'icon-opacity', c.poiIcon);
        if (!filtered.has(map)) {
          const keep: ExpressionSpecification = ['in', ['get', 'class'], ['literal', POI_KEEP]];
          const was = map.getFilter(id) as ExpressionSpecification | undefined; // liberty's POI filters are expressions
          map.setFilter(id, was ? (['all', was, keep] as ExpressionSpecification) : keep);
        }
      }
    }
  }
  filtered.add(map); // the POI filter is added once; recoloring can repeat
}
