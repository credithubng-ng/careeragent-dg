import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Eye, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * DocumentView renders generated application content as formatted markdown,
 * with a toggle to switch between a read-only preview and an editable textarea.
 * The edit state is lifted to the parent via `editing` / `onEditChange`.
 */
export default function DocumentView({
  content,
  onChange,
  onBlur,
  editing,
  onEditChange,
  minHeight = "180px",
}) {
  // Local draft while editing so keystrokes don't fight the parent state.
  const [draft, setDraft] = useState(content || "");

  useEffect(() => {
    if (editing) setDraft(content || "");
  }, [editing, content]);

  function handleBlur(event) {
    const value = event.target.value;
    setDraft(value);
    onEditChange(false);
    onBlur?.(value);
  }

  function handleChange(event) {
    const value = event.target.value;
    setDraft(value);
    onChange?.(value);
  }

  return (
    <div>
      <div className="mb-2 flex justify-end gap-1">
        <button
          type="button"
          onClick={() => onEditChange(false)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
            !editing ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          )}
        >
          <Eye className="h-3 w-3" /> Preview
        </button>
        <button
          type="button"
          onClick={() => onEditChange(true)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
            editing ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          )}
        >
          <Pencil className="h-3 w-3" /> Edit
        </button>
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={handleChange}
          onBlur={handleBlur}
          className="w-full rounded-lg border border-input bg-card p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
          style={{ minHeight }}
        />
      ) : (
        <div
          className="max-w-none rounded-lg border border-border bg-card p-4 overflow-y-auto"
          style={{ minHeight }}
        >
          <DocumentMarkdown source={content || ""} />
        </div>
      )}
    </div>
  );
}

/**
 * Renders markdown content with clean, professional typography suitable for
 * application documents (cover letters, supporting statements, etc.).
 */
export function DocumentMarkdown({ source }) {
  if (!source?.trim()) {
    return <p className="text-sm text-muted-foreground">No content yet.</p>;
  }

  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1 className="text-lg font-bold tracking-tight text-foreground mb-2">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-semibold tracking-tight text-foreground mt-3 mb-1.5">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold text-foreground mt-2 mb-1">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="text-sm leading-relaxed text-foreground mb-2 last:mb-0">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="my-1.5 ml-4 list-disc space-y-0.5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-1.5 ml-4 list-decimal space-y-0.5">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-sm leading-relaxed text-foreground">{children}</li>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        em: ({ children }) => <em className="italic text-foreground">{children}</em>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-border pl-3 italic text-muted-foreground my-2">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-3 border-border" />,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">
            {children}
          </a>
        ),
      }}
    >
      {source}
    </ReactMarkdown>
  );
}

/**
 * Converts simple markdown content into styled HTML suitable for a Word .doc
 * export. Supports headings, bold/italic, bullet/numbered lists, paragraphs,
 * blockquotes and horizontal rules. Escapes all text content first.
 */
export function markdownToHtml(markdown) {
  const lines = String(markdown || "").split("\n");
  let html = "";
  let inUl = false;
  let inOl = false;

  function closeLists() {
    if (inUl) { html += "</ul>"; inUl = false; }
    if (inOl) { html += "</ol>"; inOl = false; }
  }

  for (const raw of lines) {
    const line = raw;
    const trimmed = line.trim();

    if (!trimmed) {
      closeLists();
      continue;
    }

    if (trimmed.startsWith("### ")) {
      closeLists();
      html += `<h3>${inline(trimmed.slice(4))}</h3>`;
    } else if (trimmed.startsWith("## ")) {
      closeLists();
      html += `<h2>${inline(trimmed.slice(3))}</h2>`;
    } else if (trimmed.startsWith("# ")) {
      closeLists();
      html += `<h1>${inline(trimmed.slice(2))}</h1>`;
    } else if (trimmed.startsWith("---") || trimmed.startsWith("***")) {
      closeLists();
      html += "<hr/>";
    } else if (/^\s*[-*+]\s+/.test(line)) {
      if (!inUl) { closeLists(); html += "<ul>"; inUl = true; }
      html += `<li>${inline(trimmed.replace(/^\s*[-*+]\s+/, ""))}</li>`;
    } else if (/^\s*\d+\.\s+/.test(line)) {
      if (!inOl) { closeLists(); html += "<ol>"; inOl = true; }
      html += `<li>${inline(trimmed.replace(/^\s*\d+\.\s+/, ""))}</li>`;
    } else if (trimmed.startsWith("> ")) {
      closeLists();
      html += `<blockquote>${inline(trimmed.slice(2))}</blockquote>`;
    } else {
      closeLists();
      html += `<p>${inline(trimmed)}</p>`;
    }
  }
  closeLists();

  return html;

  function inline(text) {
    let out = escapeHtml(text);
    // Bold: **text** or __text__
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    // Italic: *text* or _text_
    out = out.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>");
    out = out.replace(/(^|[^_])_([^_\s][^_]*?)_(?!_)/g, "$1<em>$2</em>");
    // Links: [text](url)
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    return out;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}