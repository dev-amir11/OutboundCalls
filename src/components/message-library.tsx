import { activateMessageAction, deleteMessageAction } from "@/app/actions/messages";
import { getMessages } from "@/services/voicemail/message-service";
import { MessageUpload } from "@/components/message-upload";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatDuration } from "@/lib/format";
import type { MessageKind } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export async function MessageLibrary({
  kind,
  title,
  description,
}: {
  kind: MessageKind;
  title: string;
  description: string;
}) {
  const { messages } = await getMessages(kind);
  return (
    <div>
      <PageHeader title={title} description={description} />
      <MessageUpload kind={kind} />
      <div className="mt-6 grid gap-3">
        {messages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/15 bg-[#161b24] px-4 py-8 text-sm text-zinc-400">No messages uploaded yet.</p>
        ) : (
          messages.map((message) => (
            <article key={message.id} className="rounded-xl border border-white/10 bg-[#161b24] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{message.name}</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    {message.fileName} · {formatDuration(message.durationSeconds)} · {formatDateTime(message.createdAt)}
                  </p>
                  <div className="mt-2 flex gap-2">
                    {message.isActive ? <Badge value="SUCCESSFUL">Active</Badge> : null}
                    {message.isSeed ? <Badge value="MOCK">Seed</Badge> : null}
                  </div>
                </div>
                <div className="flex gap-2">
                  {message.isActive ? null : (
                    <form action={activateMessageAction}>
                      <input type="hidden" name="id" value={message.id} />
                      <input type="hidden" name="kind" value={kind} />
                      <Button type="submit" variant="secondary" size="sm">
                        Set active
                      </Button>
                    </form>
                  )}
                  <form action={deleteMessageAction}>
                    <input type="hidden" name="id" value={message.id} />
                    <input type="hidden" name="kind" value={kind} />
                    <Button type="submit" variant="outline" size="sm">
                      Delete
                    </Button>
                  </form>
                </div>
              </div>
              <audio className="mt-4 w-full" controls src={`/api/audio/${message.id}`} />
            </article>
          ))
        )}
      </div>
    </div>
  );
}
