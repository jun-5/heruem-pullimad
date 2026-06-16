import BoardDetailClient from "./BoardDetailClient";

export const metadata = {
  title: "흐름게시판 | 흐름컴퍼니",
  description: "흐름컴퍼니 공식 게시판 상세 내용",
};

export default function BoardDetailPage({ params }) {
  return <BoardDetailClient slug={params.slug} />;
}
