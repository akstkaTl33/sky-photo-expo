"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ZONES, zoneOf, loadPhotos, sortPhotos, loadLikes, addLike, photoKey, getLiked, rememberLiked } from "../../../lib/store";

export default function Hall() {
  const { z } = useParams();
  const router = useRouter();
  const zone = zoneOf(z);
  const next = ZONES[zone.z % ZONES.length];

  const [photos, setPhotos] = useState(null);
  const [likes, setLikes] = useState({});
  const [liked, setLiked] = useState(new Set());
  const [idx, setIdx] = useState(0);
  const [dx, setDx] = useState(0);
  const [vw, setVw] = useState(390);
  const [big, setBig] = useState(null);
  const [burst, setBurst] = useState(null);
  const [pending, setPending] = useState({}); // 내가 방금 누른 좋아요(서버에서 아직 안 읽힌 것) — 두 번 세지 않게 따로 둔다
  const likeSince = useRef(null);
  const seenLikes = useRef(new Set());
  const drag = useRef(null);
  const lastTap = useRef(0);

  const refreshPhotos = useCallback(() => {
    loadPhotos().then((list) => setPhotos(sortPhotos(list.filter((p) => !p.hidden && Number(p.zone) === zone.z)))).catch(() => setPhotos((p) => p || []));
  }, [zone.z]);
  const refreshLikes = useCallback(() => {
    loadLikes(likeSince.current, seenLikes.current).then(({ add, last, ids }) => {
      if (last && (!likeSince.current || last > likeSince.current)) likeSince.current = last;
      if (ids.length) setPending((m) => { const seen = new Set(ids); const n = {}; for (const k in m) if (!seen.has(m[k])) n[k] = m[k]; return n; });
      if (Object.keys(add).length) setLikes((m) => { const n = { ...m }; for (const k in add) n[k] = (n[k] || 0) + add[k]; return n; });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLiked(getLiked());
    const fit = () => setVw(window.innerWidth);
    fit();
    window.addEventListener("resize", fit);
    refreshPhotos();
    refreshLikes();
    const t1 = setInterval(refreshPhotos, 30000);
    const t2 = setInterval(refreshLikes, 10000);
    return () => { clearInterval(t1); clearInterval(t2); window.removeEventListener("resize", fit); };
  }, [refreshPhotos, refreshLikes]);

  const total = photos ? photos.length + 1 : 1; // 마지막 칸은 「다음 전시관」 안내
  const go = useCallback((d) => setIdx((i) => Math.max(0, Math.min(total - 1, i + d))), [total]);

  useEffect(() => {
    const key = (e) => {
      if (big) { if (e.key === "Escape") setBig(null); return; }
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [go, big]);

  const like = (p) => {
    if (liked.has(p.id)) return;
    const key = photoKey(p.id);
    setPending((m) => ({ ...m, [key]: "…" }));
    setLiked((s) => new Set(s).add(p.id));
    rememberLiked(p.id);
    setBurst(p.id + Date.now());
    addLike(p.id).then((likeId) => setPending((m) => {
      const n = { ...m };
      if (seenLikes.current.has(likeId)) delete n[key]; else n[key] = likeId;
      return n;
    })).catch(() => {
      setPending((m) => { const n = { ...m }; delete n[key]; return n; });
      alert("좋아요를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    });
  };

  const slideW = vw < 700 ? vw * 0.86 : Math.min(vw * 0.6, 760);

  const down = (e) => {
    if (e.button && e.button !== 0) return;
    drag.current = { sx: e.clientX, sy: e.clientY, moved: false };
    const move = (ev) => {
      const d = ev.clientX - drag.current.sx;
      if (Math.abs(d) > 8) drag.current.moved = true;
      setDx(d);
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const d = ev.clientX - drag.current.sx;
      if (d < -50) go(1);
      else if (d > 50) go(-1);
      setDx(0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const tapPhoto = (p) => {
    if (drag.current?.moved) return;
    const now = Date.now();
    if (now - lastTap.current < 320) {
      clearTimeout(tapPhoto.t);
      lastTap.current = 0;
      like(p);
      return;
    }
    lastTap.current = now;
    tapPhoto.t = setTimeout(() => setBig(p), 330);
  };

  const cur = photos?.[idx];
  const offset = vw / 2 - slideW / 2 - idx * slideW + dx;

  return (
    <div className="hall" style={{ "--c": zone.color }}>
      <div className="hall-bg" />
      <header className="hall-top">
        <button className="back" onClick={() => router.push("/")}>← 로비</button>
        <div className="hall-title">
          <span className="badge">{zone.icon}</span>
          <div>
            <h1>{zone.name}</h1>
            <p>{zone.desc}</p>
          </div>
        </div>
        <div className="count">{photos?.length ? `${Math.min(idx + 1, photos.length)} / ${photos.length}` : ""}</div>
      </header>

      <div className="stage" onPointerDown={down}>
        {photos === null && <div className="loading">작품을 거는 중이에요…</div>}
        <div className="track" style={{ transform: `translateX(${offset}px)`, transition: dx ? "none" : undefined }}>
          {(photos || []).map((p, i) => {
            const n = (likes[photoKey(p.id)] || 0) + (pending[photoKey(p.id)] ? 1 : 0);
            const on = i === idx;
            return (
              <section key={p.id} className={`slide${on ? " on" : ""}`} style={{ width: slideW }} onClick={() => !on && !drag.current?.moved && setIdx(i)}>
                <div className="spot-light" />
                <figure className="frame">
                  <div className="mat">
                    <img src={p.img} alt={p.title} draggable={false} onClick={() => on && tapPhoto(p)} loading={Math.abs(i - idx) < 3 ? "eager" : "lazy"} />
                    {burst && burst.startsWith(p.id) && <span key={burst} className="burst">♥</span>}
                  </div>
                </figure>
                <div className="plaque">
                  <strong>{p.title || "제목 없음"}</strong>
                  {p.by && <span>{p.by}</span>}
                </div>
                <button className={`like${liked.has(p.id) ? " done" : ""}`} onClick={(e) => { e.stopPropagation(); like(p); }} tabIndex={on ? 0 : -1}>
                  <span className="heart">♥</span> {liked.has(p.id) ? "좋아요 했어요" : "좋아요"} <b>{n}</b>
                </button>
              </section>
            );
          })}
          {photos && (
            <section className={`slide end${idx === photos.length ? " on" : ""}`} style={{ width: slideW }}>
              <div className="end-card">
                {photos.length === 0 ? (
                  <>
                    <div className="end-emoji">🖼️</div>
                    <h2>아직 걸린 작품이 없어요</h2>
                    <p>곧 멋진 하늘 사진이 걸릴 거예요.</p>
                  </>
                ) : (
                  <>
                    <div className="end-emoji">🌈</div>
                    <h2>「{zone.name}」 관람을 마쳤어요!</h2>
                    <p>마음에 드는 작품에 좋아요를 남기셨나요?</p>
                  </>
                )}
                <button className="btn primary" style={{ "--c": next.color }} onClick={() => router.push(`/hall/${next.z}`)}>
                  다음 전시관 · {next.name} →
                </button>
                <button className="btn" onClick={() => router.push("/")}>로비로 돌아가기</button>
              </div>
            </section>
          )}
        </div>
        {idx > 0 && <button className="arrow left" onPointerDown={(e) => e.stopPropagation()} onClick={() => go(-1)} aria-label="이전 작품">‹</button>}
        {idx < total - 1 && <button className="arrow right" onPointerDown={(e) => e.stopPropagation()} onClick={() => go(1)} aria-label="다음 작품">›</button>}
      </div>

      <div className="floor-arrows">
        {cur ? "👆 옆으로 밀어 다음 작품으로" : ""}
      </div>

      {big && (
        <div className="lightbox" onClick={() => setBig(null)}>
          <img src={big.img} alt={big.title} />
          <div className="lb-cap">
            <strong>{big.title}</strong>
            {big.by && <span>{big.by}</span>}
          </div>
          <button className="lb-close" aria-label="닫기">✕</button>
        </div>
      )}
    </div>
  );
}
