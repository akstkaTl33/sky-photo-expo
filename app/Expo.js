"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadZones, visibleZones, zoneOf, loadPhotos, sortPhotos, loadVotes, loadMyVotes, castVote, photoKey, loadComments, addComment, deleteComment, adminPin } from "../lib/store";

// 로비 그림(1672×941) 기준 좌표
const IW = 1672, IH = 941;
const SIGNS = [
  { z: 1, x: 1400, y: 436, w: 255, h: 84 },
  { z: 2, x: 1400, y: 526, w: 258, h: 84 },
  { z: 3, x: 1400, y: 614, w: 258, h: 86 },
];
// 전시관이 4개일 때: 같은 기둥에 판 4개를 조금 좁게 나눠 단다.
const BOARD4 = (i) => ({ x: 1398, y: 436 + i * 67, w: 262, h: 62 });
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
  const [zones, setZones] = useState(null); // 관리 화면에서 정한 전시관 (숨긴 것 포함)
  const [likes, setLikes] = useState({}); // { 작품키: 표 수 }
  const [liked, setLiked] = useState(new Set()); // 이 인터넷 연결에서 투표한 작품키
  const [comments, setComments] = useState({}); // { 작품키: [댓글] }
  const [talk, setTalk] = useState(null); // 댓글 창을 연 작품
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
  const voting = useRef(0); // 투표를 보내는 중이면 숫자를 새로 읽어 와도 덮어쓰지 않는다

  const refreshPhotos = useCallback(() => {
    loadPhotos().then((list) => setPhotos(sortPhotos(list.filter((p) => !p.hidden)))).catch(() => setPhotos((p) => p || []));
  }, []);
  const refreshLikes = useCallback(() => {
    loadVotes().then((v) => { if (!voting.current) setLikes(v); }).catch(() => {});
  }, []);
  const refreshZones = useCallback(() => {
    loadZones().then(setZones).catch(() => {});
  }, []);
  const refreshComments = useCallback(() => {
    loadComments().then(setComments).catch(() => {});
  }, []);

  useEffect(() => {
    const fit = () => setSize({ vw: window.innerWidth, vh: window.innerHeight });
    fit();
    window.addEventListener("resize", fit);
    loadMyVotes().then(setLiked).catch(() => {});
    refreshPhotos();
    refreshLikes();
    refreshComments();
    refreshZones();
    const t1 = setInterval(() => { refreshPhotos(); refreshComments(); refreshZones(); }, 30000);
    const t2 = setInterval(refreshLikes, 10000);
    setGuide(true); // 사이트에 들어올 때마다 관람 안내를 먼저 띄운다
    const pop = () => {
      const m = new URLSearchParams(location.search).get("z");
      setAnim(true);
      setZone(/^\d+$/.test(m || "") ? Number(m) : null);
    };
    window.addEventListener("popstate", pop);
    return () => { clearInterval(t1); clearInterval(t2); window.removeEventListener("resize", fit); window.removeEventListener("popstate", pop); };
  }, [refreshPhotos, refreshLikes, refreshComments, refreshZones, startZone]);

  // 관람객에게는 숨기지 않은 전시관과 그 안의 작품만 보인다. 보이는 전시관이 1개면 전시관 구분 없이 한 곳에 건다.
  const shown = zones ? visibleZones(zones) : [];
  const single = shown.length === 1;
  const seen = photos && zones ? photos.filter((p) => shown.some((z) => z.z === Number(p.zone))) : null;
  const first = shown[0]?.z;
  useEffect(() => {
    if (zones && zone && !shown.some((z) => z.z === zone)) setZone(null); // 숨기거나 지운 전시관 주소로 들어온 경우
  }, [zones, zone]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = zone && seen ? seen.filter((p) => Number(p.zone) === zone) : [];
  const total = list.length + 1; // 마지막 칸은 「다음 전시관」 안내
  const go = useCallback((d) => setIdx((i) => Math.max(0, Math.min(total - 1, i + d))), [total]);

  useEffect(() => {
    const key = (e) => {
      if (talk) { if (e.key === "Escape") setTalk(null); return; }
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
    if (!z || zone === z) return;
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
    const key = photoKey(p.id);
    if (liked.has(key)) return;
    const bump = (d) => setLikes((m) => ({ ...m, [key]: Math.max(0, (m[key] || 0) + d) }));
    setLiked((s) => new Set(s).add(key));
    bump(1);
    setBurst(p.id + "|" + Date.now());
    voting.current++;
    castVote(p.id).then(({ already }) => {
      if (already) bump(-1); // 같은 인터넷 연결에서 이미 투표한 작품 — 숫자는 그대로
    }).catch((e) => {
      bump(-1);
      setLiked((s) => { const n = new Set(s); n.delete(key); return n; });
      alert(e.message + " 잠시 뒤 다시 눌러 주세요.");
    }).finally(() => { voting.current--; });
  };
  const likeCount = (p) => likes[photoKey(p.id)] || 0;
  const isLiked = (p) => liked.has(photoKey(p.id));
  const talkOf = (p) => comments[photoKey(p.id)] || [];

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
  (seen || []).forEach((p) => (counts[p.zone] = (counts[p.zone] || 0) + 1));
  const wallPhotos = (seen || []).slice(0, WALL.length);
  const zn = zone && zones ? zoneOf(zones, zone) : null;
  const next = zn && !single ? shown[(shown.findIndex((z) => z.z === zn.z) + 1) % shown.length] : null;

  // 로비 나무 표지판: 그림 속 판 3개 위에 같은 모양의 판을 덧대 전시관 이름을 적는다.
  // 전시관이 4개면 판 4개를 좁게 다시 나누고, 3개보다 적으면 남는 판에 안내·시작 단추를 단다.
  const boards = shown.length > 3
    ? shown.map((z, i) => ({ key: z.z, ...BOARD4(i), z }))
    : [
        ...shown.map((z) => ({ z })),
        { key: "guide", icon: "❓", name: "관람 안내", act: () => setGuide(true) },
        { key: "go", icon: "♥", name: "투표하러 가기", act: () => enter(first) },
      ].slice(0, 3).map((b, i) => ({ key: b.z ? b.z.z : b.key, x: SIGNS[i].x, y: SIGNS[i].y, w: SIGNS[i].w, h: SIGNS[i].h, ...b }));
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
              onClick={tapLobby(() => enter(Number(p.zone), Math.max(0, seen.filter((q) => Number(q.zone) === Number(p.zone)).findIndex((q) => q.id === p.id))))}
              aria-label={`${p.title} 보러 가기`} tabIndex={zone ? -1 : 0}>
              <img src={p.img} alt="" draggable={false} />
            </button>
          );
        })}
        {!zone && (
          <>
            {zones && boards.map((b) => (
              <button key={b.key} className="sign-board" style={{ left: b.x * k, top: b.y * k, width: b.w * k, height: b.h * k, fontSize: Math.min(b.h * 0.34, 26) * k, "--c": b.z?.color || "#c99a5b" }}
                onClick={tapLobby(b.z ? () => enter(b.z.z) : b.act)} aria-label={b.z ? `${b.z.name} 전시관으로 들어가기` : b.name}>
                <i>{b.z ? b.z.icon : b.icon}</i>
                <span>{b.z ? b.z.name : b.name}</span>
                {b.z && <em>{counts[b.z.z] || 0}점</em>}
              </button>
            ))}
            <button className="spot start" style={{ left: START.x * k, top: START.y * k, width: START.w * k, height: START.h * k }}
              onClick={tapLobby(() => enter(first))} aria-label="전시 시작하기" />
            <button className="spot board" style={{ left: 30 * k, top: 330 * k, width: 330 * k, height: 470 * k }}
              onClick={tapLobby(() => setGuide(true))} aria-label="전시 관람 안내" />
          </>
        )}
      </div>

      {/* ── 로비 화면 ── */}
      {!zone && (
        <>
          {canPan && hint && vw < 900 && <div className="pan-hint">👆 옆으로 밀어서 로비를 둘러보세요</div>}
          <a className="admin-btn" href="/admin" onPointerDown={(e) => e.stopPropagation()}>⚙️ 관리자</a>
          <button className="guide-btn" onPointerDown={(e) => e.stopPropagation()} onClick={() => setGuide(true)}>❓ 관람 안내</button>
          {vw < 900 && <button className="start-btn" onPointerDown={(e) => e.stopPropagation()} onClick={() => enter(first)}>▶ 전시 시작하기</button>}
        </>
      )}

      {/* ── 전시관 안(줌인한 로비 위에 바로 전시) ── */}
      {zone && zn && (
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
                    {next
                      ? <button className="btn primary" style={{ "--c": next.color }} onClick={() => enter(next.z)}>다음 전시관 · {next.name} →</button>
                      : list.length > 0 && <button className="btn primary" style={{ "--c": zn.color }} onClick={() => setIdx(0)}>↺ 처음부터 다시 보기</button>}
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
                {liked.size === 0 && <div className="like-bubble">마음에 들면 ♥ 눌러 주세요!</div>}
                <div className="caption-btns">
                  <button className={`like${isLiked(cur) ? " done" : " pulse"}`} onClick={() => like(cur)}>
                    <span className="heart">♥</span> {isLiked(cur) ? "좋아요 했어요" : "좋아요"} <b>{likeCount(cur)}</b>
                  </button>
                  <button className="talk-btn" onClick={() => setTalk(cur)}>
                    💬 댓글 <b>{talkOf(cur).length}</b>
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {shown.length > 1 && <nav className={`hall-tabs${!zone && vw >= 900 && vw / vh > 1.45 ? " wide" : ""}`} onPointerDown={(e) => e.stopPropagation()}>
        {shown.map((z) => (
          <button key={z.z} className={zone === z.z ? "on" : ""} style={{ "--c": z.color }} onClick={() => enter(z.z)}>
            <b>{z.icon}</b>
            <span>{z.name}</span>
            <i>{counts[z.z] || 0}점</i>
          </button>
        ))}
      </nav>}

      {big && (
        <div className="lightbox" onPointerDown={(e) => e.stopPropagation()} onClick={() => setBig(null)}>
          <img src={big.img} alt={big.title} />
          <div className="lb-cap"><strong>{big.title}</strong>{big.by && <span>{big.by}</span>}</div>
          <button className="lb-close" aria-label="닫기">✕</button>
        </div>
      )}

      {talk && (
        <Comments photo={talk} list={talkOf(talk)} onClose={() => setTalk(null)}
          onAdd={(c) => setComments((m) => ({ ...m, [c.photo]: [...(m[c.photo] || []), c] }))}
          onRemove={(c) => setComments((m) => ({ ...m, [c.photo]: (m[c.photo] || []).filter((x) => x.id !== c.id) }))} />
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
              <li><b>댓글 남기기</b> 작품 아래 「💬 댓글」을 누르면 응원의 말을 남길 수 있어요.</li>
            </ol>
            <div className="like-ask">
              <div className="like-ask-heart">♥</div>
              <div>
                <b>마음에 드는 작품에 좋아요를 눌러 주세요!</b>
                <p>작품 아래 <span>♥ 좋아요</span> 단추를 누르거나 사진을 두 번 톡톡 누르면 돼요. 아이들에게 큰 응원이 됩니다.</p>
              </div>
            </div>
            <button className="btn primary" onClick={() => setGuide(false)}>♥ 좋아요 누르러 전시 보러 가기</button>
          </div>
        </div>
      )}
    </div>
  );
}

