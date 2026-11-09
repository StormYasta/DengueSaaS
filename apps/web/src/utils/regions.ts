import type { Position } from 'geojson';
import type { RegionCollection, Station } from '../services/api';

function insideRing(lon: number, lat: number, coordinates: Position[]) {
  let inside = false;
  for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
    const [ax, ay] = coordinates[i];
    const [bx, by] = coordinates[j];
    const intersects = (ay > lat) !== (by > lat)
      && lon < ((bx - ax) * (lat - ay)) / (by - ay) + ax;
    if (intersects) inside = !inside;
  }
  return inside;
}

function insidePolygon(lon: number, lat: number, rings: Position[][]) {
  return rings.length > 0 && insideRing(lon, lat, rings[0])
    && rings.slice(1).every((hole) => !insideRing(lon, lat, hole));
}

export function belongsToRegion(station: Station, regions: RegionCollection | null, name: string) {
  if (!regions || typeof station.longitude !== 'number' || typeof station.latitude !== 'number') return false;
  const lon = station.longitude;
  const lat = station.latitude;
  return regions.features.some((feature) => {
    if (feature.properties.name !== name) return false;
    const geometry = feature.geometry;
    if (geometry.type === 'Polygon') return insidePolygon(lon, lat, geometry.coordinates);
    if (geometry.type === 'MultiPolygon') {
      return geometry.coordinates.some((polygon) => insidePolygon(lon, lat, polygon));
    }
    return false;
  });
}
