"use client";

import { useCallback } from "react";
import Editor from "@monaco-editor/react";

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: string;
  height?: string;
  readOnly?: boolean;
}

export function CodeEditor({
  value,
  onChange,
  language = "python",
  height = "500px",
  readOnly = false,
}: CodeEditorProps) {
  const handleChange = useCallback(
    (val: string | undefined) => {
      if (onChange && val !== undefined) onChange(val);
    },
    [onChange]
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-[#1e1e1e]">
      {/* macOS-style title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#252526] border-b border-border/50">
        <div className="macos-dots">
          <span />
          <span />
          <span />
        </div>
        <span className="ml-2 text-xs text-muted-foreground font-mono">
          {language}
        </span>
      </div>
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={handleChange}
        theme="vs-dark"
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 14,
          padding: { top: 16 },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: "smooth",
          fontFamily: "var(--font-geist-mono), monospace",
        }}
      />
    </div>
  );
}
