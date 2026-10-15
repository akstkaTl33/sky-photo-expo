import { admin, fail, noSecret, pinOk, okPhoto } from "../../../lib/server";

// 댓글: 누구나 쓰고(내용만), 지우기는 관리 비밀번호가 있어야 한다.
export const dynamic = "force-dynamic";

export async function POST(req) {
  if (!admin) return noSecret();
  const { photo, body } = await req.json().catch(() => ({}));
  const text = typeof body === "string" ? body.trim() : "";
  if (!okPhoto(photo)) return fail("작품을 찾지 못했어요.");
  if (!text) return fail("댓글 내용을 적어 주세요.");
  if (text.length > 300) return fail("댓글은 300자까지 쓸 수 있어요.");
  const { data, error } = await admin.from("expo_comments").insert({ photo, body: text }).select("id,photo,body,created_at").single();
  if (error) return fail(error.message, 500);
  return Response.json({ ok: true, comment: data });
}

export async function DELETE(req) {
  if (!admin) return noSecret();
  const { id, pin } = await req.json().catch(() => ({}));
  if (!pinOk(pin)) return fail("관리 비밀번호가 맞지 않아요.", 403);
  if (!Number.isInteger(id)) return fail("댓글을 찾지 못했어요.");
  const { error } = await admin.from("expo_comments").delete().eq("id", id);
  if (error) return fail(error.message, 500);
  return Response.json({ ok: true });
}
