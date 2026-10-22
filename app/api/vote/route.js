import { admin, fail, noSecret, voterOf, okPhoto } from "../../../lib/server";

// 좋아요: 같은 인터넷 연결(IP)은 하루에 DAILY개까지, 작품마다 하루 1번. 날짜는 한국 시간 자정에 바뀐다.
// 표의 기본키(photo, voter, day)가 같은 날 두 번째 표를, 표의 트리거(supabase/daily-votes.sql)가 11번째 표를 막는다.
export const dynamic = "force-dynamic";
const DAILY = 10;
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

async function mine(req) {
  const { data, error } = await admin.from("expo_votes").select("photo").eq("voter", voterOf(req)).eq("day", today());
  if (error) throw new Error(error.message);
  return data.map((r) => r.photo);
}

// 이 연결에서 오늘 좋아요한 작품키 목록과 오늘 남은 개수
export async function GET(req) {
  if (!admin) return noSecret();
  try {
    const voted = await mine(req);
    return Response.json({ voted, left: Math.max(0, DAILY - voted.length), daily: DAILY });
  } catch (e) {
    return fail(e.message, 500);
  }
}

export async function POST(req) {
  if (!admin) return noSecret();
  const { photo } = await req.json().catch(() => ({}));
  if (!okPhoto(photo)) return fail("작품을 찾지 못했어요.");
  // 오늘 이미 누른 작품인지 먼저 본다 (개수를 다 쓴 날에도 「이미 눌렀어요」가 맞는 답이다).
  const before = await mine(req).catch(() => []);
  if (before.includes(photo)) return Response.json({ ok: true, already: true, left: Math.max(0, DAILY - before.length) });
  const { error } = await admin.from("expo_votes").insert({ photo, voter: voterOf(req), day: today() });
  if (error && error.code !== "23505" && !/daily_limit/.test(error.message)) return fail(error.message, 500);
  const voted = await mine(req).catch(() => null);
  const left = voted ? Math.max(0, DAILY - voted.length) : null;
  if (error?.code === "23505") return Response.json({ ok: true, already: true, left });
  if (error) return Response.json({ ok: true, limit: true, left: 0 });
  return Response.json({ ok: true, already: false, left });
}
