import { Station } from '@prisma/client';
import { env } from '../env.js';

export function isStationOnline(station: Pick<Station, 'lastHeartbeatAt'>): boolean {
  if (!station.lastHeartbeatAt) return false;

  const diffMs = Date.now() - station.lastHeartbeatAt.getTime();
  return diffMs <= env.offlineAfterSeconds * 1000;
}

export function secondsSince(date?: Date | null): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
}
