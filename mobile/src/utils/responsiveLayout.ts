/** Width is measured inside the safe-area frame, not the physical display. */
export function homeGridLayout(width: number, fontScale: number) {
  const available = Math.max(0, width - 36);
  const captureColumns = width < 340 || fontScale >= 1.4 ? 1 : 2;
  const toolColumns = fontScale >= 1.6 ? 1 : width < 340 || fontScale >= 1.2 ? 2 : 3;
  const itemWidth = (columns: number, gap: number) => Math.max(0, (available - gap * (columns - 1)) / columns);
  return { captureColumns, toolColumns, captureWidth: itemWidth(captureColumns, 9), toolWidth: itemWidth(toolColumns, 8) };
}
export function albumThumbnailSize(width: number, columns = 3, spacing = 4) {
  return Math.max(0, (width - spacing * 2) / columns - spacing);
}
