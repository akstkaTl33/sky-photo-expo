import { createClient } from "@supabase/supabase-js";
import { createHash, createHmac } from "node:crypto";
import { SUPABASE_URL, PIN_HASH } from "./store";

// 서버(api 경로)에서만 쓴다. 비밀 키는 Vercel 환경 변수 SUPABASE_SECRET_KEY 에만 둔다.
const SECRET = process.env.SUPABASE_SECRET_KEY || "";
export const admin = SECRET ? createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } }) : null;

export const fail = (error, status = 400) => Response.json({ error }, { status });
export const noSecret = () => fail("서버 설정(SUPABASE_SECRET_KEY)이 아직 안 되어 있어요.", 500);

// 방문자의 IP를 비밀 키와 섞어 지문으로 만든다. IP 원문은 어디에도 저장하지 않는다.
export function voterOf(req) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return createHmac("sha256", SECRET).update(ip).digest("hex").slice(0, 32);
}

export const pinOk = (pin) => typeof pin === "string" && createHash("sha256").update(pin).digest("hex") === PIN_HASH;

// 작품키 모양: <시각>-<난수>
export const okPhoto = (p) => typeof p === "string" && /^\d{10,16}-[a-z0-9]{1,12}$/.test(p);
