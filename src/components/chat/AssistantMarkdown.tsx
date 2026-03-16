import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface AssistantMarkdownProps {
  content: string;
}

const markdownComponents: Components = {
  // Paragraphs — match existing bubble text style
  p: ({ children }) => (
    <p className="mb-1.5 last:mb-0 text-sm leading-relaxed text-foreground">
      {children}
    </p>
  ),
  // Bold
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  // Italic
  em: ({ children }) => (
    <em className="italic text-foreground/90">{children}</em>
  ),
  // Unordered list
  ul: ({ children }) => (
    <ul className="mb-1.5 ml-4 list-disc space-y-0.5 text-sm text-foreground">
      {children}
    </ul>
  ),
  // Ordered list
  ol: ({ children }) => (
    <ol className="mb-1.5 ml-4 list-decimal space-y-0.5 text-sm text-foreground">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  // Inline code vs fenced code block: react-markdown adds a "language-*" className
  // only for fenced code blocks; inline code has no className.
  code: ({ children, className }) => {
    const isBlock = className?.startsWith("language-") ?? false;
    if (isBlock) {
      return (
        <code className="block w-full overflow-x-auto rounded-md bg-black/40 px-3 py-2 font-mono text-xs text-foreground/90 whitespace-pre">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-xs text-foreground/90">
        {children}
      </code>
    );
  },
  // Fenced code block wrapper
  pre: ({ children }) => (
    <pre className="mb-1.5 overflow-hidden rounded-md bg-black/40 text-xs">
      {children}
    </pre>
  ),
  // Blockquote
  blockquote: ({ children }) => (
    <blockquote className="mb-1.5 border-l-2 border-neon-purple/60 pl-3 text-sm italic text-foreground/80">
      {children}
    </blockquote>
  ),
  // Headings — keep chat-friendly sizing
  h1: ({ children }) => (
    <p className="mb-1 text-base font-bold text-foreground">{children}</p>
  ),
  h2: ({ children }) => (
    <p className="mb-1 text-sm font-bold text-foreground">{children}</p>
  ),
  h3: ({ children }) => (
    <p className="mb-1 text-sm font-semibold text-foreground">{children}</p>
  ),
  // Links — safe: open in new tab, block javascript: and data: URIs
  a: ({ href, children }) => {
    const isSafe = href && /^https?:\/\//i.test(href);
    if (!isSafe) return <span>{children}</span>;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-neon-purple hover:text-neon-purple/80 break-all"
      >
        {children}
      </a>
    );
  },
  // Horizontal rule
  hr: () => <hr className="my-2 border-foreground/20" />,
  // Tables
  table: ({ children }) => (
    <div className="mb-1.5 overflow-x-auto">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-foreground/20">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-foreground/10">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-2 py-1 text-left font-semibold text-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-2 py-1 text-foreground/90">{children}</td>
  ),
};

const AssistantMarkdown = ({ content }: AssistantMarkdownProps) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownComponents}
      // react-markdown does NOT render raw HTML by default — safe by design
    >
      {content}
    </ReactMarkdown>
  );
};

export default AssistantMarkdown;
