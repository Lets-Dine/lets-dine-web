import { useEffect } from 'react';

/** Keeps the browser tab title (and meta description) in sync with whichever page is mounted. */
export function usePageTitle(title: string, description?: string) {
  useEffect(() => {
    document.title = title;
    if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [title, description]);
}
