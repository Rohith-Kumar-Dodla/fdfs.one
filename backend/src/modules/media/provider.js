import { v2 as cloudinary } from 'cloudinary';

export function loadMediaConfig(env = process.env) {
  const cloud_name = env.CLOUDINARY_CLOUD_NAME?.trim();
  const api_key = env.CLOUDINARY_API_KEY?.trim();
  const api_secret = env.CLOUDINARY_API_SECRET?.trim();
  return cloud_name && api_key && api_secret
    ? { cloud_name, api_key, api_secret }
    : null;
}

export function createCloudinaryProvider(config, health = () => {}) {
  if (!config) return null;
  cloudinary.config({ ...config, secure: true });
  return {
    upload(publicId, data) {
      return new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              resource_type: 'image',
              type: 'upload',
              public_id: publicId,
              overwrite: false,
              timeout: 15000,
              disable_promise: true,
            },
            (error, result) => {
              if (error) reject(error);
              else if (
                result?.public_id === publicId &&
                result.resource_type === 'image' &&
                result.secure_url?.startsWith('https://res.cloudinary.com/')
              ) {
                resolve({ url: result.secure_url, assetId: result.asset_id });
              } else reject(new Error('Unexpected image provider response'));
            },
          )
          .once('error', reject)
          .end(data);
      }).then(
        (value) => {
          health('healthy');
          return value;
        },
        (error) => {
          health('degraded');
          throw error;
        },
      );
    },
    async remove(publicId) {
      try {
        const response = await cloudinary.uploader.destroy(publicId, {
          resource_type: 'image',
          type: 'upload',
          invalidate: true,
          timeout: 15000,
        });
        if (!['ok', 'not found'].includes(response?.result))
          throw new Error('Image provider deletion failed');
        health('healthy');
        return response.result;
      } catch (error) {
        health('degraded');
        throw error;
      }
    },
  };
}
