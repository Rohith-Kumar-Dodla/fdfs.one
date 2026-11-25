import express from 'express';
import sharp from 'sharp';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../../utils/app-error.js';
import { sendError } from '../../utils/responses.js';

const maxBytes = 5 * 1024 * 1024;
const formats = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const claimedTypes = Object.values(formats);
const invalid = () =>
  new AppError(
    415,
    'INVALID_IMAGE',
    'Upload a valid, still JPEG, PNG or WebP image.',
  );

function hasImageSignature(bytes) {
  return (
    bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP')
  );
}

export async function normalizeImage(bytes, claimedType) {
  if (!Buffer.isBuffer(bytes) || !hasImageSignature(bytes)) throw invalid();
  const contentType = claimedType?.split(';', 1)[0].trim().toLowerCase();
  if (bytes.length > maxBytes)
    throw new AppError(413, 'BODY_TOO_LARGE', 'Images must be at most 5 MiB.');
  try {
    const input = sharp(bytes, {
      autoOrient: true,
      limitInputPixels: 20000000,
      failOn: 'warning',
    });
    const metadata = await input.metadata();
    if (
      !Object.hasOwn(formats, metadata.format) ||
      formats[metadata.format] !== contentType ||
      (metadata.pages ?? 1) > 1
    )
      throw invalid();
    const { data, info } = await input
      .resize({
        width: 2400,
        height: 2400,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 84 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, bytes: info.size };
  } catch {
    throw invalid();
  }
}

export const readImage = express.raw({
  type: claimedTypes,
  limit: maxBytes,
  inflate: false,
});

export function uploadRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 12,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(req, res) {
      return sendError(res, {
        status: 429,
        code: 'UPLOAD_RATE_LIMIT',
        message: 'Too many uploads. Try again later.',
      });
    },
  });
}
