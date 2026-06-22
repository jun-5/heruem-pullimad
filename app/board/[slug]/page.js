import { notFound } from "next/navigation";

import { getCachedBoardItems } from "../../lib/heureum-board-list";
import {
  BOARD_DETAIL_REVALIDATE_SECONDS,
  getCachedBoardDetail,
} from "../../lib/heureum-board-detail";
import styles from "./board-detail.module.css";

export const runtime = "nodejs";
export const revalidate = BOARD_DETAIL_REVALIDATE_SECONDS;
export const dynamicParams = true;

async function getDetailOrNull(slug) {
  try {
    return await getCachedBoardDetail(slug);
  } catch (error) {
    if (error.status === 404 || error.status === 400) {
      return null;
    }
    throw error;
  }
}

export async function generateStaticParams() {
  const items = await getCachedBoardItems();

  return items
    .filter((item) => item.slug)
    .map((item) => ({
      slug: item.slug,
    }));
}

export async function generateMetadata({ params }) {
  const detail = await getDetailOrNull(params.slug);

  if (!detail) {
    return {
      title: "흐름게시판 | 흐름컴퍼니",
      description: "흐름컴퍼니 공식 게시판 상세 내용",
    };
  }

  return {
    title: `${detail.title} | 흐름컴퍼니`,
    description: "흐름컴퍼니 공식 게시판 상세 내용",
    openGraph: {
      title: detail.title,
      images: detail.thumbnail ? [detail.thumbnail] : [],
    },
  };
}

export default async function BoardDetailPage({ params }) {
  const detail = await getDetailOrNull(params.slug);

  if (!detail) {
    notFound();
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a href="/index.html" className={styles.logo} aria-label="흐름컴퍼니 홈">
          <img src="/logo.png" alt="흐름컴퍼니" />
        </a>
        <a href="/index.html#board-section" className={styles.headerButton}>
          목록으로
        </a>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.label}>Heureum Board</span>
          <h1>{detail.title}</h1>
        </div>
      </section>

      <section className={styles.contentWrap}>
        <article className={styles.article}>
          <div className={styles.articleHead}>
            <a href="/index.html#board-section" className={styles.backLink}>
              목록으로 돌아가기
            </a>
            <p>{detail.publishedAt}</p>
            <h2>{detail.title}</h2>
          </div>
          <div
            className={styles.articleBody}
            dangerouslySetInnerHTML={{ __html: detail.contentHtml }}
          />
        </article>
      </section>
    </main>
  );
}
