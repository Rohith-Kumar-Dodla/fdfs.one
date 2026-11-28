export function sendSuccess(
  res,
  data,
  { status = 200, message = 'Request completed successfully', pagination } = {},
) {
  return res.status(status).json({ success: true, message, data, pagination });
}

export function sendError(res, { status, code, message, details }) {
  res.locals.errorCode = code;
  return res
    .status(status)
    .json({ success: false, message, error: { code, details } });
}
