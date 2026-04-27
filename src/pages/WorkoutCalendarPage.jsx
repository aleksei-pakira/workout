import { useEffect, useMemo, useState } from 'react';
import Header from '../components/layout/Header';
import pb from '../lib/pocketbase';
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

function addMonths(monthKey, delta) {
  const { year, monthIndex } = parseMonthKey(monthKey);
  const d = new Date(year, monthIndex, 1);
  d.setMonth(d.getMonth() + delta);
  return toMonthKey(d);
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

  const grid = useMemo(() => buildMonthGrid(selectedMonthKey), [selectedMonthKey]);

  const user = pb.authStore.model;
  const [exerciseNamesByDay, setExerciseNamesByDay] = useState({});

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!user?.id) return;
      if (!grid?.length) return;

      const rangeStart = grid[0]?.dayKey;
      const rangeEnd = grid[grid.length - 1]?.dayKey;
      if (!rangeStart || !rangeEnd) return;

      try {
        // 1) workouts for visible 42-day range
        const workouts = await pb.collection('workouts').getFullList({
          filter: `user = "${user.id}" && date >= "${rangeStart}" && date <= "${rangeEnd}"`,
          sort: '-date',
          requestKey: null,
        });

        if (!mounted) return;
        if (!workouts.length) {
          setExerciseNamesByDay({});
          return;
        }

        const workoutDayKeyById = new Map();
        for (const w of workouts) {
          const dayKey = toDayKey(w.date);
          if (dayKey) workoutDayKeyById.set(w.id, dayKey);
        }

        const workoutIds = Array.from(workoutDayKeyById.keys());
        const orFilter = workoutIds.map((id) => `workout = "${id}"`).join(' || ');

        // 2) workout_exercises for those workouts (names only)
        const wes = await pb.collection('workout_exercises').getFullList({
          filter: orFilter,
          expand: 'exercise',
          requestKey: null,
        });

        if (!mounted) return;

        const map = new Map(); // dayKey -> Set(names)
        for (const we of wes) {
          const dayKey = workoutDayKeyById.get(we.workout);
          if (!dayKey) continue;

          const name = we.expand?.exercise?.exercise_name || we.custom_name || we.exercise_name;
          if (!name) continue;

          if (!map.has(dayKey)) map.set(dayKey, new Set());
          map.get(dayKey).add(String(name));
        }

        const obj = {};
        for (const [dayKey, set] of map.entries()) {
          obj[dayKey] = Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
        }
        setExerciseNamesByDay(obj);
      } catch (e) {
        console.error('Ошибка загрузки упражнений для календаря:', e);
        if (!mounted) return;
        setExerciseNamesByDay({});
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [user?.id, grid, calendarReloadKey]);

  return (
    <div className={styles.page}>
      <Header />
      <div className={styles.content}>
        {activeDayKey ? (
          <CalendarWorkoutForm
            dayKey={activeDayKey}
            onClose={() => setActiveDayKey(null)}
            onSaved={() => setCalendarReloadKey((x) => x + 1)}
          />
        ) : (
          <>
            <MonthCarousel selectedMonthKey={selectedMonthKey} onSelectMonth={setSelectedMonthKey} />
            <MonthCalendar
              grid={grid}
              onDayClick={(dayKey) => setActiveDayKey(dayKey)}
              exerciseNamesByDay={exerciseNamesByDay}
              maxLines={5}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default WorkoutCalendarPage;

