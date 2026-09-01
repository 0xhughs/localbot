import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      parts.push(text.slice(last, m.index));
    }
    const token = m[0];
    if (token.startsWith("**")) {
      parts.push(
        <strong key={`${keyPrefix}-b${i++}`} className="font-medium text-fg">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      parts.push(
        <code
          key={`${keyPrefix}-c${i++}`}
          className="rounded-xs bg-raised px-1 py-0.5 font-mono text-[0.85em] text-accent"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      parts.push(
        <em key={`${keyPrefix}-i${i++}`} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function ChatMarkdown({ text, className }: { text: string; className?: string }) {
  const blocks = text.split(/```/);
  const nodes: ReactNode[] = [];
  blocks.forEach((block, idx) => {
    if (idx % 2 === 1) {
      const nl = block.indexOf("\n");
      const code = nl >= 0 ? block.slice(nl + 1) : block;
      nodes.push(
        <pre
          key={`code-${idx}`}
          className="my-2 overflow-x-auto rounded-md bg-bg p-3 font-mono text-xs leading-relaxed text-fg shadow-[0_0_0_1px_var(--color-border)]"
        >
          <code>{code.replace(/\n$/, "")}</code>
        </pre>,
      );
      return;
    }
    const lines = block.split("\n");
    let list: string[] = [];
    const flushList = () => {
      if (list.length === 0) return;
      const items = list;
      list = [];
      nodes.push(
        <ul key={`ul-${idx}-${nodes.length}`} className="my-1.5 space-y-1 pl-4">
          {items.map((it, i) => (
            <li key={i} className="list-disc text-sm leading-relaxed text-fg/90">
              {renderInline(it, `li-${idx}-${i}`)}
            </li>
          ))}
        </ul>,
      );
    };
    lines.forEach((line, li) => {
      const t = line.trimEnd();
      if (/^\s*[-*]\s+/.test(t)) {
        list.push(t.replace(/^\s*[-*]\s+/, ""));
        return;
      }
      flushList();
      if (!t.trim()) {
        nodes.push(<div key={`sp-${idx}-${li}`} className="h-2" />);
        return;
      }
      if (t.startsWith("### ")) {
        nodes.push(
          <h3 key={`h-${idx}-${li}`} className="mt-3 mb-1 text-sm font-medium text-fg">
            {t.slice(4)}
          </h3>,
        );
        return;
      }
      if (t.startsWith("## ") || t.startsWith("# ")) {
        nodes.push(
          <h2 key={`h-${idx}-${li}`} className="mt-3 mb-1 text-[15px] font-medium text-fg">
            {t.replace(/^#+\s+/, "")}
          </h2>,
        );
        return;
      }
      nodes.push(
        <p key={`p-${idx}-${li}`} className="text-sm leading-relaxed text-fg/90">
          {renderInline(t, `p-${idx}-${li}`)}
        </p>,
      );
    });
    flushList();
  });
  return <div className={cn("space-y-0.5", className)}>{nodes}</div>;
}
