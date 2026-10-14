import { supabase, TABLE } from "../../../lib/store";

// 무료 보관소(Supabase)가 일주일 안 쓰면 잠들기 때문에 하루 한 번 두드려 준다. (vercel.json의 crons)
export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await supabase.from(TABLE).select("id").limit(1);
  return Response.json({ ok: !error, at: new Date().toISOString(), error: error?.message });
}
