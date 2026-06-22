import { NextResponse } from "next/server";

import { getCachedBoardDetail } from "../../../lib/heureum-board-detail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  try {
    const detail = await getCachedBoardDetail(params?.slug || "");

    return NextResponse.json({
      slug: params.slug,
      fetchedAt: new Date().toISOString(),
      detail,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error.message || "게시글 정보를 불러오는 중 문제가 발생했습니다." },
      { status: error.status || 502 }
    );
  }
}
