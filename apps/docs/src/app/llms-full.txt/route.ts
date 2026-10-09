import { getLLMFullText } from "@/lib/source";

export const revalidate = false;

export async function GET() {
  return new Response(await getLLMFullText(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
