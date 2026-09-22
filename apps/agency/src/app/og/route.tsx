import { NextRequest, NextResponse } from "next/server"

export function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/og.png", req.url))
}
