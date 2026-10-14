"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ZONES, zoneOf, loadPhotos, sortPhotos, loadLikes, addLike, photoKey, getLiked, rememberLiked } from "../lib/store";

// 로비 그림(1672×941) 기준 좌표
const IW = 1672, IH = 941;
const SIGNS = [
  { z: 1, x: 1400, y: 436, w: 255, h: 84 },
  { z: 2, x: 1400, y: 526, w: 258, h: 84 },
  { z: 3, x: 1400, y: 614, w: 258, h: 86 },
];
const START = { x: 690, y: 765, w: 440, h: 120 };
// 로비 안쪽 흰 벽에 미리 걸어 두는 작은 액자 자리
const WALL = [
  { x: 585, y: 470, w: 110, h: 80 },
  { x: 800, y: 492, w: 72, h: 60 },
  { x: 995, y: 494, w: 82, h: 64 },
  { x: 1100, y: 494, w: 82, h: 64 },
  { x: 1318, y: 462, w: 68, h: 72 },
];
// 줌인할 때 화면 가운데로 오는 곳(안쪽 흰 벽)
const FOCUS = { x: 900, y: 520 };

export default function Expo({ startZone = null }) {
  const [size, setSize] = useState(null);
  const [panX, setPanX] = useState(null);
  const [zone, setZone] = useState(startZone ? Number(startZone) : null);
  const [photos, setPhotos] = useState(null);
  const [likes, setLikes] = useState({});
  const [pending, setPending] = useState({}); // 내가 방금 누른 좋아요(서버에서 아직 안 읽힌 것) — 두 번 세지 않게 따로 둔다
  const [liked, setLiked] = useState(new Set());
  const [idx, setIdx] = useState(0);
  const [dx, setDx] = useState(0);
  const [guide, setGuide] = useState(false);
  const [hint, setHint] = useState(true);
  const [big, setBig] = useState(null);
  const [burst, setBurst] = useState(null);
  const [anim, setAnim] = useState(false);
  const drag = useRef(null);
  const moved = useRef(false);
  const lastTap = useRef(0);
  const tapTimer = useRef(null);
  const likeSince = useRef(null);
  const seenLikes = useRef(new Set());

  const refreshPhotos = useCallback(() => {
    loadPhotos().then((list) => setPhotos(sortPhotos(list.filter((p) => !p.hidden)))).catch(() => setPhotos((p) => p || []));
  }, []);
  const refreshLikes = useCallback(() => {
    loadLikes(likeSince.current, seenLikes.current).then(({ add, last, ids }) => {
      if (last && (!likeSince.current || last > likeSince.current)) likeSince.current = last;
      if (ids.length) setPending((m) => { const seen = new Set(ids); const n = {}; for (const k in m) if (!seen.has(m[k])) n[k] = m[k]; return n; });
      if (Object.keys(add).length) setLikes((m) => { const n = { ...m }; for (const k in add) n[k] = (n[k] || 0) + add[k]; return n; });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const fit = () => setSize({ vw: window.innerWidth, vh: window.innerHeight });
    fit();
    window.addEventListener("resize", fit);
    setLiked(getLiked());
    refreshPhotos();
    refreshLikes();
    const t1 = setInterval(refreshPhotos, 30000);
    const t2 = setInterval(refreshLikes, 10000);
    try { if (!startZone && !sessionStorage.getItem("sky3-guide")) { setGuide(true); sessionStorage.setItem("sky3-guide", "1"); } } catch {}
    const pop = () => {
      const m = new URLSearchParams(location.search).get("z");
      setAnim(true);
      setZone(["1", "2", "3"].includes(m) ? Number(m) : null);
    };
    window.addEventListener("popstate", pop);
    return () => { clearInterval(t1); clearInterval(t2); window.removeEventListener("resize", fit); window.removeEventListener("popstate", pop); };
  }, [refreshPhotos, refreshLikes, startZone]);

  const list = zone && photos ? photos.filter((p) => Number(p.zone) === zone) : [];
  const total = list.length + 1; // 마지막 칸은 「다음 전시관」 안내
  const go = useCallback((d) => setIdx((i) => Math.max(0, Math.min(total - 1, i + d))), [total]);

  useEffect(() => {
    const key = (e) => {
      if (big) { if (e.key === "Escape") setBig(null); return; }
      if (!zone) return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "Escape") leave();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const enter = (z, at = 0) => {
    if (zone === z) return;
    setAnim(true);
    setIdx(at);
    setZone(z);
    setHint(false);
    history.pushState(null, "", `/?z=${z}`);
  };
  const leave = () => {
    setAnim(true);
    setZone(null);
    setBig(null);
    history.pushState(null, "", "/");
  };

  const like = (p) => {
    if (liked.has(p.id)) return;
    const key = photoKey(p.id);
    setPending((m) => ({ ...m, [key]: "…" }));
    setLiked((s) => new Set(s).add(p.id));
    rememberLiked(p.id);
    setBurst(p.id + "|" + Date.now());
    addLike(p.id).then((likeId) => setPending((m) => {
      const n = { ...m };
      if (seenLikes.current.has(likeId)) delete n[key]; else n[key] = likeId;
      return n;
    })).catch(() => {
      setPending((m) => { const n = { ...m }; delete n[key]; return n; });
      alert("좋아요를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    });
  };
  const likeCount = (p) => (likes[photoKey(p.id)] || 0) + (pending[photoKey(p.id)] ? 1 : 0);

  if (!size) return <div className="expo" />;
  const { vw, vh } = size;

  // ── 그림 위치: 로비(둘러보기) / 안(줌인) ──
  const k = Math.max(vw / IW, vh / IH);
  const w = IW * k, h = IH * k;
  const minX = Math.min(0, vw - w);
  const cx = panX == null ? minX / 2 : Math.max(minX, Math.min(0, panX));
  const ly = (vh - h) / 2;
  const narrow = vw / vh < 1;
  const kIn = narrow ? k * 2 : Math.max(k * 1.55, vw / 720);
  const fy = narrow ? 575 : FOCUS.y;
  const s = kIn / k;
  const clamp = (v, lo) => Math.max(lo, Math.min(0, v));
  const tx = clamp(vw / 2 - FOCUS.x * kIn, vw - IW * kIn);
  const ty = clamp(vh * 0.5 - fy * kIn, vh - IH * kIn);
  const layerT = zone ? `translate(${tx}px, ${ty}px) scale(${s})` : `translate(${cx}px, ${ly}px) scale(1)`;
  const canPan = !zone && minX < -4;

  // ── 로비 끌어서 둘러보기 / 안에서 작품 넘기기 ──
  const slotW = vw < 700 ? vw * 0.66 : Math.min(vw * 0.36, 480);
  const spacing = vw < 700 ? vw * 0.5 : slotW * 0.82;
  const down = (e) => {
    if (e.button && e.button !== 0) return;
    if (zone) {
      drag.current = { sx: e.clientX, moved: false };
      const move = (ev) => { const d = ev.clientX - drag.current.sx; if (Math.abs(d) > 8) drag.current.moved = true; setDx(d); };
      const up = (ev) => {
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
        const d = ev.clientX - drag.current.sx;
        const steps = Math.round(-d / spacing) || (d < -45 ? 1 : d > 45 ? -1 : 0);
        if (steps) go(steps);
        setDx(0);
      };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
      return;
    }
    drag.current = { sx: e.clientX, ox: cx };
    moved.current = false;
    setAnim(false);
    const move = (ev) => {
      const d = ev.clientX - drag.current.sx;
      if (Math.abs(d) > 6) { moved.current = true; setHint(false); }
      setPanX(drag.current.ox + d);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const tapLobby = (fn) => () => { if (!moved.current) fn(); };

  const tapPhoto = (p) => {
    if (drag.current?.moved) return;
    const now = Date.now();
    if (now - lastTap.current < 320) { clearTimeout(tapTimer.current); lastTap.current = 0; like(p); return; }
    lastTap.current = now;
    tapTimer.current = setTimeout(() => setBig(p), 330);
  };

  const counts = {};
  (photos || []).forEach((p) => (counts[p.zone] = (counts[p.zone] || 0) + 1));
  const wallPhotos = (photos || []).slice(0, WALL.length);
  const zn = zone ? zoneOf(zone) : null;
  const next = zn ? ZONES[zn.z % ZONES.length] : null;
  const pos = idx - dx / spacing;
  const cur = list[idx];

  return (
    <div className={`expo${zone ? " inside" : ""}`} onPointerDown={down}>
      <div className={`lobby-layer${anim ? " anim" : ""}`} style={{ width: w, height: h, transform: layerT }}>
        <img className="lobby-img" src="/lobby.jpg" alt="제3회 만삼 푸른하늘 사진 전시회 로비" draggable={false} />
        {WALL.map((s, i) => {
          const p = wallPhotos[i];
          if (!p) return null;
          return (
            <button key={p.id} className="wall-frame" style={{ left: s.x * k, top: s.y * k, width: s.w * k, height: s.h * k }}
              onClick={tapLobby(() => enter(Number(p.zone), Math.max(0, photos.filter((q) => Number(q.zone) === Number(p.zone)).findIndex((q) => q.id === p.id))))}
              aria-label={`${p.title} 보러 가기`} tabIndex={zone ? -1 : 0}>
              <img src={p.img} alt="" draggable={false} />
            </button>
          );
        })}
        {!zone && (
          <>
            {SIGNS.map((sg) => (
              <button key={sg.z} className="spot" style={{ left: sg.x * k, top: sg.y * k, width: sg.w * k, height: sg.h * k }}
                onClick={tapLobby(() => enter(sg.z))} aria-label={`${zoneOf(sg.z).name} 전시관으로 들어가기`} />
            ))}
            {SIGNS.map((sg) => (
              <span key={"n" + sg.z} className="spot-count" style={{ left: (sg.x + 14) * k, top: (sg.y + 8) * k, fontSize: Math.max(11, 22 * k) }}>{counts[sg.z] || 0}점</span>
            ))}
            <button className="spot start" style={{ left: START.x * k, top: START.y * k, width: START.w * k, height: START.h * k }}
              onClick={tapLobby(() => enter(1))} aria-label="전시 시작하기" />
            <button className="spot board" style={{ left: 30 * k, top: 330 * k, width: 330 * k, height: 470 * k }}
              onClick={tapLobby(() => setGuide(true))} aria-label="전시 관람 안내" />
          </>
        )}
      </div>

      {/* ── 로비 화면 ── */}
      {!zone && (
        <>
          {canPan && hint && vw < 900 && <div className="pan-hint">👆 옆으로 밀어서 로비를 둘러보세요</div>}
          <button className="guide-btn" onPointerDown={(e) => e.stopPropagation()} onClick={() => setGuide(true)}>❓ 관람 안내</button>
          {vw < 900 && <button className="start-btn" onPointerDown={(e) => e.stopPropagation()} onClick={() => enter(1)}>▶ 전시 시작하기</button>}
        </>
      )}

      {/* ── 전시관 안(줌인한 로비 위에 바로 전시) ── */}
      {zone && (
        <>
          <div className="veil" />
          <header className="hall-top" onPointerDown={(e) => e.stopPropagation()}>
            <button className="back" onClick={leave}>← 로비</button>
            <div className="hall-title" style={{ "--c": zn.color }}>
              <span className="badge">{zn.icon}</span>
              <h1>{zn.name}</h1>
            </div>
            <div className="count">{list.length ? `${Math.min(idx + 1, list.length)} / ${list.length}` : ""}</div>
          </header>

          <div className="carousel" style={{ "--slot": `${slotW}px` }}>
            {photos === null && <div className="loading">작품을 거는 중이에요…</div>}
            {list.map((p, i) => {
              const off = i - pos;
              const a = Math.abs(off);
              if (a > 3.2) return null;
              const sc = a <= 1 ? 1 - 0.4 * a : Math.max(0.35, 0.6 - 0.12 * (a - 1));
              const on = i === idx;
              return (
                <div key={p.id} className={`cf-item${on ? " on" : ""}${dx ? " dragging" : ""}`}
                  style={{ transform: `translate(-50%, -50%) translateX(${off * spacing}px) scale(${sc})`, zIndex: 100 - Math.round(a * 10), opacity: a > 2.6 ? 0 : 1 - Math.min(a, 2) * 0.18, filter: on ? "none" : "saturate(.8) brightness(.96)" }}
                  onClick={() => { if (drag.current?.moved) return; on ? tapPhoto(p) : setIdx(i); }}>
                  <figure className="frame">
                    <div className="mat">
                      <img src={p.img} alt={p.title} draggable={false} loading={a < 2.5 ? "eager" : "lazy"} />
                      {burst && burst.startsWith(p.id + "|") && <span key={burst} className="burst">♥</span>}
                    </div>
                  </figure>
                </div>
              );
            })}
            {photos && (() => {
              const off = list.length - pos;
              const a = Math.abs(off);
              if (a > 3.2) return null;
              const sc = a <= 1 ? 1 - 0.4 * a : 0.5;
              return (
                <div className={`cf-item end${idx === list.length ? " on" : ""}${dx ? " dragging" : ""}`}
                  style={{ transform: `translate(-50%, -50%) translateX(${off * spacing}px) scale(${sc})`, zIndex: 100 - Math.round(a * 10), opacity: a > 2.6 ? 0 : 1 }}
                  onClick={() => !drag.current?.moved && idx !== list.length && setIdx(list.length)}>
                  <div className="end-card" onPointerDown={(e) => idx === list.length && e.stopPropagation()}>
                    {list.length === 0 ? (
                      <><div className="end-emoji">🖼️</div><h2>아직 걸린 작품이 없어요</h2><p>곧 멋진 하늘 사진이 걸릴 거예요.</p></>
                    ) : (
                      <><div className="end-emoji">🌈</div><h2>「{zn.name}」 관람을 마쳤어요!</h2><p>마음에 드는 작품에 좋아요를 남기셨나요?</p></>
                    )}
                    <button className="btn primary" style={{ "--c": next.color }} onClick={() => enter(next.z)}>다음 전시관 · {next.name} →</button>
                    <button className="btn" onClick={leave}>로비로 나가기</button>
                  </div>
                </div>
              );
            })()}
            {idx > 0 && <button className="arrow left" onPointerDown={(e) => e.stopPropagation()} onClick={() => go(-1)} aria-label="이전 작품">‹</button>}
            {idx < total - 1 && <button className="arrow right" onPointerDown={(e) => e.stopPropagation()} onClick={() => go(1)} aria-label="다음 작품">›</button>}
          </div>

          <div className="caption" onPointerDown={(e) => e.stopPropagation()}>
            {cur && (
              <div key={cur.id} className="caption-in">
                <div className="plaque" style={{ "--c": zn.color }}>
                  <strong>{cur.title || "제목 없음"}</strong>
                  {cur.by && <span>{cur.by}</span>}
                </div>
                <button className={`like${liked.has(cur.id) ? " done" : ""}`} onClick={() => like(cur)}>
                  <span className="heart">♥</span> {liked.has(cur.id) ? "좋아요 했어요" : "좋아요"} <b>{likeCount(cur)}</b>
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <nav className={`hall-tabs${!zone && vw >= 900 && vw / vh > 1.45 ? " wide" : ""}`} onPointerDown={(e) => e.stopPropagation()}>
        {ZONES.map((z) => (
          <button key={z.z} className={zone === z.z ? "on" : ""} style={{ "--c": z.color }} onClick={() => enter(z.z)}>
            <b>{z.icon}</b>
            <span>{z.name}</span>
            <i>{counts[z.z] || 0}점</i>
          </button>
        ))}
      </nav>

      {big && (
        <div className="lightbox" onPointerDown={(e) => e.stopPropagation()} onClick={() => setBig(null)}>
          <img src={big.img} alt={big.title} />
          <div className="lb-cap"><strong>{big.title}</strong>{big.by && <span>{big.by}</span>}</div>
          <button className="lb-close" aria-label="닫기">✕</button>
        </div>
      )}

      {guide && (
        <div className="modal" onPointerDown={(e) => e.stopPropagation()} onClick={() => setGuide(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>🌤️ 전시 관람 안내</h2>
            <ol className="guide-list">
              <li><b>로비 둘러보기</b> 화면을 옆으로 밀면 로비를 둘러볼 수 있어요. 안쪽 흰 벽에도 작품이 걸려 있어요.</li>
              <li><b>전시 시작하기</b> 바닥의 「전시 시작하기」나 오른쪽 나무 표지판을 누르면 전시장 안으로 쏙 들어가요.</li>
              <li><b>작품 넘겨 보기</b> 옆으로 밀거나 ‹ › 를 누르면 다음 작품이 가운데로 크게 와요.</li>
              <li><b>가까이 보기</b> 가운데 사진을 한 번 누르면 크게 볼 수 있어요.</li>
              <li><b>좋아요 남기기</b> ♥ 좋아요를 누르거나 사진을 두 번 톡톡 눌러 주세요.</li>
            </ol>
            <button className="btn primary" onClick={() => setGuide(false)}>전시 보러 가기</button>
          </div>
        </div>
      )}
    </div>
  );
}
