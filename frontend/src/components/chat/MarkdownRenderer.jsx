// Safe Markdown rendering: react-markdown + GFM, no raw HTML.
// - Links open in a new tab with rel protection; unsafe schemes dropped.
// - Code blocks get a copy button; tables scroll instead of breaking layout.
import { memo, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy, FileText } from 'lucide-react'
import { parseCitations } from '../../utils/citations.js'

function safeHref(href) {
  if (!href) return undefined
  try {
    const u = new URL(href, window.location.origin)
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') return href
  } catch { /* relative or invalid */ }
  return href.startsWith('/') || href.startsWith('#') ? href : undefined
}

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }
  return (
    <div className="codeblock">
      <div className="codeblock-bar">
        <span>{language || 'code'}</span>
        <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={copy} aria-label="Copy code">
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      <pre className="md-pre-pad"><code>{code}</code></pre>
    </div>
  )
}

const components = {
  // Never render raw HTML from model output.
  // (react-markdown v9+ skips raw HTML by default — no rehype-raw used.)
  a({ href, children }) {
    const safe = safeHref(href)
    if (!safe) return <span>{children}</span>
    return <a href={safe} target="_blank" rel="noopener noreferrer">{children}</a>
  },
  pre({ children }) {
    // Extract code text + language for the copy-button wrapper.
    let code = ''
    let language = ''
    try {
      const codeEl = Array.isArray(children) ? children[0] : children
      const cls = codeEl?.props?.className || ''
      const m = /language-([\w+-]+)/.exec(cls)
      language = m ? m[1] : ''
      code = String(codeEl?.props?.children ?? '').replace(/\n$/, '')
    } catch { /* fall back to plain pre */ }
    if (!code) return <pre>{children}</pre>
    return <CodeBlock language={language} code={code} />
  },
  table({ children }) {
    return <div className="table-wrap"><table>{children}</table></div>
  },
}

function MarkdownRenderer({ content, documents = [], onCitationClick }) {
  // Clickable [Page N] / [file.pdf, p. N] citations → chip buttons.
  const { parts, citations } = useMemo(() => {
    if (!content || !documents.length || !onCitationClick) {
      return { parts: content ? [content] : [], citations: [] }
    }
    const hits = parseCitations(content, documents)
    if (!hits.length) return { parts: [content], citations: [] }
    const out = []
    let cursor = 0
    hits.forEach((hit) => {
      out.push({ type: 'text', value: content.slice(cursor, hit.index) })
      out.push({ type: 'cite', hit })
      cursor = hit.index + hit.raw.length
    })
    out.push({ type: 'text', value: content.slice(cursor) })
    return { parts: out, citations: hits }
  }, [content, documents, onCitationClick])

  if (!content) return null

  if (!citations.length) {
    return (
      <div className="md">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>
      </div>
    )
  }

  return (
    <div className="md">
      {parts.map((part, i) => part.type === 'cite' ? (
        <button
          key={`cite-${i}`}
          className="cite-chip"
          title={`Open ${part.hit.filename}, page ${part.hit.page}`}
          onClick={() => onCitationClick(part.hit)}
        >
          <FileText size={11} /> {part.hit.raw.slice(1, -1)}
        </button>
      ) : (
        <ReactMarkdown key={`text-${i}`} remarkPlugins={[remarkGfm]} components={components}>
          {part.value}
        </ReactMarkdown>
      ))}
    </div>
  )
}

export default memo(MarkdownRenderer)
