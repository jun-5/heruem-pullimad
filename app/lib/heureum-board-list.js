import https from "node:https";

import { unstable_cache } from "next/cache";

const SOURCE_URL = "https://www.heureum-company.com/";

export const BOARD_LIST_REVALIDATE_SECONDS = 60 * 60;
export const BOARD_LIST_CACHE_CONTROL =
  "s-maxage=3600, stale-while-revalidate=86400";

function decodeHtml(value = "") {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripTags(value = "") {
  return decodeHtml(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function absolutizeUrl(value = "") {
  if (!value) return "";
  if (value.startsWith("//")) return `https:${value}`;
  return new URL(value, SOURCE_URL).toString();
}

function extractSlug(value = "") {
  return value.match(/\/board\/([^/]+)\//)?.[1] || "";
}

function parseBoardItems(html) {
  const section = html.match(
    /<section[^>]+id=["']sect_05["'][\s\S]*?<\/section>/i
  )?.[0];

  if (!section) return [];

  const itemPattern =
    /<a\s+href=["']([^"']+)["']\s+class=["']board_item["'][^>]*>([\s\S]*?)<\/a>/gi;

  return Array.from(section.matchAll(itemPattern)).map((match) => {
    const [, href, body] = match;
    const slug = extractSlug(href);
    const image = body.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || "";
    const imageAlt = body.match(/<img[^>]+alt=["']([^"']*)["']/i)?.[1] || "";
    const title = body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "";
    const publishedAt =
      body.match(/<p\s+class=["']dttm["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] ||
      "";

    return {
      slug,
      title: stripTags(title),
      publishedAt: stripTags(publishedAt),
      url: absolutizeUrl(href),
      localUrl: `/board/${slug}`,
      thumbnail: absolutizeUrl(image),
      thumbnailAlt: stripTags(imageAlt),
    };
  });
}

function fetchSourceHtml(url) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 HreumCompanyBoardFetcher/1.0",
        },
        rejectUnauthorized: false,
      },
      (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          resolve(fetchSourceHtml(absolutizeUrl(response.headers.location)));
          return;
        }

        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            text: body,
          });
        });
      }
    );

    request.on("error", reject);
    request.end();
  });
}

async function fetchBoardItems() {
  const response = await fetchSourceHtml(SOURCE_URL);

  if (!response.ok) {
    const error = new Error("게시판 정보를 불러오지 못했습니다.");
    error.status = response.status;
    throw error;
  }

  return parseBoardItems(response.text);
}

export const getCachedBoardItems = unstable_cache(
  fetchBoardItems,
  ["heureum-board-list"],
  { revalidate: BOARD_LIST_REVALIDATE_SECONDS }
);

export { SOURCE_URL as BOARD_LIST_SOURCE_URL };
