import type { WorkContent, InlineNode } from "@libroaozora/core";
import styles from "./ContentReader.module.css";

type Props = {
  content: WorkContent;
};

export function ContentReader({ content }: Props) {
  if (content.format === "structured" && typeof content.content === "object") {
    return (
      <div className={styles.reader}>
        {content.content.blocks.map((block, i) => {
          if (block.type === "heading") {
            const Tag = block.level <= 2 ? "h2" : "h3";
            return <Tag key={i}>{block.text}</Tag>;
          }
          if (block.type === "separator") {
            return <hr key={i} />;
          }
          return <p key={i}>{renderNodes(block.nodes)}</p>;
        })}
      </div>
    );
  }

  if (typeof content.content === "string") {
    const paragraphs = content.content.split(/\n\n+/);
    return (
      <div className={styles.reader}>
        {paragraphs.map((text, i) => (
          <p key={i}>{text}</p>
        ))}
      </div>
    );
  }

  return null;
}

function renderNodes(nodes: InlineNode[]) {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "ruby":
        return (
          <ruby key={i}>
            {node.base}
            <rp>(</rp>
            <rt>{node.reading}</rt>
            <rp>)</rp>
          </ruby>
        );
      case "emphasis":
        return (
          <em key={i} className={styles.emphasis}>
            {node.text}
          </em>
        );
      case "bold":
        return (
          <strong key={i} className={styles.bold}>
            {node.text}
          </strong>
        );
      case "annotation":
        return (
          <span key={i} title={node.note}>
            {node.text}
          </span>
        );
      case "text":
      default:
        return <span key={i}>{node.text}</span>;
    }
  });
}

export function ContentUnavailable({
  reason,
}: {
  reason: "copyright" | "no-text" | "error";
}) {
  return (
    <div className={styles.unavailable}>
      {reason === "copyright" ? (
        <>
          <p>この作品は著作権の関係で本文を表示できません</p>
          <p>青空文庫のカードページから詳細をご確認ください</p>
        </>
      ) : reason === "error" ? (
        <p>本文の取得に失敗しました。しばらく経ってからもう一度お試しください</p>
      ) : (
        <p>この作品のテキストデータはありません</p>
      )}
    </div>
  );
}
