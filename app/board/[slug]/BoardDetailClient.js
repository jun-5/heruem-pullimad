"use client";

import { useEffect, useState } from "react";
import styles from "./board-detail.module.css";

export default function BoardDetailClient({ slug }) {
  const [detail, setDetail] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadDetail() {
      try {
        const response = await fetch(`/api/heureum-board/${slug}`, {
          headers: {
            Accept: "application/json",
          },
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.message || "게시글 정보를 불러오지 못했습니다.");
        }

        if (isMounted) {
          setDetail(data.detail);
          setErrorMessage("");
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(
            error.message || "게시글 정보를 불러오는 중 문제가 발생했습니다."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadDetail();

    return () => {
      isMounted = false;
    };
  }, [slug]);

  return (
    <main className={styles.page}>
      <header className={`${styles.header} ${isScrolled ? styles.scrolled : ""}`}>
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
          <h1>{detail?.title || "흐름게시판"}</h1>
        </div>
      </section>

      <section className={styles.contentWrap}>
        {isLoading ? (
          null
        ) : errorMessage ? (
          <div className={styles.stateCard}>{errorMessage}</div>
        ) : (
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
        )}
      </section>
    </main>
  );
}
