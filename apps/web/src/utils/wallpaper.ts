/**
 * Processes and optimizes a user-selected wallpaper image.
 * Downsamples resolution to max 2560px to preserve memory and ensure smooth rendering,
 * while maintaining crisp visuals and ensuring localStorage quota is respected.
 */
export function processWallpaperImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.onload = (e) => {
      const rawDataUrl = e.target?.result as string;
      if (!rawDataUrl) {
        reject(new Error("图片数据为空"));
        return;
      }
      if (typeof window === "undefined" || !window.Image) {
        resolve(rawDataUrl);
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error("无法解析图片格式"));
      img.onload = () => {
        const MAX_DIM = 2560;
        let width = img.width;
        let height = img.height;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        try {
          const webp = canvas.toDataURL("image/webp", 0.92);
          if (webp && webp.startsWith("data:image/webp")) {
            resolve(webp);
            return;
          }
        } catch {
          // fallback to jpeg
        }
        try {
          const jpeg = canvas.toDataURL("image/jpeg", 0.92);
          resolve(jpeg);
        } catch {
          resolve(rawDataUrl);
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}
