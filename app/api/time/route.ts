import { NextResponse } from "next/server";
import { JIANGXINZHOU_OBSERVER } from "../../jiangxinzhou/celestial";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json({
    serverTimeMs: Date.now(),
    timeZone: JIANGXINZHOU_OBSERVER.timeZone,
    observer: {
      longitude: JIANGXINZHOU_OBSERVER.longitude,
      latitude: JIANGXINZHOU_OBSERVER.latitude,
    },
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
