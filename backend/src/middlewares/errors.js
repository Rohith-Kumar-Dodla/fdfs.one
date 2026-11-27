import { AppError } from '../utils/app-error.js';
import { sendError } from '../utils/responses.js';

export function notFound() {
  throw new AppError(404, 'NOT_FOUND', 'Route not found');
}

const parserErrors = {
  'entity.parse.failed': {
    status: 400,
    code: 'INVALID_JSON',
    message: 'Malformed JSON body',
  },
  'entity.too.large': {
    status: 413,
    code: 'BODY_TOO_LARGE',
    message: 'Request body is too large',
  },
  'encoding.unsupported': {
    status: 415,
    code: 'UNSUPPORTED_ENCODING',
    message: 'Unsupported body encoding',
  },
  'charset.unsupported': {
    status: 415,
    code: 'UNSUPPORTED_CHARSET',
    message: 'Unsupported body charset',
  },
  'request.aborted': {
    status: 400,
    code: 'REQUEST_ABORTED',
    message: 'Request body was interrupted',
  },
  'request.size.invalid': {
    status: 400,
    code: 'INVALID_BODY_SIZE',
    message: 'Invalid request body size',
  },
};

const safeServiceErrors = new Set([
  'MOVIE_METADATA_UNAVAILABLE',
  'MOVIE_METADATA_INVALID',
  'YOUTUBE_METADATA_UNAVAILABLE',
  'DEPENDENCY_UNAVAILABLE',
  'SITE_MAINTENANCE',
]);

export function handleError(error, req, res, _next) {
  if (res.headersSent) {
    req.log.error('Request failed after response headers were sent');
    return res.destroy();
  }
  if (
    error instanceof AppError &&
    ((error.status >= 400 && error.status < 500) ||
      safeServiceErrors.has(error.code))
  ) {
    return sendError(res, error);
  }
  if (Object.hasOwn(parserErrors, error?.type)) {
    return sendError(res, parserErrors[error.type]);
  }

  req.log.error('Unhandled request error');
  return sendError(res, {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'An internal server error occurred',
  });
}
