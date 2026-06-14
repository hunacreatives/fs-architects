export function getTaskDescriptionPreview(description: string | null | undefined) {
  if (!description) return '';
  return description
    .replace(/<img[^>]*alt=["']([^"']*)["'][^>]*>/gi, ' $1 ')
    .replace(/<img[^>]*>/gi, ' [Image] ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
