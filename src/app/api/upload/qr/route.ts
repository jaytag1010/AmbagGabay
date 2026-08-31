import { NextResponse } from "next/server";
import { QR_IMAGE_SIZE_LIMIT, uploadImageToImgBB } from "@/lib/imgbb";

export const runtime = "nodejs";

async function isAuthenticated(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!token || !firebaseApiKey) return false;
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token }),
      cache: "no-store",
    },
  );
  return response.ok;
}

export async function POST(request: Request) {
  try {
    if (!(await isAuthenticated(request)))
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File))
      return NextResponse.json(
        { error: "Choose a QR image." },
        { status: 400 },
      );
    if (image.size > QR_IMAGE_SIZE_LIMIT)
      return NextResponse.json(
        { error: "Images must be 5 MB or smaller." },
        { status: 413 },
      );
    return NextResponse.json(await uploadImageToImgBB(image), { status: 201 });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Unable to upload QR image.";
    return NextResponse.json(
      { error: message },
      { status: message === "Image upload is not configured." ? 503 : 502 },
    );
  }
}
