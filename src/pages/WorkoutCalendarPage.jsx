import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import pb from '../lib/pocketbase';
import { isTrainer } from '../lib/permissions';
import { useCoachSession } from '../hooks/useCoachSession';
import { normalizeWorkoutStatus } from '../lib/setStatus';
import { aggregateVolumeByDayKey } from '../lib/workoutVolume';
import {
  getMainVariantExerciseName,
  loadWorkoutDraftFromApi,
  pasteWorkoutDraftToDay,
} from '../lib/workoutVariants';
import MonthCalendar from '../components/workouts/MonthCalendar';
import MonthCarousel from '../components/workouts/MonthCarousel';
import CalendarWorkoutForm from '../components/workouts/CalendarWorkoutForm';
import styles from './WorkoutCalendarPage.module.css';

function toMonthKey(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function toDayKey(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseMonthKey(monthKey) {
  const [y, m] = String(monthKey).split('-').map((x) => Number(x));
  const now = new Date();
  const year = Number.isFinite(y) ? y : now.getFullYear();
  const monthIndex = Number.isFinite(m) ? Math.max(1, Math.min(12, m)) - 1 : now.getMonth();
  return { year, monthIndex };
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeekMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0..6 (Sun..Sat)
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  return d;
}

function buildMonthGrid(monthKey) {
  const { year, monthIndex } = parseMonthKey(monthKey);
  const firstOfMonth = new Date(year, monthIndex, 1);
  const start = startOfWeekMonday(firstOfMonth);

  const todayKey = toDayKey(new Date());
  const cells = [];

  for (let i = 0; i < 42; i += 1) {
    const date = addDays(start, i);
    const dayKey = toDayKey(date);
    cells.push({
      date,
      dayKey,
      inMonth: date.getMonth() === monthIndex,
      isToday: dayKey === todayKey,
    });
  }

  return cells;
}

function WorkoutCalendarPage() {
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => toMonthKey(new Date()));
  const [activeDayKey, setActiveDayKey] = useState(null);
  const [calendarReloadKey, setCalendarReloadKey] = useState(0);
  const [searchParams] = useSearchParams();
  const r = searchParams.get('r');

  const grid = useMemo(() => buildMonthGrid(selectedMonthKey), [selectedMonthKey]);

  const {
    authUser,
    effectiveUserId,
    canEditPlans,
    isTrainerView,
  } = useCoachSession();
  const user = authUser;
  const dataUserId = effectiveUserId;
  const isTrainerOwnCalendar = isTrainer(authUser) && !isTrainerView;
  const [exerciseNamesByDay, setExerciseNamesByDay] = useState({});
  const [workoutStatusByDay, setWorkoutStatusByDay] = useState({});
  const [workoutIdByDay, setWorkoutIdByDay] = useState({});
  const [workoutTitleByDay, setWorkoutTitleByDay] = useState({});
  const [workoutVolumeByDay, setWorkoutVolumeByDay] = useState({});

  // Clipboard + batch paste selection
  const [workoutClipboard, setWorkoutClipboard] = useState(null); // { title, notes, workoutStatus, exercises } | null
  const [selectedDayKeys, setSelectedDayKeys] = useState(() => new Set());
  const [pasting, setPasting] = useState(false);
  const [pasteProgress, setPasteProgress] = useState({ done: 0, total: 0 });
  const [pasteErrors, setPasteErrors] = useState([]); // Array<{ dayKey, message }>

  const pasteMode = Boolean(workoutClipboard) && canEditPlans;

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!user?.id) return;
      if (!dataUserId) return;
      if (!grid?.length) return;

      const rangeStart = grid[0]?.dayKey;
      const rangeEnd = grid[grid.length - 1]?.dayKey;
      if (!rangeStart || !rangeEnd) return;

      let workouts;
      try {
        workouts = await pb.collection('workouts').getFullList({
          filter: `user = "${dataUserId}" && date >= "${rangeStart}" && date <= "${rangeEnd}"`,
          sort: '-date',
          requestKey: null,
        });
      } catch (e) {
        console.error('Ошибка загрузки тренировок для календаря:', e);
        if (!mounted) return;
        setExerciseNamesByDay({});
        setWorkoutStatusByDay({});
        setWorkoutIdByDay({});
        setWorkoutTitleByDay({});
        setWorkoutVolumeByDay({});
        return;
      }

      if (!mounted) return;
      if (!workouts.length) {
        setExerciseNamesByDay({});
        setWorkoutStatusByDay({});
        setWorkoutIdByDay({});
        setWorkoutTitleByDay({});
        setWorkoutVolumeByDay({});
        return;
      }

      const workoutDayKeyById = new Map();
      const statusByDay = {};
      const idByDay = {};
      const titleByDay = {};
      for (const w of workouts) {
        const dayKey = toDayKey(w.date);
        if (!dayKey) continue;
        workoutDayKeyById.set(w.id, dayKey);
        statusByDay[dayKey] = normalizeWorkoutStatus(w.workout_status);
        idByDay[dayKey] = w.id;
        titleByDay[dayKey] = (w.title || '').trim() || 'Тренировка';
      }

      const workoutIds = Array.from(workoutDayKeyById.keys());

      if (!mounted) return;
      setWorkoutStatusByDay(statusByDay);
      setWorkoutIdByDay(idByDay);
      setWorkoutTitleByDay(titleByDay);

      let exerciseNames = {};
      let variantIdToDayKey = {};
      let variantIdToIsCustom = {};

      try {
        const orFilter = workoutIds.map((id) => `workout = "${id}"`).join(' || ');
        const wes = await pb.collection('workout_exercises').getFullList({
          filter: orFilter,
          expand: 'exercise',
          sort: 'order_index',
          requestKey: null,
        });

        const weIds = wes.map((we) => we.id);
        let variantsByWeId = {};
        let allVariants = [];

        if (weIds.length > 0) {
          const weFilter = weIds.map((weId) => `workout_exercise = "${weId}"`).join(' || ');
          allVariants = await pb.collection('workout_exercise_variants').getFullList({
            filter: weFilter,
            expand: 'exercise,custom_exercise',
            sort: 'variant_index',
            requestKey: null,
          });

          for (const v of allVariants) {
            const weId = v.workout_exercise;
            if (!variantsByWeId[weId]) variantsByWeId[weId] = [];
            variantsByWeId[weId].push(v);
          }
        }

        const weIdToDayKey = {};
        for (const we of wes) {
          const dayKey = workoutDayKeyById.get(we.workout);
          if (dayKey) weIdToDayKey[we.id] = dayKey;
        }

        for (const v of allVariants) {
          const dayKey = weIdToDayKey[v.workout_exercise];
          if (dayKey) variantIdToDayKey[v.id] = dayKey;
          variantIdToIsCustom[v.id] = Boolean(v.custom_exercise);
        }

        const blocksByDay = new Map();
        for (const we of wes) {
          const dayKey = workoutDayKeyById.get(we.workout);
          if (!dayKey) continue;
          if (!blocksByDay.has(dayKey)) blocksByDay.set(dayKey, []);
          blocksByDay.get(dayKey).push(we);
        }

        for (const [dayKey, dayWes] of blocksByDay) {
          dayWes.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
          exerciseNames[dayKey] = dayWes
            .map((we) => getMainVariantExerciseName(we, variantsByWeId[we.id] || []))
            .filter(Boolean);
        }
      } catch (e) {
        console.error('Ошибка загрузки упражнений для календаря:', e);
      }

      let volumeByDay = {};
      try {
        if (workoutIds.length > 0) {
          const setsFilter = workoutIds
            .map((id) => `workout_exercise_variant.workout_exercise.workout = "${id}"`)
            .join(' || ');
          const sets = await pb.collection('sets').getFullList({
            filter: setsFilter,
            sort: 'set_number',
            requestKey: null,
          });
          volumeByDay = aggregateVolumeByDayKey(sets, variantIdToDayKey, variantIdToIsCustom);
        }
      } catch (e) {
        console.error('Ошибка загрузки тоннажа для календаря:', e);
      }

      if (!mounted) return;
      setExerciseNamesByDay(exerciseNames);
      setWorkoutVolumeByDay(volumeByDay);
    };

    load();
    return () => {
      mounted = false;
    };
  }, [user?.id, dataUserId, grid, calendarReloadKey, r]);

  const clearClipboard = () => {
    setWorkoutClipboard(null);
    setSelectedDayKeys(new Set());
    setPasteErrors([]);
    setPasteProgress({ done: 0, total: 0 });
  };

  const clearSelection = () => {
    setSelectedDayKeys(new Set());
    setPasteErrors([]);
    setPasteProgress({ done: 0, total: 0 });
  };

  const toggleSelectedDay = (dayKey) => {
    if (!dayKey) return;
    setSelectedDayKeys((prev) => {
      const next = new Set(prev);
      if (next.has(dayKey)) next.delete(dayKey);
      else next.add(dayKey);
      return next;
    });
  };

  const handleCopyDay = async (dayKey) => {
    if (!canEditPlans) return;
    const workoutId = workoutIdByDay?.[dayKey];
    if (!workoutId) return;
    if (!user?.id) return;

    try {
      setPasteErrors([]);
      const draft = await loadWorkoutDraftFromApi(workoutId);
      setWorkoutClipboard(draft);
      setSelectedDayKeys(new Set());
    } catch (e) {
      console.error('Ошибка копирования тренировки:', e);
      setPasteErrors([{ dayKey, message: 'Не удалось скопировать тренировку' }]);
    }
  };

  const applyPasteSelectedDays = async () => {
    if (!canEditPlans) return;
    if (!dataUserId) return;
    if (!user?.id) return;
    if (!workoutClipboard) return;

    const dayKeys = Array.from(selectedDayKeys || []).filter(Boolean).sort();
    if (dayKeys.length === 0) return;

    const ok = window.confirm(`Перезаписать тренировки в ${dayKeys.length} дней?`);
    if (!ok) return;

    const concurrency = 8;

    setPasting(true);
    setPasteErrors([]);
    setPasteProgress({ done: 0, total: dayKeys.length });

    // Preload existing workouts for selected range (to avoid per-day list calls)
    const minDay = dayKeys[0];
    const maxDay = dayKeys[dayKeys.length - 1];

    let existingByDay = {};
    try {
      const existing = await pb.collection('workouts').getFullList({
        filter: `user = "${dataUserId}" && date >= "${minDay}" && date <= "${maxDay}"`,
        sort: '-date',
        requestKey: null,
      });

      for (const w of existing || []) {
        const dk = toDayKey(w.date);
        if (!dk) continue;
        if (!existingByDay[dk]) existingByDay[dk] = [];
        existingByDay[dk].push(w.id);
      }
    } catch (e) {
      console.error('Ошибка предзагрузки тренировок для перезаписи:', e);
      // continue with empty map; paste fn will still work, but may fail if day already has workout uniqueness
      existingByDay = {};
    }

    const errors = [];
    let idx = 0;

    const worker = async () => {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const current = dayKeys[idx];
        idx += 1;
        if (!current) return;

        try {
          await pasteWorkoutDraftToDay({
            userId: dataUserId,
            dayKey: current,
            draft: workoutClipboard,
            existingWorkoutIds: existingByDay[current] || [],
          });
        } catch (e) {
          console.error('Ошибка вставки тренировки:', current, e);
          errors.push({ dayKey: current, message: e?.message || 'Не удалось вставить тренировку' });
        } finally {
          setPasteProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      setPasteErrors(errors);
      setCalendarReloadKey((x) => x + 1);
      setSelectedDayKeys(new Set());
    } finally {
      setPasting(false);
    }
  };

  return (
    <div className={styles.page}>
      <Header />
      <div className={styles.content}>
        {activeDayKey ? (
          <CalendarWorkoutForm
            dayKey={activeDayKey}
            onClose={() => setActiveDayKey(null)}
            onSaved={() => setCalendarReloadKey((x) => x + 1)}
            onWorkoutStatusChange={(dayKey, status) => {
              setWorkoutStatusByDay((prev) => ({ ...prev, [dayKey]: status }));
            }}
          />
        ) : (
          <>
            {pasteMode ? (
              <div className={styles.clipboardBanner} role="region" aria-label="Clipboard">
                <div className={styles.bannerTitle}>
                  Буфер: <b>{workoutClipboard?.title || 'Тренировка'}</b>
                </div>
                <div className={styles.bannerMeta}>Выбрано: {selectedDayKeys.size}</div>
                <div className={styles.bannerActions}>
                  <button
                    type="button"
                    className={styles.bannerBtnPrimary}
                    onClick={applyPasteSelectedDays}
                    disabled={pasting || selectedDayKeys.size === 0}
                  >
                    Вставить в {selectedDayKeys.size}
                  </button>
                  <button
                    type="button"
                    className={styles.bannerBtn}
                    onClick={clearSelection}
                    disabled={pasting || selectedDayKeys.size === 0}
                  >
                    Очистить выбор
                  </button>
                  <button
                    type="button"
                    className={styles.bannerBtn}
                    onClick={clearClipboard}
                    disabled={pasting}
                  >
                    Отмена
                  </button>
                </div>
                {pasting ? (
                  <div className={styles.bannerProgress}>
                    Готово {pasteProgress.done} / {pasteProgress.total}
                  </div>
                ) : null}
                {!pasting && pasteErrors.length ? (
                  <div className={styles.bannerError}>
                    Ошибки: {pasteErrors.length}. Проверьте консоль и попробуйте ещё раз.
                  </div>
                ) : null}
              </div>
            ) : null}
            {isTrainerOwnCalendar ? (
              <div className={styles.trainerHint}>
                Свой календарь. Чтобы вести план клиента — раздел «Клиенты».
              </div>
            ) : null}
            <MonthCarousel selectedMonthKey={selectedMonthKey} onSelectMonth={setSelectedMonthKey} />
            <MonthCalendar
              canCopy={canEditPlans}
              grid={grid}
              onDayClick={(dayKey) => setActiveDayKey(dayKey)}
              exerciseNamesByDay={exerciseNamesByDay}
              workoutStatusByDay={workoutStatusByDay}
              workoutIdByDay={workoutIdByDay}
              workoutTitleByDay={workoutTitleByDay}
              workoutVolumeByDay={workoutVolumeByDay}
              pasteMode={pasteMode}
              selectedDayKeys={selectedDayKeys}
              onToggleDay={toggleSelectedDay}
              onCopyDay={handleCopyDay}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default WorkoutCalendarPage;

