'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';

// Loads every category (admin sees inactive ones too). Returns { categories, error, reload }.
export default function useCategories() {
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setError('');
    const res = await api('/api/categories');
    if (res.ok) setCategories(res.data.categories);
    else setError(res.error);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { categories, error, reload };
}
