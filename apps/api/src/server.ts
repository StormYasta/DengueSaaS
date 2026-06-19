import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { env } from './env.js';

const app = Fastify({ logger: true });
const demoMode = process.env.DEMO_MODE === 'true';

app.register(cors, { origin: env.corsOrigin });

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({ message: 'Dados inválidos', issues: error.issues });
  }

  app.log.error(error);
  return reply.code(500).send({ message: 'Erro interno do servidor' });
});

app.get('/health', async () => ({ ok: true, service: 'dengue-saas-api', demoMode }));

if (demoMode) {
  const { demoRoutes } = await import('./routes/demo.js');
  app.register(demoRoutes, { prefix: '/api' });
  app.log.warn('API rodando em DEMO_MODE=true. Prisma e PostgreSQL não serão usados.');
} else {
  const { dashboardRoutes } = await import('./routes/dashboard.js');
  const { heartbeatRoutes } = await import('./routes/heartbeats.js');
  const { logRoutes } = await import('./routes/logs.js');
  const { stationRoutes } = await import('./routes/stations.js');

  app.register(dashboardRoutes, { prefix: '/api' });
  app.register(stationRoutes, { prefix: '/api' });
  app.register(heartbeatRoutes, { prefix: '/api' });
  app.register(logRoutes, { prefix: '/api' });
}

app.listen({ port: env.port, host: '0.0.0.0' }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
