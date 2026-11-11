// Expo iOS exposes AVCapture presets, Android exposes actual pixel dimensions.
export function highestPictureSize(sizes: readonly string[]): string | undefined {
  if (sizes.includes('Photo')) return 'Photo';
  const dimensions = sizes.map(size => ({ size, match: /^(\d+)x(\d+)$/.exec(size) }))
    .filter(item => item.match && Number(item.match[1]) > 0 && Number(item.match[2]) > 0)
    .sort((a, b) => Number(b.match![1]) * Number(b.match![2]) - Number(a.match![1]) * Number(a.match![2]));
  return dimensions[0]?.size || (sizes.includes('High') ? 'High' : undefined);
}
// Stay below the evidence endpoint's 1 GiB limit, including encoder/container overhead.
export const MAX_VIDEO_BYTES = 950 * 1024 * 1024;
