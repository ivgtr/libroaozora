"use client";

import { useRouter } from "next/navigation";
import styles from "./ErrorMessage.module.css";

type Props = {
  title?: string;
  message: string;
  retryable?: boolean;
};

export function ErrorMessage({
  title = "エラーが発生しました",
  message,
  retryable = true,
}: Props) {
  const router = useRouter();

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.message}>{message}</p>
      {retryable && (
        <button className={styles.button} onClick={() => router.refresh()}>
          再試行
        </button>
      )}
    </div>
  );
}
