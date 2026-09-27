import { NextRequest, NextResponse } from "next/server"

import { OPEN_GRAPH_IMAGE_PATH } from "@/constants";

export function GET(req: NextRequest) {
  return NextResponse.redirect(new URL(OPEN_GRAPH_IMAGE_PATH, req.url))
}
