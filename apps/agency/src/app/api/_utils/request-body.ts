import "server-only";

import { NextResponse } from "next/server";

interface RequestBodyOptions {
  request: Request;
  maxBytes: number;
}

/** Bound actual bytes, including streamed requests without Content-Length. */
async function readBoundedBody({ request, maxBytes }: RequestBodyOptions) {
  const tooLarge = () => ({
    response: NextResponse.json({ error: "Request body is too large" }, { status: 413 }),
  });
  if (Number(request.headers.get("content-length")) > maxBytes) {
    await request.body?.cancel();
    return tooLarge();
  }
  if (!request.body) return { body: new Uint8Array() };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return tooLarge();
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { body };
  } catch {
    return { response: NextResponse.json({ error: "Invalid request body" }, { status: 400 }) };
  } finally {
    reader.releaseLock();
  }
}

export async function readJsonBody(options: RequestBodyOptions) {
  const result = await readBoundedBody(options);
  if ("response" in result) return result;
  try {
    return { data: JSON.parse(new TextDecoder().decode(result.body)) as unknown };
  } catch {
    return { response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) };
  }
}

export async function readFormBody(options: RequestBodyOptions) {
  const result = await readBoundedBody(options);
  if ("response" in result) return result;
  try {
    const data = await new Response(result.body, { headers: options.request.headers }).formData();
    return { data };
  } catch {
    return { response: NextResponse.json({ error: "Invalid form body" }, { status: 400 }) };
  }
}
