import { NextResponse } from "next/server";
import { verifyFirebaseIdToken } from "@/lib/firebaseServerAuth";

export const runtime = "nodejs";
const MAX_QR_RESPONSE_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  if (!(await verifyFirebaseIdToken(request)))
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  let url: URL;
  try {
    const value = (await request.json()) as { url?: string };
    url = new URL(value.url || "");
    if (url.protocol !== "https:" || url.hostname !== "i.ibb.co")
      throw new Error();
  } catch {
    return NextResponse.json(
      { error: "Invalid QR image URL." },
      { status: 400 },
    );
  }
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "user-agent": "AmbagGabay/2.1" },
      signal: AbortSignal.timeout(20_000),
    });
    const contentType =
      response.headers.get("content-type")?.split(";")[0] || "";
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (!response.ok || !ALLOWED_TYPES.has(contentType))
      throw new Error("ImgBB did not return a supported image.");
    if (declaredSize > MAX_QR_RESPONSE_SIZE)
      return NextResponse.json(
        { error: "QR image is too large." },
        { status: 413 },
      );
    const image = await response.arrayBuffer();
    if (!image.byteLength || image.byteLength > MAX_QR_RESPONSE_SIZE)
      return NextResponse.json(
        { error: "QR image is too large." },
        { status: 413 },
      );
    return new Response(image, {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-length": String(image.byteLength),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to retrieve the QR image." },
      { status: 502 },
    );
  }
}
