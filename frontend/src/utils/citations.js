// Parse page citations in assistant text and resolve them to {docId, page}.
// Supported forms: [Page 5], [p. 5], [Source 1, Page 5], [file.pdf, p. 5],
// [document.pdf page 5]. Never invented — they only work for uploaded docs.

const CITATION_RE = /\[(?:([^\],]{1,120}),\s*)?(?:Source\s*\d+,\s*)?(?:Page\s*(\d{1,4})|p\.\s*(\d{1,4})|page\s*(\d{1,4}))\]/gi

export function parseCitations(text, documents = []) {
  const results = []
  if (!text) return results
  const re = new RegExp(CITATION_RE.source, 'gi')
  let match
  while ((match = re.exec(text)) !== null) {
    const page = Number(match[2] || match[3] || match[4])
    if (!Number.isFinite(page) || page <= 0) continue
    const label = match[1] ? match[0].slice(1, -1) : `Page ${page}`
    const docHint = (match[1] || '').trim().toLowerCase()
    const doc = documents.find((d) => docHint && d.filename.toLowerCase() === docHint)
      || documents.find((d) => docHint && d.filename.toLowerCase().includes(docHint.replace(/\.pdf$/, '')))
      || (documents.length === 1 ? documents[0] : null)
    if (!doc) continue // unknown document → not clickable
    if (page > (doc.pages || Infinity)) continue // page beyond this document
    results.push({
      raw: match[0],
      index: match.index,
      docId: doc.id,
      filename: doc.filename,
      page,
    })
  }
  return results
}

export function resolveCitation(text, documents) {
  const hits = parseCitations(text, documents)
  return hits.length ? hits[0] : null
}
