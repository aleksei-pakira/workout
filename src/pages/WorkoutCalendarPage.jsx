import { useMemo, useState } from 'react';
import Header from '../components/layout/Header';
import MonthCalendar from '../components/workouts/MonthCalendar';
import MonthCarousel from '../components/workouts/MonthCarousel';
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

  const grid = useMemo(() => buildMonthGrid(selectedMonthKey), [selectedMonthKey]);

  return (
    <div className={styles.page}>
      <Header />
      <div className={styles.content}>
        <MonthCarousel selectedMonthKey={selectedMonthKey} onSelectMonth={setSelectedMonthKey} />
        <MonthCalendar
          grid={grid}
        />
      </div>
    </div>
  );
}

export default WorkoutCalendarPage;

