import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: {
    default: "Libro Aozora",
    template: "%s | Libro Aozora",
  },
  description: "青空文庫メタデータ検索・本文閲覧デモ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <Link href="/" className={styles.logo}>
              Libro Aozora
            </Link>
            <nav className={styles.nav}>
              <Link href="/works" className={styles.navLink}>
                作品検索
              </Link>
              <Link href="/persons" className={styles.navLink}>
                人物一覧
              </Link>
            </nav>
          </div>
        </header>
        <main className={styles.main}>{children}</main>
      </body>
    </html>
  );
}
