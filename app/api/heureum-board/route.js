import { NextResponse } from "next/server";

import {
  BOARD_LIST_CACHE_CONTROL,
  BOARD_LIST_SOURCE_URL,
  getCachedBoardItems,
} from "../../lib/heureum-board-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await getCachedBoardItems();

    return NextResponse.json(
      {
        source: BOARD_LIST_SOURCE_URL,
        fetchedAt: new Date().toISOString(),
        items,
      },
      {
        headers: {
          "Cache-Control": BOARD_LIST_CACHE_CONTROL,
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message: error.message || "게시판 정보를 불러오는 중 문제가 발생했습니다.",
        items: [],
      },
      { status: error.status || 502 }
    );
  }
}
