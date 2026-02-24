import { useEffect } from 'react';

export default function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} - DeepRun` : 'DeepRun';
    return () => { document.title = 'DeepRun'; };
  }, [title]);
}
