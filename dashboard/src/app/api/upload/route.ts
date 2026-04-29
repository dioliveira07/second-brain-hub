import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";

const UPLOAD_DIR = "/tmp/sbh-uploads";

export async function POST(req: NextRequest) {
  try {
    if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true });

    const form = await req.formData();
    const files = form.getAll("files") as File[];
    if (!files.length) return NextResponse.json({ error: "no files" }, { status: 400 });

    const results = await Promise.all(files.map(async (file) => {
      const ext  = path.extname(file.name) || "";
      const id   = crypto.randomBytes(8).toString("hex");
      const name = `${id}${ext}`;
      const buf  = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(UPLOAD_DIR, name), buf);
      return { name: file.name, url: `/painel/api/files/${name}`, size: file.size };
    }));

    return NextResponse.json({ files: results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
