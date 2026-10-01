import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readMessageFile } from "@/services/voicemail/message-service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const file = await readMessageFile(id);
  if (!file) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.message.mimeType,
      "Content-Length": String(file.data.length),
      "Content-Disposition": `inline; filename="${file.message.fileName.replace(/"/g, "")}"`,
    },
  });
}
