import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { normalizedEmail, password as passwordInput } from '../auth/schemas.js';
import { z } from 'zod';
import { contentModules, staffRoles } from '../../../../shared/admin.js';
import { AppError } from '../../utils/app-error.js';
import { idParams } from '../../utils/list.js';
import { accountView } from '../auth/accounts.js';
import { User } from '../auth/models.js';
import { recordAudit } from './audit.js';

const conflict = (code, message) => new AppError(409, code, message);
const active = { status: 'active', emailVerifiedAt: { $type: 'date' } };
const scopes = z
  .array(z.enum(contentModules))
  .max(contentModules.length)
  .refine((values) => new Set(values).size === values.length);
export const staffInput = z.object({
  params: idParams,
  body: z
    .strictObject({
      role: z.enum(staffRoles),
      enabled: z.boolean(),
      modules: scopes.optional(),
      reason: z.string().trim().min(3).max(300),
    })
    .refine(
      ({ role, enabled, modules }) =>
        role === 'content_manager' && enabled
          ? Boolean(modules?.length)
          : modules === undefined,
      {
        path: ['modules'],
        message: 'Select one or more modules when granting Content Manager.',
      },
    ),
});

export async function bootstrapSuper(address, { password, bcryptCost } = {}) {
  const email = normalizedEmail.parse(address);
  if (
    password !== undefined &&
    (!Number.isInteger(bcryptCost) || bcryptCost < 10 || bcryptCost > 14)
  )
    throw new AppError(
      500,
      'SUPER_HASH_CONFIG',
      'Invalid password hashing configuration.',
    );
  const passwordHash =
    password === undefined
      ? undefined
      : await bcrypt.hash(passwordInput.parse(password), bcryptCost);
  return mongoose.connection
    .transaction(async (session) => {
      const target = await User.findOne({ email })
        .select('+superSeed')
        .session(session);
      if (
        passwordHash &&
        target?.superSeed &&
        target.roles.includes('super_admin') &&
        target.status === 'active' &&
        target.emailVerifiedAt
      )
        return accountView(target);
      if (passwordHash && target)
        throw conflict(
          'SUPER_ACCOUNT_EXISTS',
          'This address belongs to an existing account. Inspect ownership before any privileged recovery.',
        );
      if (
        await User.exists({
          $or: [{ superSeed: true }, { roles: 'super_admin' }],
        }).session(session)
      )
        throw conflict(
          'SUPER_BOOTSTRAPPED',
          'Super Administrator bootstrap has already been used.',
        );
      const user = passwordHash
        ? (
            await User.create(
              [
                {
                  email,
                  fullName: 'FDFS.ONE Administrator',
                  passwordHash,
                  roles: ['viewer', 'admin', 'super_admin'],
                  status: 'active',
                  emailVerifiedAt: new Date(),
                  superSeed: true,
                },
              ],
              { session },
            )
          )[0]
        : await User.findOneAndUpdate(
            { ...active, email, roles: 'admin' },
            {
              $addToSet: { roles: 'super_admin' },
              $set: { superSeed: true },
              $inc: { authVersion: 1 },
            },
            { session, returnDocument: 'after' },
          );
      if (!user)
        throw conflict(
          'SUPER_INELIGIBLE',
          'Choose an existing active, verified administrator.',
        );
      await recordAudit(
        session,
        { actorId: user.publicId, requestId: randomUUID() },
        'user.staff_changed',
        'user',
        user.publicId,
        {
          field: 'super_admin',
          to: 'enabled',
          reason: 'Initial operator bootstrap',
        },
      );
      return accountView(user);
    })
    .catch((error) => {
      if (error.code === 11000)
        throw conflict(
          'SUPER_BOOTSTRAPPED',
          'Super Administrator bootstrap has already been used.',
        );
      throw error;
    });
}

export function changeStaff(id, input, context) {
  return mongoose.connection.transaction(async (session) => {
    const gate = await User.updateOne(
      { superSeed: true },
      { $inc: { policyVersion: 1 } },
      { session },
    );
    if (!gate.matchedCount)
      throw conflict(
        'SUPER_BOOTSTRAP_REQUIRED',
        'Complete the Super Administrator bootstrap first.',
      );
    const actor = await User.exists({
      ...active,
      publicId: context.actorId,
      roles: 'super_admin',
    }).session(session);
    if (!actor || id === context.actorId)
      throw new AppError(
        403,
        'PROTECTED_ACCOUNT',
        'This role change is unavailable.',
      );
    const target = await User.findOne({ publicId: id }).session(session);
    if (!target)
      throw new AppError(404, 'USER_NOT_FOUND', 'Account not found.');
    const { role, enabled, modules, reason } = input;
    if (
      target.status === 'deleted' ||
      (enabled && (target.status !== 'active' || !target.emailVerifiedAt))
    ) {
      throw conflict(
        'ACCOUNT_INELIGIBLE',
        'Grant roles to active accounts with verified email.',
      );
    }
    if (
      !enabled &&
      role === 'super_admin' &&
      target.roles.includes(role) &&
      !(await User.exists({
        ...active,
        publicId: { $ne: id },
        roles: 'super_admin',
      }).session(session))
    ) {
      throw conflict(
        'LAST_SUPER_ADMIN',
        'At least one active Super Administrator is required.',
      );
    }
    const before = target.roles.includes(role);
    const previous =
      role === 'content_manager'
        ? target.cmsModules.join(', ')
        : String(before);
    target.roles = enabled
      ? [...new Set([...target.roles, role])]
      : target.roles.filter((value) => value !== role);
    if (role === 'content_manager') target.cmsModules = modules ?? [];
    const next =
      role === 'content_manager'
        ? target.cmsModules.join(', ')
        : String(enabled);
    if (before === enabled && previous === next) return accountView(target);
    await User.updateOne(
      { _id: target._id },
      {
        $set: { roles: target.roles, cmsModules: target.cmsModules },
        $inc: { authVersion: 1 },
      },
      { session },
    );
    await recordAudit(session, context, 'user.staff_changed', 'user', id, {
      field: role,
      from: previous,
      to: next,
      reason,
    });
    return accountView(target);
  });
}
