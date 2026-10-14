"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ZONES, loadPhotos } from "../lib/store";

// 로비 그림(1672×941) 위 누를 수 있는 자리 — 그림 속 표지판 3개와 바닥의 「전시 시작하기」
const IW = 1672, IH = 941;
const SPOTS = [
  { z: 1, x: 1400, y: 436, w: 255, h: 84, label: "하늘을 만나는 길" },
  { z: 2, x: 1400, y: 526, w: 258, h: 84, label: "우리가 본 하늘" },
  { z: 3, x: 1400, y: 614, w: 258, h: 86, label: "함께하는 하늘" },
  { z: 1, x: 690, y: 765, w: 440, h: 120, label: "전시 시작하기", start: true },
];

export default function Lobby() {
  const router = useRouter();
  const [size, setSize] = useState(null);
  const [x, setX] = useState(null);
  const [entering, setEntering] = useState(null);
  const [counts, setCounts] = useState({});
  const [guide, setGuide] = useState(false);
  const [hint, setHint] = useState(true);
  const drag = useRef(null);
  const moved = useRef(false);

  useEffect(() => {
    const fit = () => setSize({ vw: window.innerWidth, vh: window.innerHeight });
    fit();
    window.addEventListener("resize", fit);
    loadPhotos().then((list) => {
      const c = {};
      list.filter((p) => !p.hidden).forEach((p) => (c[p.zone] = (c[p.zone] || 0) + 1));
      setCounts(c);
    }).catch(() => {});
    try { if (!sessionStorage.getItem("sky3-guide")) { setGuide(true); sessionStorage.setItem("sky3-guide", "1"); } } catch {}
    ["/hall/1", "/hall/2", "/hall/3"].forEach((p) => router.prefetch(p));
    return () => window.removeEventListener("resize", fit);
  }, [router]);

  if (!size) return <div className="lobby" />;
  const k = Math.max(size.vw / IW, size.vh / IH);
  const w = IW * k, h = IH * k;
  const minX = Math.min(0, size.vw - w);
  const cx = x == null ? minX / 2 : Math.max(minX, Math.min(0, x));
  const y = (size.vh - h) / 2;
  const canPan = minX < -4;

  const down = (e) => {
    drag.current = { sx: e.clientX, ox: cx };
    moved.current = false;
    const move = (ev) => {
      const dx = ev.clientX - drag.current.sx;
      if (Math.abs(dx) > 6) { moved.current = true; setHint(false); }
      setX(drag.current.ox + dx);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const enter = (spot, fromTab) => {
    if ((!fromTab && moved.current) || entering) return;
    const ox = (spot.x + spot.w / 2) * k, oy = (spot.y + spot.h / 2) * k;
    setEntering({ ox, oy });
    setTimeout(() => router.push(`/hall/${spot.z}`), 850);
  };

  return (
    <div className="lobby" onPointerDown={down}>
      <div
        className={`lobby-layer${entering ? " zoom" : ""}`}
        style={{ width: w, height: h, transform: `translate(${cx}px, ${y}px) scale(var(--s, 1))`, transformOrigin: entering ? `${entering.ox}px ${entering.oy}px` : undefined }}
      >
        <img src="/lobby.jpg" alt="제3회 만삼 푸른하늘 사진 전시회 로비" draggable={false} />
        {SPOTS.map((s, i) => (
          <button
            key={i}
            className={`spot${s.start ? " start" : ""}`}
            style={{ left: s.x * k, top: s.y * k, width: s.w * k, height: s.h * k }}
            onClick={() => enter(s)}
            aria-label={`${s.label} 전시관으로 들어가기`}
          />
        ))}
        {SPOTS.slice(0, 3).map((s, i) => (
          <span key={"n" + i} className="spot-count" style={{ left: (s.x + 14) * k, top: (s.y + 8) * k, fontSize: Math.max(11, 22 * k) }}>{counts[s.z] || 0}점</span>
        ))}
        <button className="spot board" style={{ left: 30 * k, top: 330 * k, width: 330 * k, height: 470 * k }} onClick={() => !moved.current && setGuide(true)} aria-label="전시 관람 안내" />
      </div>
      {entering && <div className="whiteout" />}

      {canPan && hint && size.vw < 900 && <div className="pan-hint">👆 옆으로 밀어서 로비를 둘러보세요</div>}
      <button className="guide-btn" onClick={() => setGuide(true)}>❓ 관람 안내</button>

      <nav className={`hall-tabs${size.vw >= 900 && size.vw / size.vh > 1.45 ? " wide" : ""}`} onPointerDown={(e) => e.stopPropagation()}>
        {ZONES.map((zn) => (
          <button key={zn.z} style={{ "--c": zn.color }} onClick={() => enter(SPOTS[zn.z - 1], true)}>
            <b>{zn.icon}</b>
            <span>{zn.name}</span>
            <i>{counts[zn.z] || 0}점</i>
          </button>
        ))}
      </nav>

      {guide && (
        <div className="modal" onPointerDown={(e) => e.stopPropagation()} onClick={() => setGuide(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>🌤️ 전시 관람 안내</h2>
            <ol className="guide-list">
              <li><b>로비 둘러보기</b> 화면을 옆으로 밀면 로비를 둘러볼 수 있어요.</li>
              <li><b>전시관 들어가기</b> 바닥의 「전시 시작하기」나 오른쪽 나무 표지판, 아래 단추를 누르면 전시관으로 들어가요.</li>
              <li><b>작품 넘겨 보기</b> 손가락으로 옆으로 밀거나 ◀ ▶ 를 누르면 다음 작품으로 넘어가요.</li>
              <li><b>가까이 보기</b> 사진을 한 번 누르면 크게 볼 수 있어요.</li>
              <li><b>좋아요 남기기</b> 마음에 드는 작품에 ♥ 좋아요를 눌러 주세요. 사진을 두 번 톡톡 눌러도 돼요.</li>
            </ol>
            <button className="btn primary" onClick={() => setGuide(false)}>전시 보러 가기</button>
          </div>
        </div>
      )}
    </div>
  );
}
