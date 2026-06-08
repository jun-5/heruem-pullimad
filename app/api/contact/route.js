import { NextResponse } from "next/server";

import {
  getErrorMessage,
  handleContactSubmission,
} from "../../../server/contact-handler.js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await handleContactSubmission(body);
    return NextResponse.json(result);
  } catch (error) {
    const { statusCode, message } = getErrorMessage(error);
    return NextResponse.json({ message }, { status: statusCode });
  }
}
