import { NextResponse } from "next/server";
import { checkKoreanSupport, libreTranslateUrl, translateWithLibreTranslate } from "@/services/translation/libreTranslate";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const base = libreTranslateUrl();
    if (!base) return NextResponse.json({ ready: false, message: "LibreTranslate setup needed · English-only transcription is available" }, { headers: noStore });
    await checkKoreanSupport(base, AbortSignal.timeout(5000));
    return NextResponse.json({ ready: true, message: "LibreTranslate · Korean → English · Translation access is checked when listening" }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ ready: false, message: error instanceof Error ? error.message : "LibreTranslate is unavailable" }, { headers: noStore });
  }
}

export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403, headers: noStore });
  }
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 24000) return NextResponse.json({ error: "Text too long" }, { status: 413, headers: noStore });
    body = JSON.parse(raw);
  } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: noStore }); }
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Missing text" }, { status: 400, headers: noStore });
  if (text.length > 5000) return NextResponse.json({ error: "Text too long" }, { status: 413, headers: noStore });
  try {
    const translation = await translateWithLibreTranslate(text, request.signal);
    return NextResponse.json({ translation }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error && error.name === "Error" ? error.message : "LibreTranslate timed out or could not be reached. Your Korean text is kept for retry.";
    return NextResponse.json({ error: message }, { status: 503, headers: noStore });
  }
}
