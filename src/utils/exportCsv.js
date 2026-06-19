export function downloadCsv(filename, rows, { excel = true } = {}) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const content = excel ? `\uFEFF${csv}` : csv
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function formatFirestoreTimestamp(value) {
  if (!value?.seconds) {
    return ''
  }
  return new Date(value.seconds * 1000).toLocaleString()
}

export function formatScorePercent(correct, total) {
  if (correct == null || !total) {
    return ''
  }
  return `${Math.round((correct / total) * 100)}%`
}
