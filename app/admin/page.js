"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { DEFAULT_ZONES, MAX_ZONES, COLORS, loadZones, saveZones, zoneOf, checkPin, rememberAdmin, adminPin, loadPhotos, sortPhotos, addPhoto, updatePhoto, shrinkImage, uploadPhoto, loadVotes, photoKey } from "../../lib/store";

export default function Admin() {
  const [ok, setOk] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (adminPin()) setOk(true);
  }, []);

  const login = async (e) => {
    e.preventDefault();
    if (await checkPin(pin)) {
      setOk(true);
      rememberAdmin(pin);
    } else setErr("비밀번호가 맞지 않아요.");
  };

  if (!ok)
    return (
      <main className="admin">
        <form className="card login" onSubmit={login}>
          <h1>🔒 전시회 관리</h1>
          <p>작품을 걸고 고치는 화면이에요.</p>
          <input type="password" inputMode="numeric" placeholder="관리 비밀번호" value={pin} onChange={(e) => { setPin(e.target.value); setErr(""); }} autoFocus />
          {err && <p className="err">{err}</p>}
          <button className="btn primary">들어가기</button>
          <a className="btn" href="/">← 전시회로 돌아가기</a>
        </form>
      </main>
    );
  return <Manager />;
}

function Manager() {
  const [zones, setZones] = useState(null);
  const [zone, setZone] = useState(1);
  const [drafts, setDrafts] = useState([]);
  const [busy, setBusy] = useState("");
  const [photos, setPhotos] = useState([]);
  const [likes, setLikes] = useState({});
  const [view, setView] = useState(1);
  const [qr, setQr] = useState("");
  const [site, setSite] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = async () => {
    const list = await loadPhotos();
    setPhotos(sortPhotos(list));
    setLikes(await loadVotes());
    const zs = await loadZones();
    setZones(zs);
    const has = (z) => zs.some((x) => x.z === z);
    setZone((z) => (has(z) ? z : zs[0].z));
    setView((z) => (has(z) ? z : zs[0].z));
  };
  useEffect(() => {
    refresh().catch((e) => alert(e.message));
    const url = window.location.origin;
    setSite(url);
    QRCode.toDataURL(url, { width: 360, margin: 1 }).then(setQr);
  }, []);

  const pick = (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    setDrafts((d) => [
      ...d,
      ...files.map((f) => ({ key: Math.random().toString(36).slice(2), file: f, url: URL.createObjectURL(f), title: f.name.replace(/\.[^.]+$/, "").replace(/^(IMG|KakaoTalk|Screenshot)[_\-\s\d]*$/i, ""), by: "" })),
    ]);
  };
  const setDraft = (key, patch) => setDrafts((d) => d.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const publish = async () => {
    if (!drafts.length) return;
    const empty = drafts.find((d) => !d.title.trim());
    if (empty) return alert("작품 이름을 모두 적어 주세요.");
    try {
      for (let i = 0; i < drafts.length; i++) {
        setBusy(`${i + 1} / ${drafts.length} 작품을 거는 중…`);
        const d = drafts[i];
        const { blob, w, h } = await shrinkImage(d.file);
        const img = await uploadPhoto(blob);
        await addPhoto({ title: d.title.trim(), by: d.by.trim(), zone, img, w, h });
      }
      setDrafts([]);
      setView(zone);
      await refresh();
      setBusy("");
      alert(`「${zoneOf(zones, zone).name}」 전시관에 작품을 걸었어요!`);
    } catch (e) {
      setBusy("");
      alert("작품을 걸지 못했어요: " + e.message);
      refresh();
    }
  };

  const save = async (p, patch) => {
    try {
      const n = await updatePhoto(p, patch);
      setPhotos((list) => sortPhotos(list.map((x) => (x.id === p.id ? { ...x, ...n } : x))));
    } catch (e) {
      alert("저장하지 못했어요: " + e.message);
    }
  };
  const swap = async (a, b) => {
    if (!a || !b) return;
    const oa = a.order ?? 0, ob = b.order ?? 0;
    await save(a, { order: ob === oa ? ob + 1 : ob });
    await save(b, { order: oa });
  };

  const inZone = photos.filter((p) => Number(p.zone) === view);
  if (!zones) return <main className="admin"><p className="tip">불러오는 중…</p></main>;

  return (
    <main className="admin">
      <header className="admin-head">
        <h1>🌤️ 만삼 푸른하늘 사진 전시회 · 관리</h1>
        <a className="btn" href="/">← 전시회로 돌아가기</a>
      </header>

      <section className="card">
        <h2>① 학부모님께 보낼 주소</h2>
        <div className="share">
          {qr && <img src={qr} alt="전시회 QR" />}
          <div>
            <p className="url">{site}</p>
            <button className="btn primary" onClick={() => { navigator.clipboard.writeText(site); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? "복사했어요 ✓" : "📋 주소 복사하기"}
            </button>
            <p className="tip">QR 그림은 길게 눌러(또는 오른쪽 클릭) 저장해 안내문에 넣을 수 있어요.</p>
          </div>
        </div>
      </section>

      <HallManager zones={zones} photos={photos} onSaved={(zs) => { setZones(zs); setZone((z) => (zs.some((x) => x.z === z) ? z : zs[0].z)); setView((z) => (zs.some((x) => x.z === z) ? z : zs[0].z)); }} />

      <section className="card">
        <h2>③ 작품 걸기</h2>
        <p className="label">어느 전시관에 걸까요?</p>
        <div className="chips">
          {zones.map((zn) => (
            <button key={zn.z} className={`chip${zone === zn.z ? " on" : ""}`} style={{ "--c": zn.color }} onClick={() => setZone(zn.z)}>
              {zn.icon} {zn.name}{zn.hidden ? " (숨김)" : ""}
            </button>
          ))}
        </div>
        <label className="btn pickbtn">
          📷 사진 고르기 (여러 장 가능)
          <input type="file" accept="image/*" multiple hidden onChange={pick} />
        </label>
        {drafts.length > 0 && (
          <>
            <div className="drafts">
              {drafts.map((d) => (
                <div key={d.key} className="draft">
                  <img src={d.url} alt="" />
                  <div>
                    <input placeholder="작품 이름 (꼭 적어 주세요)" value={d.title} onChange={(e) => setDraft(d.key, { title: e.target.value })} />
                    <input placeholder="찍은 사람 (예: 해님반 김하늘 가족) — 비워도 돼요" value={d.by} onChange={(e) => setDraft(d.key, { by: e.target.value })} />
                  </div>
                  <button className="x" onClick={() => setDrafts((list) => list.filter((x) => x.key !== d.key))} aria-label="빼기">✕</button>
                </div>
              ))}
            </div>
            <button className="btn primary big" disabled={!!busy} onClick={publish}>
              {busy || `🖼️ 「${zoneOf(zones, zone).name}」에 ${drafts.length}점 전시하기`}
            </button>
          </>
        )}
      </section>

      <section className="card">
        <h2>④ 걸린 작품 고치기</h2>
        <div className="chips">
          {zones.map((zn) => (
            <button key={zn.z} className={`chip${view === zn.z ? " on" : ""}`} style={{ "--c": zn.color }} onClick={() => setView(zn.z)}>
              {zn.icon} {zn.name}{zn.hidden ? " · 숨김" : ""} ({photos.filter((p) => Number(p.zone) === zn.z && !p.hidden).length})
            </button>
          ))}
        </div>
        {inZone.length === 0 && <p className="tip">이 전시관에는 아직 작품이 없어요.</p>}
        <div className="items">
          {inZone.map((p, i) => (
            <Item key={p.id} p={p} zones={zones} n={likes[photoKey(p.id)] || 0} onSave={save} onUp={() => swap(p, inZone[i - 1])} onDown={() => swap(p, inZone[i + 1])} first={i === 0} last={i === inZone.length - 1} />
          ))}
        </div>
      </section>
    </main>
  );
}

function Item({ p, zones, n, onSave, onUp, onDown, first, last }) {
  const [title, setTitle] = useState(p.title || "");
  const [by, setBy] = useState(p.by || "");
  const dirty = title !== (p.title || "") || by !== (p.by || "");
  return (
    <div className={`item${p.hidden ? " hid" : ""}`}>
      <img src={p.img} alt="" />
      <div className="item-body">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="작품 이름" />
        <input value={by} onChange={(e) => setBy(e.target.value)} placeholder="찍은 사람" />
        <div className="item-row">
          <span className="hearts">♥ {n}</span>
          {dirty && <button className="btn primary sm" onClick={() => onSave(p, { title: title.trim(), by: by.trim() })}>저장</button>}
          <select value={p.zone} onChange={(e) => onSave(p, { zone: Number(e.target.value) })}>
            {zones.map((zn) => <option key={zn.z} value={zn.z}>{zn.name}</option>)}
          </select>
          <button className="btn sm" disabled={first} onClick={onUp}>▲</button>
          <button className="btn sm" disabled={last} onClick={onDown}>▼</button>
          <button className="btn sm" onClick={() => onSave(p, { hidden: !p.hidden })}>{p.hidden ? "다시 걸기" : "내리기"}</button>
        </div>
        {p.hidden && <p className="tip">내린 작품이에요 (관람객에게 안 보여요)</p>}
      </div>
    </div>
  );
}

// 전시관 늘리기·줄이기·숨기기. 고친 뒤 「저장」을 눌러야 전시회에 반영된다.
// 보이는 전시관이 1개면 전시회는 전시관 구분 없이 모든 작품을 한 곳에 건다.
function HallManager({ zones, photos, onSaved }) {
  const [list, setList] = useState(zones);
  const [busy, setBusy] = useState(false);
  useEffect(() => setList(zones), [zones]);

  const dirty = JSON.stringify(list) !== JSON.stringify(zones);
  const countOf = (z) => photos.filter((p) => Number(p.zone) === z).length;
  const shown = list.filter((h) => !h.hidden).length;
  const set = (z, patch) => setList((l) => l.map((h) => (h.z === z ? { ...h, ...patch } : h)));
  const move = (i, d) => setList((l) => {
    const n = [...l];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    return n;
  });
  const add = () => setList((l) => {
    const z = Math.max(0, ...l.map((h) => h.z), ...photos.map((p) => Number(p.zone) || 0)) + 1;
    return [...l, { z, name: `${l.length + 1}전시관`, icon: "⭐", color: COLORS[l.length % COLORS.length], hidden: false }];
  });
  const remove = (h) => {
    const n = countOf(h.z);
    if (n) return alert(`「${h.name}」에 작품이 ${n}점 있어요. 작품을 다른 전시관으로 옮기거나, 지우는 대신 「숨기기」를 눌러 주세요.`);
    if (list.length === 1) return alert("전시관은 1개 이상 있어야 해요.");
    setList((l) => l.filter((x) => x.z !== h.z));
  };
  const save = async () => {
    const clean = list.map((h) => ({ ...h, name: h.name.trim(), icon: h.icon.trim() || "⭐" }));
    if (clean.some((h) => !h.name)) return alert("전시관 이름을 모두 적어 주세요.");
    if (!clean.some((h) => !h.hidden)) return alert("보이는 전시관이 1개 이상 있어야 해요.");
    setBusy(true);
    try {
      await saveZones(clean);
      onSaved(clean);
      alert("전시관 설정을 저장했어요!");
    } catch (e) {
      alert("저장하지 못했어요: " + e.message);
    }
    setBusy(false);
  };

  return (
    <section className="card">
      <h2>② 전시관 관리</h2>
      <p className="tip">
        전시관은 {MAX_ZONES}개까지 만들 수 있어요. 지금 관람객에게 보이는 전시관은 <b>{shown}개</b>예요.
        {shown === 1 ? " 1개일 때는 전시관 구분 없이 모든 작품을 한 곳에 전시해요." : ""}
      </p>
      <div className="halls">
        {list.map((h, i) => (
          <div key={h.z} className={`hall-row${h.hidden ? " hid" : ""}`} style={{ "--c": h.color }}>
            <input className="hall-icon" value={h.icon} maxLength={2} onChange={(e) => set(h.z, { icon: e.target.value })} aria-label="전시관 그림" />
            <input className="hall-name" value={h.name} maxLength={14} onChange={(e) => set(h.z, { name: e.target.value })} placeholder="전시관 이름 (예: 해님반)" />
            <div className="hall-colors">
              {COLORS.map((c) => (
                <button key={c} className={`swatch${h.color === c ? " on" : ""}`} style={{ background: c }} onClick={() => set(h.z, { color: c })} aria-label="색 고르기" />
              ))}
            </div>
            <div className="item-row">
              <span className="tip">작품 {countOf(h.z)}점{h.hidden ? " · 숨김" : ""}</span>
              <button className="btn sm" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
              <button className="btn sm" disabled={i === list.length - 1} onClick={() => move(i, 1)}>▼</button>
              <button className="btn sm" onClick={() => set(h.z, { hidden: !h.hidden })}>{h.hidden ? "다시 보이기" : "숨기기"}</button>
              <button className="btn sm danger" onClick={() => remove(h)}>삭제</button>
            </div>
          </div>
        ))}
      </div>
      <div className="hall-actions">
        <button className="btn" disabled={list.length >= MAX_ZONES} onClick={add}>＋ 전시관 추가{list.length >= MAX_ZONES ? ` (최대 ${MAX_ZONES}개)` : ""}</button>
        {dirty && <button className="btn" onClick={() => setList(zones)}>되돌리기</button>}
        <button className="btn primary" disabled={!dirty || busy} onClick={save}>{busy ? "저장하는 중…" : "💾 저장"}</button>
      </div>
      {list === DEFAULT_ZONES && <p className="tip">처음 설정이에요. 이름을 바꾸고 저장하면 전시회에 바로 반영돼요.</p>}
    </section>
  );
}
