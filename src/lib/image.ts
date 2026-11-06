// 上傳前先把照片縮小（最長邊 1800px），省空間也省流量。QR Code 用高品質，掃描不受影響。
const MAX = 1800;

export async function prepareUpload(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 900_000 && file.type !== 'image/heic' && file.type !== 'image/heif') {
      bitmap.close?.();
      return file;
    }
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob) return file;
    return blob.size < file.size || file.type.includes('hei') ? blob : file;
  } catch {
    return file; // 瀏覽器讀不了（例如部分 HEIC），就上傳原檔
  }
}

export function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
