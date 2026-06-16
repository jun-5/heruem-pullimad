import { NextResponse } from "next/server";
import https from "node:https";

const SOURCE_ORIGIN = "https://www.heureum-company.com";
const BOARD_URL_PATTERN = /^[a-z0-9]+$/i;

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
  return new URL(value, SOURCE_ORIGIN).toString();
}

function sanitizeDetailHtml(value = "") {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(["']).*?\1/gi, "")
    .replace(/\s+style\s*=\s*(["']).*?\1/gi, "")
    .replace(/\s+(contenteditable|data-[\w-]+|sqeid|rheight|rwidth|align)\s*=\s*(["']).*?\2/gi, "")
    .replace(/\s+src\s*=\s*(["'])(.*?)\1/gi, (_match, quote, src) => {
      return ` src=${quote}${absolutizeUrl(decodeHtml(src))}${quote}`;
    });
}

function parseBoardDetail(html, sourceUrl) {
  const title = html.match(/<h1[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "";
  const publishedAt = html.match(/<p[^>]*class=["'][^"']*\bdttm\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || "";
  const ogImage = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1] || "";
  const detailBody = html.match(/<div[^>]*class=["'][^"']*\bedk_edit_admin\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i)?.[1] || "";

  return {
    title: stripTags(title),
    publishedAt: stripTags(publishedAt),
    sourceUrl,
    thumbnail: absolutizeUrl(ogImage),
    contentHtml: sanitizeDetailHtml(detailBody),
  };
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const slug = params?.slug || "";

  if (!BOARD_URL_PATTERN.test(slug)) {
    return NextResponse.json(
      { message: "잘못된 게시글 주소입니다." },
      { status: 400 }
    );
  }

  const sourceUrl = `${SOURCE_ORIGIN}/board/${slug}/`;

  try {
    const response = await fetchSourceHtml(sourceUrl);

    if (!response.ok) {
      return NextResponse.json(
        { message: "게시글 정보를 불러오지 못했습니다." },
        { status: response.status }
      );
    }

    const html = response.text;
    const detail = parseBoardDetail(html, sourceUrl);

    if (!detail.title) {
      return NextResponse.json(
        { message: "게시글을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      slug,
      fetchedAt: new Date().toISOString(),
      detail,
    });
  } catch (error) {
    return NextResponse.json(
      { message: "게시글 정보를 불러오는 중 문제가 발생했습니다." },
      { status: 502 }
    );
  }
}
