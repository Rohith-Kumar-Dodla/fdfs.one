import { AppError } from '../utils/app-error.js';

export function validate(schema) {
  return async (req, res, next) => {
    const { body, params, query } = req;
    const result = await schema.safeParseAsync({ body, params, query });
    if (!result.success) {
      const details = result.error.issues.map(({ path, code }) => ({
        path: path.map(String).join('.'),
        code,
      }));
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Request validation failed',
        details,
      );
    }

    res.locals.validated = result.data;
    next();
  };
}
