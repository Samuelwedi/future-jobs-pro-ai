import sharp from 'sharp';

const maxBytes = 5 * 1024 * 1024;
const maxPixels = 20_000_000;
const maxSide = 1024;
const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Use only bytes already fetched through an authorized, bounded service. No path, URL or I/O here. */
export async function renderShiftPreviewImage(
  source: Buffer, expectedType: string, expectedLength: number,
): Promise<Buffer | null> {
  if (!Buffer.isBuffer(source) || !Number.isSafeInteger(expectedLength) || expectedLength < 1
      || source.length !== expectedLength || expectedLength > maxBytes) return null;
  const format = expectedType === 'image/png' ? 'png' : expectedType === 'image/jpeg' ? 'jpeg' : null;
  if (!format || (format === 'png' && !source.subarray(0, 8).equals(pngHeader))
      || (format === 'jpeg' && (source[0] !== 0xff || source[1] !== 0xd8 || source[2] !== 0xff))) return null;

  try {
    const image = sharp(Buffer.from(source), { failOn: 'warning', limitInputPixels: maxPixels, pages: 1 });
    const metadata = await image.metadata();
    if (metadata.format !== format || !metadata.width || !metadata.height || metadata.width * metadata.height > maxPixels
        || (metadata.pages ?? 1) !== 1) return null;
    // New JPEG, not the original: orientation is applied, transparency is
    // composited on white, and original EXIF/ICC/comment metadata is not kept.
    const { data, info } = await image.autoOrient().resize({
      width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true,
    }).flatten({ background: '#ffffff' }).toColourspace('srgb').jpeg({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    if (info.format !== 'jpeg' || info.width > maxSide || info.height > maxSide
        || data.length === 0 || data.length > 1024 * 1024) return null;
    return data;
  } catch {
    return null;
  }
}
