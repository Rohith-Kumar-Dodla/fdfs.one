import { randomUUID } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requestContext(logger) {
  return (req, res, next) => {
    const incoming = req.get('X-Request-Id');
    const requestId = uuid.test(incoming ?? '') ? incoming : randomUUID();
    const startedAt = performance.now();

    req.log = logger.child({ requestId });
    res.set('X-Request-Id', requestId);
    res.once('close', () => {
      req.log.info(
        {
          method: req.method,
          statusCode: res.headersSent ? res.statusCode : null,
          durationMs: Math.round(performance.now() - startedAt),
          completed: res.writableFinished,
          errorCode: res.locals.errorCode,
        },
        'HTTP request',
      );
    });

    next();
  };
}
