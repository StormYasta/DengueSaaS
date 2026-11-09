import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  bootstrapAdmin, clearLoginFailures, createSession, currentTokenHash,
  destroySession, failedLogin, limitLogin, passwordHash, verifyPassword,
} from '../lib/auth.js';

function profile(user: { id: string; username: string; role: string; mustChangePassword: boolean }) {
  return { id: user.id, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword };
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (request, reply) => {
    const input = z.object({
      username: z.string().min(1).max(80),
      password: z.string().min(1).max(256),
    }).parse(request.body);

    if (limitLogin(request.ip)) {
      return reply.code(429).send({ message: 'Muitas tentativas. Tente novamente em 15 minutos.' });
    }

    const user = await prisma.adminUser.findUnique({ where: { username: input.username.trim().toLowerCase() } });
    if (!user || !user.active || !verifyPassword(input.password, user.passwordHash)) {
      failedLogin(request.ip);
      return reply.code(401).send({ message: 'Usuário ou senha inválidos' });
    }
    clearLoginFailures(request.ip);
    await createSession(user.id, request, reply);
    return { user: profile(user) };
  });

  app.get('/auth/me', async (request) => ({ user: profile(request.adminUser!) }));

  app.post('/auth/change-password', async (request, reply) => {
    const input = z.object({
      currentPassword: z.string().min(1).max(256),
      newPassword: z.string().min(12).max(256),
    }).parse(request.body);

    const user = request.adminUser!;
    if (!verifyPassword(input.currentPassword, user.passwordHash)) {
      return reply.code(400).send({ message: 'Senha atual incorreta' });
    }
    if (input.currentPassword === input.newPassword || input.newPassword.toLowerCase() === 'admin') {
      return reply.code(400).send({ message: 'Escolha uma senha diferente da atual' });
    }

    const keepToken = currentTokenHash(request);
    await prisma.$transaction([
      prisma.adminUser.update({
        where: { id: user.id },
        data: { passwordHash: passwordHash(input.newPassword), mustChangePassword: false },
      }),
      prisma.authSession.deleteMany({
        where: { userId: user.id, ...(keepToken ? { tokenHash: { not: keepToken } } : {}) },
      }),
    ]);
    await prisma.event.create({
      data: { type: 'ADMIN_PASSWORD_CHANGED', message: 'Senha do administrador alterada', severity: 'INFO' },
    });
    return { ok: true };
  });

  app.post('/auth/logout', async (request, reply) => {
    await destroySession(request, reply);
    return { ok: true };
  });
}
