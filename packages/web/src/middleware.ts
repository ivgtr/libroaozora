import { NextRequest, NextResponse } from "next/server";

/**
 * 安全でないメソッド（POST, PUT, DELETE 等）に対して
 * Origin ヘッダーと Host ヘッダーの一致を検証し、
 * クロスオリジンからの状態変更リクエストを拒否する。
 *
 * - GET/HEAD/OPTIONS は検証をスキップ（読み取り専用）
 * - Origin なし = 同一オリジンのナビゲーション or サーバー間通信 → 許可
 * - Origin と Host が一致 → 許可
 * - それ以外 → 403
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isOriginAllowed(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return true;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  if (!isOriginAllowed(request)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
