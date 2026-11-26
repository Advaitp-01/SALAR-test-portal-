import React, { useEffect, useRef } from 'react';
import katex from 'katex';

interface KatexNodeProps {
  tex: string;
  displayMode?: boolean;
}

const KatexNode: React.FC<KatexNodeProps> = ({ tex, displayMode = false }) => {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(tex, ref.current, {
        displayMode,
        throwOnError: false,
        strict: false,
        trust: false,
      });
    } catch {
      if (ref.current) {
        ref.current.textContent = tex;
      }
    }
  }, [tex, displayMode]);

  return <span ref={ref} className={displayMode ? 'block my-2 overflow-x-auto' : 'inline-block align-middle'} />;
};

interface MathTextProps {
  text: string;
  className?: string;
}

/**
 * Safely renders mixed plain text and LaTeX delimiters ($...$, $$...$$, \(...\), \[...\])
 * using KaTeX DOM rendering without raw HTML injection.
 */
export const MathText: React.FC<MathTextProps> = ({ text, className = '' }) => {
  if (!text) return null;

  const regex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([\s\S]+?\\\))/g;
  const parts: Array<{ type: 'text' | 'inline' | 'display'; value: string }> = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith('$$') && token.endsWith('$$')) {
      parts.push({ type: 'display', value: token.slice(2, -2).trim() });
    } else if (token.startsWith('\\[') && token.endsWith('\\]')) {
      parts.push({ type: 'display', value: token.slice(2, -2).trim() });
    } else if (token.startsWith('\\(') && token.endsWith('\\)')) {
      parts.push({ type: 'inline', value: token.slice(2, -2).trim() });
    } else {
      parts.push({ type: 'inline', value: token.slice(1, -1).trim() });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {parts.map((part, idx) => {
        if (part.type === 'text') {
          return <React.Fragment key={idx}>{part.value}</React.Fragment>;
        }
        return <KatexNode key={idx} tex={part.value} displayMode={part.type === 'display'} />;
      })}
    </span>
  );
};
