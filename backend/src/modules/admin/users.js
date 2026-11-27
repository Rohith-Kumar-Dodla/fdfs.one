import mongoose from 'mongoose';
import { staffRoles } from '../../../../shared/admin.js';
import { z } from 'zod';
import { AppError } from '../../utils/app-error.js';
import {
  idParams,
  listInput,
  searchPattern,
  sendList,
} from '../../utils/list.js';
import { accountView } from '../auth/accounts.js';
import { User, roles } from '../auth/models.js';
import { recordAudit } from './audit.js';

const statuses = ['active', 'suspended', 'deleted'];
export const usersInput = listInput({
  q: z.string().trim().min(1).max(80).optional(),
  role: z.enum(roles).optional(),
  verified: z.enum(['true', 'false']).optional(),
  status: z.enum(statuses).optional(),
});
export const roleInput = z.object({
  params: idParams,
  body: z.strictObject({
    role: z.enum(['creator', 'organizer']),
    enabled: z.boolean(),
  }),
});
export const statusInput = z.object({
  params: idParams,
  body: z.strictObject({
    status: z.enum(['active', 'suspended']),
  }),
});
export const userInput = z.object({ params: idParams });

export function listUsers(res, query) {
  const { q, role, verified, status } = query;
  const filter = {};
  if (q) {
    const term = searchPattern(q);
    filter.$or = [{ fullName: term }, { email: term }];
  }
  if (role) filter.roles = role;
  if (verified !== undefined)
    filter.emailVerifiedAt = verified === 'true' ? { $type: 'date' } : null;
  if (status) filter.status = status;
  return sendList(
    res,
    User,
    filter,
    query,
    (user) => ({
      ...accountView(user),
      avatar:
        user.profileImage?.status === 'active'
          ? user.profileImage.url
          : undefined,
    }),
    undefined,
    undefined,
    (find) => find.populate('profileImage', 'url status'),
  );
}

export async function getUser(id) {
  const user = await User.findOne({ publicId: id });
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Account not found.');
  return accountView(user);
}

export function modifyUser(id, context, operation, input = {}) {
  return mongoose.connection.transaction(async (session) => {
    const target = await User.findOne({ publicId: id }).session(session);
    if (!target)
      throw new AppError(404, 'USER_NOT_FOUND', 'Account not found.');
    if (
      target.publicId === context.actorId ||
      target.roles.some((role) => staffRoles.includes(role)) ||
      target.status === 'deleted'
    ) {
      throw new AppError(
        403,
        'PROTECTED_ACCOUNT',
        'This account cannot be changed here.',
      );
    }

    let summary;
    let update;
    let action;
    if (operation === 'role') {
      const present = target.roles.includes(input.role);
      if (present === input.enabled) return accountView(target);
      if (
        input.enabled &&
        (!target.emailVerifiedAt || target.status !== 'active')
      ) {
        throw new AppError(
          409,
          'ACCOUNT_INELIGIBLE',
          'Grant roles to active accounts with a verified email.',
        );
      }
      update = input.enabled
        ? { $addToSet: { roles: input.role } }
        : { $pull: { roles: input.role } };
      summary = {
        field: input.role,
        from: String(present),
        to: String(input.enabled),
      };
      action = 'user.role_changed';
    } else if (operation === 'status') {
      if (target.status === input.status) return accountView(target);
      update = { $set: { status: input.status }, $inc: { authVersion: 1 } };
      summary = {
        field: 'account-status',
        from: target.status,
        to: input.status,
      };
      action = 'user.status_changed';
    } else {
      update = { $inc: { authVersion: 1 } };
      summary = { field: 'sessions', to: 'revoked' };
      action = 'user.sessions_revoked';
    }

    const updated = await User.findOneAndUpdate(
      {
        _id: target._id,
        roles: { $nin: staffRoles },
        status: { $ne: 'deleted' },
      },
      update,
      { session, returnDocument: 'after' },
    );
    if (!updated)
      throw new AppError(
        409,
        'ACCOUNT_CHANGED',
        'This account changed. Reload and retry.',
      );
    await recordAudit(session, context, action, 'user', id, summary);
    return accountView(updated);
  });
}
