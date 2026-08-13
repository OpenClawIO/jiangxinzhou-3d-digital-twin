import { NextResponse } from "next/server";
import { createTransitRealtimeProvider } from "../../../jiangxinzhou/transit/provider";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const provider = createTransitRealtimeProvider();
  const snapshot = await provider.getSnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "X-Transit-Provider": provider.kind,
    },
  });
}