// 작품 하나의 댓글 창 — 내용만 쓰고, 관리자로 들어온 기기에서는 🗑로 지울 수 있다.
function Comments({ photo, list, onClose, onAdd, onRemove }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");
  const end = useRef(null);
  useEffect(() => { setPin(adminPin()); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [list.length]);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      onAdd(await addComment(photo.id, body));
      setText("");
    } catch (err) {
      alert(err.message);
    }
    setBusy(false);
  };
  const remove = async (c) => {
    if (!window.confirm("이 댓글을 지울까요?")) return;
    try {
      await deleteComment(c.id, pin);
      onRemove(c);
    } catch (err) {
      alert(err.message);
    }
  };
  const when = (t) => new Date(t).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="modal" onPointerDown={(e) => e.stopPropagation()} onClick={onClose}>
      <div className="modal-box talk" onClick={(e) => e.stopPropagation()}>
        <button className="talk-close" onClick={onClose} aria-label="닫기">✕</button>
        <h2>💬 {photo.title || "제목 없음"}</h2>
        <div className="talk-list">
          {list.length === 0 && <p className="talk-empty">첫 댓글을 남겨 주세요!</p>}
          {list.map((c) => (
            <div key={c.id} className="talk-item">
              <p>{c.body}</p>
              <span>{when(c.created_at)}</span>
              {pin && <button className="talk-del" onClick={() => remove(c)} aria-label="댓글 지우기">🗑</button>}
            </div>
          ))}
          <div ref={end} />
        </div>
        <form className="talk-form" onSubmit={send}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={300} rows={2} placeholder="작품에 응원의 말을 남겨 주세요" />
          <button className="btn primary" disabled={busy || !text.trim()}>{busy ? "올리는 중…" : "올리기"}</button>
        </form>
      </div>
    </div>
  );
}
