import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://sky-photo-expo.vercel.app"),
  title: "제3회 만삼 푸른하늘 사진 전시회",
  description: "국공립만촌삼정에듀파크어린이집 온라인 사진 전시회 — 전시장에 들어가 작품을 넘겨 보고 좋아요를 남겨 주세요.",
  openGraph: {
    title: "제3회 만삼 푸른하늘 사진 전시회",
    description: "국공립만촌삼정에듀파크어린이집 온라인 사진 전시회에 초대합니다.",
    images: ["/og.jpg"],
  },
};

export const viewport = { width: "device-width", initialScale: 1, maximumScale: 1, themeColor: "#8fc8ef" };

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Jua&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
