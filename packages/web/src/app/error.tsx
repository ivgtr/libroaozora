"use client";

import { ErrorMessage } from "@/components/ErrorMessage";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const is503 = error.message?.includes("503") || error.message?.includes("SERVICE_UNAVAILABLE");

  return (
    <ErrorMessage
      title={is503 ? "現在データを準備中です" : "エラーが発生しました"}
      message={
        is503
          ? "しばらく時間を置いてから再度アクセスしてください"
          : "データの取得中に問題が発生しました。再試行してください"
      }
    />
  );
}
