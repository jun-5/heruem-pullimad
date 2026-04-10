import "./globals.css";

export const metadata = {
  title: "흐름컴퍼니 스타일 랜딩",
  description:
    "검색 최적화와 퍼포먼스 마케팅을 소개하는 단일 페이지형 Next.js 랜딩 예시",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
