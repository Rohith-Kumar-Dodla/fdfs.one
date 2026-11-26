import { can } from '../../../../shared/admin.js';
import { AppError } from '../../utils/app-error.js';

export function authorize(user, permission, module) {
  if (!can(user, permission, module))
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission.');
}

export const permit = (permission, module) => (req, _res, next) => {
  authorize(req.auth.user, permission, module);
  next();
};
