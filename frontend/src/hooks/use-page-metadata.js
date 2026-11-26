import { useEffect } from 'react';

export function usePageMetadata(metadata) {
  const { title, description, path } = metadata ?? {};
  useEffect(() => {
    if (!title) return;
    const previousTitle = document.title;
    const descriptionTag = document.querySelector('meta[name="description"]');
    const previousDescription = descriptionTag?.getAttribute('content');
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = new URL(path, window.location.origin).href;
    document.head.append(canonical);
    document.title = title;
    descriptionTag?.setAttribute('content', description);
    return () => {
      document.title = previousTitle;
      if (previousDescription !== null && previousDescription !== undefined) {
        descriptionTag.setAttribute('content', previousDescription);
      }
      canonical.remove();
    };
  }, [title, description, path]);
}
