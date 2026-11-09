import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AdminUser } from '@prisma/client';
import { prisma } from './prisma.js';
import { env } from '../env.js';

declare module 'fastify' {
  interface FastifyRequest {
    adminUser?: AdminUser;
  }
}

const COOKIE = 'dengue_session';
const SESSION_MS = 8 * 60 * 60 * 1000;
const attempts = new Map<string, { count: number; reset: number }>();

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, hash: string) {
  const [algorithm, salt, encoded] = hash.split(':');
  if (algorithm !== 'scrypt' || !salt || !encoded) return false;
  const expected = Buffer.from(encoded, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function equalSecrets(actual: unknown, expected: string) {
  if (typeof actual !== 'string' || !expected) return false;
  const a = createHash('sha256').update(actual).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function bootstrapAdmin() {
  const userCount = await prisma.adminUser.count();
  if (userCount === 0) {
    await prisma.adminUser.create({
      data: { username: 'admin', passwordHash: passwordHash('admin'), mustChangePassword: true },
    });
    console.warn('[SECURITY] Acesso inicial admin/admin criado. Troca de senha obrigatória antes de usar o painel.');
  }
}

export function limitLogin(ip: string) {
  const now = Date.now();
  if (attempts.size > 5000) attempts.clear();
  const entry = attempts.get(ip);
  return Boolean(entry && entry.reset > now && entry.count >= 5);
}

export function failedLogin(ip: string) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.reset < now) {
    attempts.set(ip, { count: 1, reset: now + 15 * 60_000 });
  } else {
    entry.count += 1;
  }
}

export function clearLoginFailures(ip: string) {
  attempts.delete(ip);
}

function sessionCookie(token: string, request: FastifyRequest, maxAge: number) {
  const https = request.headers['x-forwarded-proto'] === 'https';
  return `${COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${https ? '; Secure' : ''}`;
}

export async function createSession(userId: string, request: FastifyRequest, reply: FastifyReply) {
  const token = randomBytes(32).toString('hex');
  await prisma.authSession.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_MS) },
  });
  reply.header('Set-Cookie', sessionCookie(token, request, SESSION_MS / 1000));
}

function readToken(request: FastifyRequest): string | null {
  const cookies = request.headers.cookie?.split(';') ?? [];
  const raw = cookies.find((item) => item.trim().startsWith(`${COOKIE}=`));
  const token = raw?.trim().slice(COOKIE.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export async function destroySession(request: FastifyRequest, reply: FastifyReply) {
  const token = readToken(request);
  if (token) await prisma.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  reply.header('Set-Cookie', sessionCookie('', request, 0));
}

export function currentTokenHash(request: FastifyRequest) {
  const token = readToken(request);
  return token ? hashToken(token) : null;
}

export async function accessGuard(request: FastifyRequest, reply: FastifyReply) {
  const route = request.url.split('?')[0];
  if (route === '/health' || route === '/api/auth/login') return;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.origin;
    if (origin && origin !== env.corsOrigin) {
      return reply.code(403).send({ message: 'Origem não autorizada' });
    }
  }

  // Agentes IoT não usam cookies de navegador.
  if (route === '/api/heartbeats' || route === '/api/logs' || route.startsWith('/api/agent/')) {
    if (!env.stationApiKey) return reply.code(503).send({ message: 'STATION_API_KEY ausente no servidor' });
    if (!equalSecrets(request.headers['x-station-key'], env.stationApiKey)) {
      return reply.code(401).send({ message: 'Chave da estação inválida' });
    }
    return;
  }

  const token = readToken(request);
  if (!token) return reply.code(401).send({ message: 'Autenticação necessária' });

  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    return reply.code(401).send({ message: 'Sessão inválida ou expirada' });
  }
  if (!session.user.active) {
    return reply.code(403).send({ message: 'Conta desativada. Entre em contato com um administrador.' });
  }

  request.adminUser = session.user;
  if (session.user.mustChangePassword &&
      !['/api/auth/me', '/api/auth/change-password', '/api/auth/logout'].includes(route)) {
    return reply.code(403).send({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Troque a senha inicial' });
  }

  // Permissões sempre aplicadas na API, não apenas nos componentes React.
  // ADMIN: acesso completo; OPERADOR: leituras, CSV e reinício de coletor;
  // VISUALIZADOR: consulta aos dados (sem exportar nem executar comandos).
  const role = session.user.role;
  if (role === 'ADMIN') return;
  if (role !== 'OPERADOR' && role !== 'VISUALIZADOR') {
    return reply.code(403).send({ message: 'Perfil não autorizado' });
  }

  const ownAccountAction = ['/api/auth/change-password', '/api/auth/logout'].includes(route);
  if (ownAccountAction) return;

  if (route.startsWith('/api/admin/')) {
    return reply.code(403).send({ message: 'Apenas administradores podem acessar esta área' });
  }
  if (route.startsWith('/api/export/') && role !== 'OPERADOR') {
    return reply.code(403).send({ message: 'Exportação indisponível para este perfil' });
  }

  if (request.method === 'GET' || request.method === 'HEAD') return;
  if (role === 'OPERADOR' && request.method === 'POST' &&
      route.startsWith('/api/stations/') && route.endsWith('/restart') && route.split('/').length === 5 &&
      request.body && typeof request.body === 'object' &&
      (request.body as { action?: unknown }).action === 'RESTART_COLLECTOR') {
    return;
  }
  return reply.code(403).send({ message: 'Seu perfil não permite esta operação' });
}
