import { useCallback, useMemo, useState } from 'react';
import pb from '../lib/pocketbase';

export function useExerciseDropdownSource() {
  const user = pb.authStore.model;

  const [exerciseSource, setExerciseSource] = useState('mine'); // mine | public
  const [myExercises, setMyExercises] = useState([]);
  const [publicExercises, setPublicExercises] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadMyExercises = useCallback(async () => {
    if (!user?.id) return [];

    const [created, links] = await Promise.all([
      pb.collection('exercises').getFullList({
        filter: `created_by = "${user.id}"`,
        sort: 'exercise_name',
        requestKey: null,
      }),
      pb.collection('user_exercise_library').getFullList({
        filter: `user = "${user.id}"`,
        expand: 'exercise',
        requestKey: null,
      }),
    ]);

    const byId = new Map();

    for (const ex of created || []) {
      if (ex?.id) byId.set(ex.id, ex);
    }

    for (const link of links || []) {
      const ex = link?.expand?.exercise || null;
      if (ex?.id) byId.set(ex.id, ex);
    }

    return Array.from(byId.values()).sort((a, b) =>
      String(a?.exercise_name || '')
        .toLowerCase()
        .localeCompare(String(b?.exercise_name || '').toLowerCase())
    );
  }, [user?.id]);

  const loadPublicExercises = useCallback(async () => {
    const list = await pb.collection('exercises').getFullList({
      filter: 'is_public = true',
      sort: 'exercise_name',
      requestKey: null,
    });
    return list || [];
  }, []);

  const ensureLoaded = useCallback(async () => {
    if (loading) return;
    if (myExercises.length > 0 && publicExercises.length > 0) return;

    try {
      setLoading(true);
      setError(null);

      const [nextMy, nextPublic] = await Promise.all([
        myExercises.length ? Promise.resolve(null) : loadMyExercises(),
        publicExercises.length ? Promise.resolve(null) : loadPublicExercises(),
      ]);

      if (nextMy) setMyExercises(nextMy);
      if (nextPublic) setPublicExercises(nextPublic);
    } catch (e) {
      console.error('Ошибка загрузки упражнений:', e);
      setError('Не удалось загрузить упражнения');
    } finally {
      setLoading(false);
    }
  }, [loadMyExercises, loadPublicExercises, loading, myExercises.length, publicExercises.length]);

  const visibleExercises = useMemo(
    () => (exerciseSource === 'mine' ? myExercises : publicExercises),
    [exerciseSource, myExercises, publicExercises]
  );

  return {
    exerciseSource,
    setExerciseSource,
    myExercises,
    publicExercises,
    visibleExercises,
    loading,
    error,
    ensureLoaded,
  };
}

