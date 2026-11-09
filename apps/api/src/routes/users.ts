import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { passwordHash } from '../lib/auth.js';

const roles = z.enum(['ADMIN', 'OPERADOR', 'VISUALIZADOR']);
const usernameSchema = z.string()
  .trim().toLowerCase()
  .min(3, 'O usuário deve ter pelo menos 3 caracteres')
  .max(50)
  .regex(/^[a-z][a-z0-9._-]*$/, 'Use letras minúsculas, números, ponto, traço ou sublinhado');

const userSelect = {
  id: true, username: true, role: true, active: true,
  mustChangePassword: true, createdAt: true, updatedAt: true,
} as const;

function generateTemporaryPassword() {
  return randomBytes(24).toString('base64url');
}

async function audit(action: string, actor: string, target: string, extra: Record<string, unknown> = {}) {
  await prisma.event.create({
    data: {
      type: action,
      severity: 'INFO',
      message: `${actor} executou ${action} na conta ${target}`,
      metadata: { username: target, actor, ...extra },
    },
  });
}

export async function userRoutes(app: FastifyInstance) {
  // Autorização ADMIN obrigatória pelo accessGuard: não confiar apenas na UI.
  app.get('/admin/users', async () => prisma.adminUser.findMany({
    select: userSelect,
    orderBy: [{ active: 'desc' }, { username: 'asc' }],
  }));

  app.post('/admin/users', async (request, reply) => {
    const input = z.object({
      username: usernameSchema,
      role: roles.default('VISUALIZADOR'),
    }).parse(request.body);
    const temporaryPassword = generateTemporaryPassword();

    try {
      const user = await prisma.adminUser.create({
        data: {
          username: input.username, role: input.role, active: true,
          passwordHash: passwordHash(temporaryPassword), mustChangePassword: true,
        },
        select: userSelect,
      });
      await audit('USER_CREATED', request.adminUser!.username, user.username, { role: user.role });
      reply.header('Cache-Control', 'no-store').code(201);
      return { user, temporaryPassword };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return reply.code(409).send({ message: 'Já existe uma conta com esse nome de usuário' });
      }
      throw error;
    }
  });

  app.patch('/admin/users/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const changes = z.object({
      role: roles.optional(),
      active: z.boolean().optional(),
    }).refine((input) => input.role !== undefined || input.active !== undefined,
      { message: 'Informe pelo menos uma alteração' }).parse(request.body);

    try {
      // Isolamento serializable impede duas sessões administrativas de
      // rebaixarem simultaneamente os dois últimos administradores.
      const result = await prisma.$transaction(async (tx) => {
        const target = await tx.adminUser.findUnique({ where: { id } });
        if (!target) return { status: 404 as const, message: 'Usuário não encontrado' };
        if (target.id === request.adminUser!.id) {
          return { status: 400 as const, message: 'Não é possível editar seu próprio perfil por esta tela' };
        }

        const nextRole = changes.role ?? target.role;
        const nextActive = changes.active ?? target.active;
        if (target.role === 'ADMIN' && target.active && (nextRole !== 'ADMIN' || !nextActive)) {
          const admins = await tx.adminUser.count({ where: { role: 'ADMIN', active: true } });
          if (admins <= 1) {
            return { status: 409 as const, message: 'A plataforma precisa manter pelo menos um administrador ativo' };
          }
        }

        const user = await tx.adminUser.update({
          where: { id }, data: changes, select: userSelect,
        });
        if (changes.active === false) await tx.authSession.deleteMany({ where: { userId: id } });
        await tx.event.create({
          data: {
            type: 'USER_UPDATED', severity: 'INFO',
            message: `${request.adminUser!.username} alterou a conta ${user.username}`,
            metadata: { username: user.username, actor: request.adminUser!.username, role: user.role, active: user.active },
          },
        });
        return { user };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      if ('status' in result && result.status) {
        return reply.code(result.status).send({ message: result.message });
      }
      return { user: result.user };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        return reply.code(409).send({ message: 'Outro administrador alterou usuários ao mesmo tempo. Atualize a lista e tente novamente.' });
      }
      throw error;
    }
  });

  app.post('/admin/users/:id/reset-password', async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    if (id === request.adminUser!.id) {
      return reply.code(400).send({ message: 'Para alterar sua senha, use Configurações > Segurança da conta' });
    }
    const temporaryPassword = generateTemporaryPassword();
    const user = await prisma.$transaction(async (tx) => {
      const found = await tx.adminUser.findUnique({ where: { id }, select: userSelect });
      if (!found) return null;
      await tx.adminUser.update({
        where: { id },
        data: { passwordHash: passwordHash(temporaryPassword), mustChangePassword: true },
      });
      await tx.authSession.deleteMany({ where: { userId: id } });
      await tx.event.create({
        data: {
          type: 'USER_PASSWORD_RESET', severity: 'WARNING',
          message: `${request.adminUser!.username} redefiniu a senha de ${found.username}`,
          metadata: { username: found.username, actor: request.adminUser!.username },
        },
      });
      return found;
    });
    if (!user) return reply.code(404).send({ message: 'Usuário não encontrado' });
    reply.header('Cache-Control', 'no-store');
    return { user, temporaryPassword };
  });
}
