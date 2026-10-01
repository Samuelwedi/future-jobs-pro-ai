import helmet from 'helmet';

// Allow only this deployment's Cloudinary account; keep Helmet's remaining defaults.
export function webSecurityHeaders() {
  const cloudName=(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const cloudSources=/^[a-zA-Z0-9_-]+$/.test(cloudName)
    ? [`https://res.cloudinary.com/${cloudName}/`] : [];
  return helmet({contentSecurityPolicy:{directives:{
    imgSrc:["'self'",'data:','blob:',...cloudSources],
    mediaSrc:["'self'",'blob:',...cloudSources],
    connectSrc:["'self'",...cloudSources],
  }}});
}
