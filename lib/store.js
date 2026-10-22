import { createClient } from "@supabase/supabase-js";

// 이 전시회만 쓰는 Supabase 프로젝트 (표 만들기는 supabase/setup.sql). publishable key는 공개용.
//  - expo_content  : 사진 작품 한 점 = 한 줄 (id: sky3-p-<시각>-<난수>, data: title, by, zone, img, w, h, order, hidden)
//  - expo_votes    : 투표 (작품마다 같은 IP는 한 번) — 쓰기는 /api/vote 만
//  - expo_comments : 댓글 — 쓰기·지우기는 /api/comment 만
export const SUPABASE_URL = "https://kyqmjecjjlhgzuozpoxp.supabase.co";
const SUPABASE_KEY = "sb_publishable_AJm51RRf8b_aeujsfDcaow_g4KY09gb";
export const TABLE = "expo_content";
export const BUCKET = "expo-photos";
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const P = "sky3-p-";

// 관리 비밀번호(1234)의 SHA-256
export const PIN_HASH = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4";

// ── 전시관 ───────────────────────────────────────
// 관리 화면에서 1~4개로 늘리고 줄이고 숨긴다. z는 한 번 정하면 바뀌지 않는 번호(사진의 zone이 이것을 가리킴),
// 배열 순서가 보이는 순서다. 설정은 expo_content의 한 줄에 둔다 — 사진 줄과 같은 앞머리(sky3-p-)라서
// 따로 표 규칙을 만들지 않아도 관리 화면에서 저장할 수 있다. 사진 목록에서는 빼고 읽는다.
const ZONES_ID = "sky3-p-zones";
export const MAX_ZONES = 4;
export const DEFAULT_ZONES = [
  { z: 1, name: "하늘을 만나는 길", icon: "①", color: "#f0a04b", hidden: false },
  { z: 2, name: "우리가 본 하늘", icon: "🐰", color: "#5aa9e6", hidden: false },
  { z: 3, name: "함께하는 하늘", icon: "🐻", color: "#7cb66a", hidden: false },
];
export const COLORS = ["#f0a04b", "#5aa9e6", "#7cb66a", "#e2708f", "#9b7fd1", "#e0b43a"];
export const visibleZones = (zones) => zones.filter((z) => !z.hidden);
export const zoneOf = (zones, z) => zones.find((x) => x.z === Number(z)) || zones[0];

export async function loadZones() {
  const { data, error } = await supabase.from(TABLE).select("data").eq("id", ZONES_ID).maybeSingle();
  if (error) throw new Error(error.message);
  const list = data?.data?.zones;
  return Array.isArray(list) && list.length ? list : DEFAULT_ZONES;
}
export async function saveZones(zones) {
  const { error } = await supabase.from(TABLE).upsert({ id: ZONES_ID, data: { zones }, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function checkPin(pin) {
  return (await sha256(pin)) === PIN_HASH;
}

// 이 기기에서 관리자로 들어왔으면 비밀번호를 기억해 두었다가 댓글 지우기에 쓴다.
const ADMIN = "sky3-admin-pin";
export function rememberAdmin(pin) {
  try { localStorage.setItem(ADMIN, pin); } catch {}
}
export function adminPin() {
  try { return localStorage.getItem(ADMIN) || ""; } catch { return ""; }
}

// PostgREST는 1000줄씩만 주므로 끝까지 나눠 읽는다.
async function fetchAll(table, cols, order, like) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(cols).order(order, { ascending: true }).range(from, from + 999);
    if (like) q = q.like("id", `${like}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

// ── 사진 작품 ─────────────────────────────────────
const toPhoto = (row) => ({ id: row.id, ...(row.data || {}), hidden: !!row.data?.hidden, updatedAt: row.updated_at });
export const photoKey = (id) => id.slice(P.length);

export async function loadPhotos() {
  const rows = await fetchAll(TABLE, "id,data,updated_at", "updated_at", P);
  return rows.filter((r) => r.id !== ZONES_ID).map(toPhoto);
}
export function sortPhotos(list) {
  return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
export async function addPhoto(data) {
  const id = `${P}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const row = { ...data, hidden: false, order: Date.now(), createdAt: new Date().toISOString() };
  const { error } = await supabase.from(TABLE).insert({ id, data: row });
  if (error) throw new Error(error.message);
  return { id, ...row };
}
export async function updatePhoto(photo, patch) {
  const { id, updatedAt, ...data } = photo;
  const next = { ...data, ...patch };
  const { error } = await supabase.from(TABLE).update({ data: next, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  return { id, ...next };
}

// ── 사진 파일 ─────────────────────────────────────
// 휴대폰 사진은 수 MB라서 긴 변 1600px JPEG로 줄여 올린다.
export async function shrinkImage(file, max = 1600) {
  let src;
  try {
    src = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    src = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("사진을 읽지 못했어요."));
      im.src = URL.createObjectURL(file);
    });
  }
  const sw = src.width, sh = src.height;
  const k = Math.min(1, max / Math.max(sw, sh));
  const w = Math.round(sw * k), h = Math.round(sh * k);
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  const blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", 0.86));
  return { blob, w, h };
}
export async function uploadPhoto(blob) {
  const name = `photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(name, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw new Error(error.message);
  return supabase.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
}

// ── 투표 ─────────────────────────────────────────
// 작품마다 같은 인터넷 연결(IP)에서는 한 번만 — 서버(/api/vote)가 막는다. 결과는 { 작품키: 표 수 }
export async function loadVotes() {
  const { data, error } = await supabase.from("expo_vote_counts").select("photo,n");
  if (error) throw new Error(error.message);
  return Object.fromEntries(data.map((r) => [r.photo, r.n]));
}
// 이 인터넷 연결에서 오늘 좋아요한 작품키 모음과 오늘 남은 개수 (하루 10개, 작품마다 하루 1번)
export async function loadMyVotes() {
  const r = await fetch("/api/vote", { cache: "no-store" });
  if (!r.ok) throw new Error("투표 기록을 읽지 못했어요.");
  const j = await r.json();
  return { voted: new Set(j.voted), left: j.left, daily: j.daily };
}
// { already: true } 면 오늘 이미 누른 작품, { limit: true } 면 오늘 개수를 다 썼다. left는 오늘 남은 개수.
export async function castVote(photoId) {
  const r = await fetch("/api/vote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ photo: photoKey(photoId) }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "투표를 저장하지 못했어요.");
  return j;
}

// ── 댓글 ─────────────────────────────────────────
// 결과는 { 작품키: [댓글, …] } (오래된 것부터)
export async function loadComments() {
  const all = await fetchAll("expo_comments", "id,photo,body,created_at", "created_at");
  const by = {};
  for (const c of all) (by[c.photo] ||= []).push(c);
  return by;
}
async function commentApi(method, body) {
  const r = await fetch("/api/comment", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "댓글을 저장하지 못했어요.");
  return j;
}
export const addComment = (photoId, body) => commentApi("POST", { photo: photoKey(photoId), body }).then((j) => j.comment);
export const deleteComment = (id, pin) => commentApi("DELETE", { id, pin });
