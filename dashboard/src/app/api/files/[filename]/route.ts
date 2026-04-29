import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import mime from "mime";

const UPLOAD_DIR = "/tmp/sbh-uploads";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const { filename: rawFilename } = await params;
  const filename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, "");
  const filepath = path.join(UPLOAD_DIR, filename);
  if (!existsSync(filepath)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const buf = await readFile(filepath);
  const type = mime.getType(filename) ?? "application/octet-stream";
  return new NextResponse(buf, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" } });
}
