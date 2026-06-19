import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { env } from './env.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { heartbeatRoutes } from './routes/heartbeats.js';
import { logRoutes } from './routes/logs.js';
import { stationRoutes } from './routes/stations.js';

const app = Fastify({ logger: true });

app.register(cors, { origin: env.corsOrigin });

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({ message: 'Dados inválidos', issues: error.issues });
  }

  app.log.error(error);
  return reply.code(500).send({ message: 'Erro interno do servidor' });
});

app.get('/health', async () => ({ ok: true, service: 'dengue-saas-api' }));

app.register(dashboardRoutes, { prefix: '/api' });
app.register(stationRoutes, { prefix: '/api' });
app.register(heartbeatRoutes, { prefix: '/api' });
app.register(logRoutes, { prefix: '/api' });

app.listen({ port: env.port, host: '0.0.0.0' }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
