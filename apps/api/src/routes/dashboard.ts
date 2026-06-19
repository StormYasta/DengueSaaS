import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { isStationOnline, secondsSince } from '../lib/health.js';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard', async () => {
    const stations = await prisma.station.findMany({ orderBy: { name: 'asc' } });

    const enriched = stations.map((station) => {
      const online = isStationOnline(station);
      return {
        ...station,
        computedStatus: online ? 'ONLINE' : 'OFFLINE',
        secondsSinceHeartbeat: secondsSince(station.lastHeartbeatAt),
        secondsSinceLastData: secondsSince(station.lastDataReceivedAt),
      };
    });

    const onlineCount = enriched.filter((station) => station.computedStatus === 'ONLINE').length;
    const offlineCount = enriched.length - onlineCount;
    const serviceProblems = enriched.filter((station) => station.serviceStatus !== 'RUNNING').length;

    return {
      summary: {
        totalStations: enriched.length,
        onlineCount,
        offlineCount,
        serviceProblems,
      },
      stations: enriched,
    };
  });
}
