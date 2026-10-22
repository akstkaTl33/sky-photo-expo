"use client";
import { useEffect, useState } from "react";
import Expo from "./Expo";

// 주소 끝 ?z=1 이면 그 전시관 안에서 바로 시작한다.
export default function Home() {
  const [z, setZ] = useState(undefined);
  useEffect(() => {
    const m = new URLSearchParams(location.search).get("z");
    setZ(/^\d+$/.test(m || "") ? Number(m) : null);
  }, []);
  if (z === undefined) return <div className="expo" />;
  return <Expo startZone={z} />;
}
