import { createHmac, randomBytes } from "node:crypto";

export class ContactRequestError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "ContactRequestError";
    this.statusCode = statusCode;
  }
}

const KST_OFFSET_MINUTES = 9 * 60;
const DEFAULT_KAKAO_SEND_WINDOW = {
  startMinutes: 8 * 60,
  endMinutes: 20 * 60 + 50,
};
const SOLAPI_API_BASE_URL = "https://api.solapi.com";

function createSolapiAuthorization(apiKey, apiSecret, now = new Date()) {
  const salt = randomBytes(32)
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 32);
  const date = now.toISOString();
  const signature = createHmac("sha256", apiSecret)
    .update(`${date}${salt}`)
    .digest("hex");

  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

async function sendSolapiRequest(apiKey, apiSecret, path, body) {
  const response = await fetch(`${SOLAPI_API_BASE_URL}/${path}`, {
    method: "POST",
    headers: {
      Authorization: createSolapiAuthorization(apiKey, apiSecret),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.errorMessage ||
      data?.message ||
      `SOLAPI 요청에 실패했습니다. (${response.status})`;
    const error = new Error(message);
    Object.assign(error, {
      errorCode: data?.errorCode,
      errorMessage: data?.errorMessage,
    });
    throw error;
  }

  return data;
}

function requireEnv(name, env) {
  const value = env[name]?.trim();
  if (!value) {
    throw new ContactRequestError(`${name} 환경변수가 설정되지 않았습니다.`, 500);
  }
  return value;
}

function normalizePhoneNumber(value) {
  return value.replace(/\D/g, "");
}

function parseWindowMinutes(value, fallback, min, max) {
  const parsed = Number.parseInt(value?.trim() ?? "", 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

function getKakaoSendWindow(env) {
  const startHour = parseWindowMinutes(
    env.SOLAPI_KAKAO_SEND_START_HOUR,
    8,
    0,
    23
  );
  const startMinute = parseWindowMinutes(
    env.SOLAPI_KAKAO_SEND_START_MINUTE,
    0,
    0,
    59
  );
  const endHour = parseWindowMinutes(
    env.SOLAPI_KAKAO_SEND_END_HOUR,
    20,
    0,
    23
  );
  const endMinute = parseWindowMinutes(
    env.SOLAPI_KAKAO_SEND_END_MINUTE,
    50,
    0,
    59
  );
  const window = {
    startMinutes: startHour * 60 + startMinute,
    endMinutes: endHour * 60 + endMinute,
  };

  if (window.startMinutes > window.endMinutes) {
    return DEFAULT_KAKAO_SEND_WINDOW;
  }

  return window;
}

function getKstClock(now = new Date()) {
  return new Date(now.getTime() + KST_OFFSET_MINUTES * 60 * 1000);
}

function createUtcDateFromKst(year, month, day, hour, minute) {
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute) -
      KST_OFFSET_MINUTES * 60 * 1000
  );
}

function getNextAvailableKakaoSendDate(window, now = new Date()) {
  const kstNow = getKstClock(now);
  const currentMinutes = kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes();
  const year = kstNow.getUTCFullYear();
  const month = kstNow.getUTCMonth() + 1;
  const day = kstNow.getUTCDate();
  const startHour = Math.floor(window.startMinutes / 60);
  const startMinute = window.startMinutes % 60;

  if (currentMinutes < window.startMinutes) {
    return createUtcDateFromKst(year, month, day, startHour, startMinute);
  }

  if (currentMinutes <= window.endMinutes) {
    return null;
  }

  return createUtcDateFromKst(year, month, day + 1, startHour, startMinute);
}

function formatScheduledDateForMessage(date) {
  const kstDate = getKstClock(date);
  const year = kstDate.getUTCFullYear();
  const month = String(kstDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kstDate.getUTCDate()).padStart(2, "0");
  const hour = String(kstDate.getUTCHours()).padStart(2, "0");
  const minute = String(kstDate.getUTCMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute} (KST)`;
}

function isKakaoNightRestrictionError(error) {
  return (
    String(error?.errorCode ?? "") === "3108" ||
    error?.errorMessage?.includes("메시지 발송 가능 시간이 아님") === true ||
    error?.message?.includes("3108") === true
  );
}

function ensureArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string");
}

function validateContactRequest(body) {
  if (!body || typeof body !== "object") {
    throw new ContactRequestError("잘못된 요청 형식입니다.");
  }

  if (!body.companyName?.trim()) {
    throw new ContactRequestError("회사명을 입력해 주세요.");
  }
  if (!body.contact?.trim()) {
    throw new ContactRequestError("연락처를 입력해 주세요.");
  }
  if (!body.url?.trim()) {
    throw new ContactRequestError("URL을 입력해 주세요.");
  }

  return {
    ...body,
    companyName: body.companyName.trim(),
    contact: body.contact.trim(),
    email: body.email?.trim() || "",
    url: body.url.trim(),
    otherPlatform: body.otherPlatform?.trim(),
    otherService: body.otherService?.trim(),
    selectedPlatforms: ensureArray(body.selectedPlatforms),
    selectedServices: ensureArray(body.selectedServices),
    message: body.message?.trim(),
  };
}

function buildFallbackMessage(payload) {
  return [
    "[무료 컨설팅 신청]",
    `회사명: ${payload.companyName || "-"}`,
    `연락처: ${payload.contact || "-"}`,
    `이메일: ${payload.email || "-"}`,
    `URL: ${payload.url || "-"}`,
    payload.selectedPlatforms.length > 0
      ? `플랫폼: ${payload.selectedPlatforms.join(", ")}`
      : "플랫폼: -",
    payload.selectedServices.length > 0
      ? `서비스: ${payload.selectedServices.join(", ")}`
      : "서비스: -",
    payload.otherPlatform ? `기타 플랫폼: ${payload.otherPlatform}` : null,
    payload.otherService ? `기타 서비스: ${payload.otherService}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function handleContactSubmission(body, env = process.env) {
  const payload = validateContactRequest(body);
  const apiKey = requireEnv("SOLAPI_API_KEY", env);
  const apiSecret = requireEnv("SOLAPI_API_SECRET", env);
  const kakaoPfId = (
    env.SOLAPI_KAKAO_PF_ID ?? env.SOLAPI_KAKAO_CHANNEL_ID
  )?.trim();
  const recipient = env.SOLAPI_KAKAO_TO?.trim();
  const sender = env.SOLAPI_SENDER?.trim();
  const templateId = env.SOLAPI_KAKAO_TEMPLATE_ID?.trim();

  if (!kakaoPfId) {
    throw new ContactRequestError(
      "SOLAPI_KAKAO_PF_ID 또는 SOLAPI_KAKAO_CHANNEL_ID 환경변수가 필요합니다.",
      500
    );
  }

  if (!recipient) {
    throw new ContactRequestError(
      "SOLAPI_KAKAO_TO 환경변수가 설정되지 않았습니다.",
      500
    );
  }

  const text = payload.message || buildFallbackMessage(payload);
  const kakaoMessage = templateId
    ? {
        to: normalizePhoneNumber(recipient),
        from: normalizePhoneNumber(sender ?? ""),
        type: "ATA",
        text,
        kakaoOptions: {
          pfId: kakaoPfId,
          templateId,
          disableSms: false,
        },
      }
    : {
        to: normalizePhoneNumber(recipient),
        type: "CTA",
        text,
        kakaoOptions: {
          pfId: kakaoPfId,
          disableSms: true,
        },
      };
  const sendWindow = getKakaoSendWindow(env);
  const scheduledDate = getNextAvailableKakaoSendDate(sendWindow);

  if (templateId && !sender) {
    throw new ContactRequestError(
      "알림톡 발송을 위해 SOLAPI_SENDER 환경변수가 필요합니다.",
      500
    );
  }

  try {
    if (scheduledDate) {
      await sendSolapiRequest(apiKey, apiSecret, "messages/v4/send-many/detail", {
        messages: [kakaoMessage],
        scheduledDate: scheduledDate.toISOString(),
      });
    } else {
      await sendSolapiRequest(apiKey, apiSecret, "messages/v4/send", {
        message: kakaoMessage,
      });
    }
  } catch (error) {
    if (!scheduledDate && isKakaoNightRestrictionError(error)) {
      const fallbackScheduledDate = getNextAvailableKakaoSendDate(
        sendWindow,
        new Date(Date.now() + 60 * 1000)
      );

      if (fallbackScheduledDate) {
        await sendSolapiRequest(
          apiKey,
          apiSecret,
          "messages/v4/send-many/detail",
          {
            messages: [kakaoMessage],
            scheduledDate: fallbackScheduledDate.toISOString(),
          }
        );

        return {
          ok: true,
          message: `상담 신청이 접수되었습니다. 카카오톡은 ${formatScheduledDateForMessage(
            fallbackScheduledDate
          )}에 예약 발송됩니다.`,
        };
      }
    }

    throw error;
  }

  return {
    ok: true,
    message: scheduledDate
      ? `상담 신청이 접수되었습니다. 카카오톡은 ${formatScheduledDateForMessage(
          scheduledDate
        )}에 예약 발송됩니다.`
      : "상담 신청이 접수되었습니다.",
  };
}

export function getErrorMessage(error) {
  if (error instanceof ContactRequestError) {
    return {
      statusCode: error.statusCode,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      statusCode: 500,
      message: error.message,
    };
  }

  return {
    statusCode: 500,
    message: "문의 전송 중 알 수 없는 오류가 발생했습니다.",
  };
}
