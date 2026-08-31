import "server-only";

const IMGBB_ENDPOINT = "https://api.imgbb.com/1/upload";
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const QR_IMAGE_SIZE_LIMIT = 5 * 1024 * 1024;

type ImgBBPayload = {
  success?: boolean;
  data?: { id?: string; url?: string; display_url?: string };
  error?: { message?: string };
};
export type ImgBBUpload = { url: string; imageId?: string };

export async function uploadImageToImgBB(file: File): Promise<ImgBBUpload> {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) throw new Error("Image upload is not configured.");
  if (!ALLOWED_IMAGE_TYPES.has(file.type))
    throw new Error("Choose a JPG, PNG, or WebP image.");
  if (!file.size || file.size > QR_IMAGE_SIZE_LIMIT)
    throw new Error("Images must be 5 MB or smaller.");
  const body = new FormData();
  body.set("key", apiKey);
  body.set("image", file, file.name || "payment-qr");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetch(IMGBB_ENDPOINT, {
      method: "POST",
      body,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    throw new Error("Image upload service is unavailable. Try again.");
  } finally {
    clearTimeout(timeout);
  }
  let payload: ImgBBPayload;
  try {
    payload = (await response.json()) as ImgBBPayload;
  } catch {
    throw new Error("Image upload service returned an invalid response.");
  }
  const url = payload.data?.url || payload.data?.display_url;
  if (!response.ok || payload.success !== true || !url)
    throw new Error(payload.error?.message || "Unable to upload QR image.");
  try {
    if (new URL(url).protocol !== "https:") throw new Error();
  } catch {
    throw new Error("Image upload service returned an invalid image URL.");
  }
  return { url, imageId: payload.data?.id || undefined };
}
