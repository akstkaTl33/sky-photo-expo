"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ZONES, zoneOf, checkPin, loadPhotos, sortPhotos, addPhoto, updatePhoto, shrinkImage, uploadPhoto, loadLikes, photoKey } from "../../lib/store";

export default function Admin() {
  const [ok, setOk] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    try { if (sessionStorage.getItem("sky3-admin") === "1") setOk(true); } catch {}
  }, []);

  const login = async (e) => {
    e.preventDefault();
    if (await checkPin(pin)) {
      setOk(true);
      try { sessionStorage.setItem("sky3-admin", "1"); } catch {}
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
    const { add } = await loadLikes();
    setLikes(add);
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
      alert(`「${zoneOf(zone).name}」 전시관에 작품을 걸었어요!`);
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

      <section className="card">
        <h2>② 작품 걸기</h2>
        <p className="label">어느 전시관에 걸까요?</p>
        <div className="chips">
          {ZONES.map((zn) => (
            <button key={zn.z} className={`chip${zone === zn.z ? " on" : ""}`} style={{ "--c": zn.color }} onClick={() => setZone(zn.z)}>
              {zn.icon} {zn.name}
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
              {busy || `🖼️ 「${zoneOf(zone).name}」에 ${drafts.length}점 전시하기`}
            </button>
          </>
        )}
      </section>

      <section className="card">
        <h2>③ 걸린 작품 고치기</h2>
        <div className="chips">
          {ZONES.map((zn) => (
            <button key={zn.z} className={`chip${view === zn.z ? " on" : ""}`} style={{ "--c": zn.color }} onClick={() => setView(zn.z)}>
              {zn.icon} {zn.name} ({photos.filter((p) => Number(p.zone) === zn.z && !p.hidden).length})
            </button>
          ))}
        </div>
        {inZone.length === 0 && <p className="tip">이 전시관에는 아직 작품이 없어요.</p>}
        <div className="items">
          {inZone.map((p, i) => (
            <Item key={p.id} p={p} n={likes[photoKey(p.id)] || 0} onSave={save} onUp={() => swap(p, inZone[i - 1])} onDown={() => swap(p, inZone[i + 1])} first={i === 0} last={i === inZone.length - 1} />
          ))}
        </div>
      </section>
    </main>
  );
}

function Item({ p, n, onSave, onUp, onDown, first, last }) {
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
            {ZONES.map((zn) => <option key={zn.z} value={zn.z}>{zn.name}</option>)}
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
