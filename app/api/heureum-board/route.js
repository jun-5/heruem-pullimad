import { NextResponse } from "next/server";

const SOURCE_URL = "https://www.heureum-company.com/";

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

function parseBoardItems(html) {
  const section = html.match(
    /<section[^>]+id=["']sect_05["'][\s\S]*?<\/section>/i
  )?.[0];

  if (!section) return [];

  const itemPattern =
    /<a\s+href=["']([^"']+)["']\s+class=["']board_item["'][^>]*>([\s\S]*?)<\/a>/gi;

  return Array.from(section.matchAll(itemPattern)).map((match) => {
    const [, href, body] = match;
    const image = body.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || "";
    const imageAlt = body.match(/<img[^>]+alt=["']([^"']*)["']/i)?.[1] || "";
    const title = body.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "";
    const publishedAt = body.match(/<p\s+class=["']dttm["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || "";

    return {
      title: stripTags(title),
      publishedAt: stripTags(publishedAt),
      url: absolutizeUrl(href),
      thumbnail: absolutizeUrl(image),
      thumbnailAlt: stripTags(imageAlt),
    };
  });
}

export const runtime = "nodejs";

export async function GET() {
  try {
    const response = await fetch(SOURCE_URL, {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 HreumCompanyBoardFetcher/1.0",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { message: "게시판 정보를 불러오지 못했습니다.", items: [] },
        { status: response.status }
      );
    }

    const html = await response.text();
    const items = parseBoardItems(html);

    return NextResponse.json({
      source: SOURCE_URL,
      fetchedAt: new Date().toISOString(),
      items,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "게시판 정보를 불러오는 중 문제가 발생했습니다.",
        items: [],
      },
      { status: 502 }
    );
  }
}
