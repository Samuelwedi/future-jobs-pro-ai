// Native API key is supplied by the build environment; never commit a key.
module.exports = ({ config }) => {
 const key = process.env.GOOGLE_MAPS_API_KEY;
 return {...config,
  plugins: [...(config.plugins || []), ...(key ? [['react-native-maps', {androidGoogleMapsApiKey:key}]] : [])],
  extra: {...config.extra, androidMapsConfigured: Boolean(key)},
 };
};
