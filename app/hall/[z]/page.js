"use client";
import { useEffect } from "react";
import { useParams } from "next/navigation";

// 예전 주소(/hall/1)로 들어오면 새 주소(/?z=1)로 옮겨 준다.
export default function Hall() {
  const { z } = useParams();
  useEffect(() => {
    location.replace(["1", "2", "3"].includes(z) ? `/?z=${z}` : "/");
  }, [z]);
  return <div className="expo" />;
}
