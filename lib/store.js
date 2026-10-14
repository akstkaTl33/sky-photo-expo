import { createClient } from "@supabase/supabase-js";

// kids-expo·한글날 전시관과 같은 Supabase 프로젝트·같은 표·같은 버킷을 씁니다. (publishable key는 공개용)
// 줄 이름 앞머리를 sky3- 로 따로 써서 다른 앱 자료와 섞이지 않는다.
//  - sky3-p-<시각>-<난수>          : 사진 작품 한 점 (title, by, zone, img, w, h, order, hidden)
//  - sky3-l-<작품키>-<시각>-<난수>  : 좋아요 한 번 (표가 지우기를 막아 두어서 한 번 누를 때마다 한 줄씩 쌓는다)
const SUPABASE_URL = "https://pgywpdodatjfpivxmymn.supabase.co";
const SUPABASE_KEY = "sb_publishable_FeO3LdfFBB6KEwblcZPa2w_sW9dVuUg";
export const TABLE = "suseong_hub_content";
export const BUCKET = "suseong-hub";
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const P = "sky3-p-";
const L = "sky3-l-";

// 관리 비밀번호(12324)의 SHA-256
const PIN_HASH = "95d245f3eb25eb695e980c0591c16a4c818e609cd2aac265580749c877848926";

export const ZONES = [
  { z: 1, name: "하늘을 만나는 길", icon: "①", color: "#f0a04b", desc: "하늘을 처음 만난 순간들" },
  { z: 2, name: "우리가 본 하늘", icon: "🐰", color: "#5aa9e6", desc: "아이들의 눈에 담긴 하늘" },
  { z: 3, name: "함께하는 하늘", icon: "🐻", color: "#7cb66a", desc: "가족과 함께 올려다본 하늘" },
];
export const zoneOf = (z) => ZONES.find((x) => x.z === Number(z)) || ZONES[0];

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function checkPin(pin) {
  return (await sha256(pin)) === PIN_HASH;
}

// PostgREST는 1000줄씩만 주므로 끝까지 나눠 읽는다.
async function fetchAll(cols, like, since) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(TABLE).select(cols).like("id", `${like}%`).order("updated_at", { ascending: true }).range(from, from + 999);
    if (since) q = q.gt("updated_at", since);
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
  const rows = await fetchAll("id,data,updated_at", P);
  return rows.map(toPhoto);
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
  const name = `sky-expo/photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(name, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw new Error(error.message);
  return supabase.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
}

// ── 좋아요 ───────────────────────────────────────
// since 이후 새로 생긴 좋아요 줄만 읽는다. 줄 이름만 읽으므로 가볍다.
// 같은 줄을 두 번 세지 않도록 seen(이미 센 줄 이름 모음)에 없는 것만 { 작품키: 개수 }로 더한다.
export const likeKey = (likeId) => likeId.slice(L.length).split("-").slice(0, 2).join("-");
export async function loadLikes(since, seen = new Set()) {
  // 저장 시각이 조금 엇갈려 들어오는 줄을 놓치지 않게 30초 앞부터 다시 읽는다(이미 센 줄은 seen으로 걸러짐).
  const from = since ? new Date(Date.parse(since) - 30000).toISOString() : null;
  const rows = await fetchAll("id,updated_at", L, from);
  const add = {};
  const fresh = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    fresh.push(r.id);
    const key = likeKey(r.id);
    add[key] = (add[key] || 0) + 1;
  }
  const last = rows.length ? rows[rows.length - 1].updated_at : since;
  return { add, last, ids: fresh };
}
export async function addLike(photoId) {
  const id = `${L}${photoKey(photoId)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { error } = await supabase.from(TABLE).insert({ id, data: {} });
  if (error) throw new Error(error.message);
  return id;
}

// 이 기기에서 이미 좋아요를 누른 작품 (한 작품에 한 번)
const LIKED = "sky3-liked";
export function getLiked() {
  try { return new Set(JSON.parse(localStorage.getItem(LIKED) || "[]")); } catch { return new Set(); }
}
export function rememberLiked(id) {
  try {
    const s = getLiked(); s.add(id);
    localStorage.setItem(LIKED, JSON.stringify([...s]));
  } catch {}
}
