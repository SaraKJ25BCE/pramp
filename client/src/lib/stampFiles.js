export function hasStampedFile(stamp) {
  return !!(stamp?.stampedFileUrl || stamp?.originalFileUrl);
}

export async function downloadStampedFile(stamp) {
  const url = stamp?.stampedFileUrl || stamp?.originalFileUrl;
  if (!url) {
    throw new Error('Stamped file is not available yet');
  }

  const filename = `${stamp.id}-${stamp.fileName || 'stamped-file'}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Fetch failed');
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  } catch {
    window.open(url, '_blank');
  }
}
