import { NextRequest } from "next/server";
import { renderTemplate } from "@/lib/template";
import { sendEmail } from "@/lib/email";

type Recipient = Record<string, any> & { email?: string; name?: string };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["iad1", "sfo1", "bom1"];

async function sendWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  const executing: Promise<void>[] = [];

  const enqueue = (): Promise<void> => {
    if (i >= items.length) return Promise.resolve();
    const idx = i++;
    const p = worker(items[idx], idx)
      .then((r) => { (results as any)[idx] = r; })
      .catch((e) => { (results as any)[idx] = e; })
      .then(() => executing.splice(executing.indexOf(p), 1) as any);
    executing.push(p);
    const ready = executing.length >= limit ? Promise.race(executing) : Promise.resolve();
    return ready.then(() => enqueue());
  };

  await enqueue();
  await Promise.all(executing);
  return results;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      recipients,
      subjectTemplate,
      bodyTemplate,
      fromEmail,
      fromName,
      replyTo,
      dryRun
    } = body as {
      recipients: Recipient[];
      subjectTemplate: string;
      bodyTemplate: string;
      fromEmail: string;
      fromName?: string;
      replyTo?: string;
      dryRun?: boolean;
    };

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return Response.json({ error: "No recipients provided" }, { status: 400 });
    }
    if (!fromEmail) {
      return Response.json({ error: "Missing fromEmail" }, { status: 400 });
    }

    const validRecipients = recipients
      .map((r) => ({ ...r, email: String(r.email || "").trim() }))
      .filter((r) => r.email && /.+@.+\..+/.test(r.email));

    const results = await sendWithConcurrency(validRecipients, 5, async (rec) => {
      const view = { ...rec, fromName } as Record<string, any>;
      const subject = renderTemplate(subjectTemplate, view);
      const text = renderTemplate(bodyTemplate, view);
      try {
        const res = await sendEmail({
          to: rec.email!,
          subject,
          text,
          fromEmail,
          fromName,
          replyTo,
          dryRun
        });
        return { email: rec.email, status: "ok", id: (res as any).id ?? null };
      } catch (e: any) {
        return { email: rec.email, status: "error", error: e?.message ?? String(e) };
      }
    });

    const skipped = recipients.length - validRecipients.length;

    return Response.json({
      ok: true,
      count: validRecipients.length,
      skipped,
      results
    });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
