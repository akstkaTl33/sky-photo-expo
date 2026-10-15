import { admin, fail, noSecret, voterOf, okPhoto } from "../../../lib/server";

// 투표: 작품 하나에 같은 인터넷 연결(IP)은 한 표. 표의 기본키(photo, voter)가 두 번째 표를 막는다.
export const dynamic = "force-dynamic";

// 이 연결에서 이미 투표한 작품키 목록
export async function GET(req) {
  if (!admin) return noSecret();
  const { data, error } = await admin.from("expo_votes").select("photo").eq("voter", voterOf(req));
  if (error) return fail(error.message, 500);
  return Response.json({ voted: data.map((r) => r.photo) });
}

export async function POST(req) {
  if (!admin) return noSecret();
  const { photo } = await req.json().catch(() => ({}));
  if (!okPhoto(photo)) return fail("작품을 찾지 못했어요.");
  const { error } = await admin.from("expo_votes").insert({ photo, voter: voterOf(req) });
  if (error?.code === "23505") return Response.json({ ok: true, already: true });
  if (error) return fail(error.message, 500);
  return Response.json({ ok: true, already: false });
}
