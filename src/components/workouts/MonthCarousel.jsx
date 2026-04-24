import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './MonthCarousel.module.css';

const MONTHS_SHORT_RU = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

function parseMonthKey(monthKey) {
  const [y, m] = String(monthKey).split('-').map((x) => Number(x));
  const now = new Date();
  const year = Number.isFinite(y) ? y : now.getFullYear();
  const monthIndex = Number.isFinite(m) ? Math.max(1, Math.min(12, m)) - 1 : now.getMonth();
  return { year, monthIndex };
}

function toMonthKeyFromParts(year, monthIndex) {
  const y = year;
  const m = String(monthIndex + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function addMonths(monthKey, delta) {
  const { year, monthIndex } = parseMonthKey(monthKey);
  const d = new Date(year, monthIndex, 1);
  d.setMonth(d.getMonth() + delta);
  return toMonthKeyFromParts(d.getFullYear(), d.getMonth());
}

function MonthCarousel({ selectedMonthKey, onSelectMonth }) {
  const WINDOW = 60; // months to each side
  const SHIFT = 24; // months to shift window when reaching edges
  const EDGE_PX = 220; // px from edge to trigger window shift

  const scrollerRef = useRef(null);
  const pendingCenterMonthKeyRef = useRef(null);
  const scrollRafRef = useRef(0);

  const [anchorMonthKey, setAnchorMonthKey] = useState(selectedMonthKey);

  useEffect(() => {
    // keep anchor in sync when selection jumps (e.g., prev/next buttons)
    setAnchorMonthKey(selectedMonthKey);
  }, [selectedMonthKey]);

  const items = useMemo(() => {
    const base = anchorMonthKey;
    const months = [];

    for (let i = -WINDOW; i <= WINDOW; i += 1) {
      const key = addMonths(base, i);
      const { year, monthIndex } = parseMonthKey(key);

      if (monthIndex === 0) {
        months.push({ type: 'year', key: `year-${year}`, year });
      }

      months.push({
        type: 'month',
        key,
        monthKey: key,
        label: MONTHS_SHORT_RU[monthIndex],
      });
    }

    return months;
  }, [anchorMonthKey]);

  const scrollMonthIntoView = (monthKey) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const el = scroller.querySelector(`[data-month-key="${monthKey}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', inline: 'center' });
  };

  useEffect(() => {
    // ensure selected month stays visible
    scrollMonthIntoView(selectedMonthKey);
  }, [selectedMonthKey]);

  useEffect(() => {
    // after anchor shift: keep the visual center month in place
    const monthKey = pendingCenterMonthKeyRef.current;
    if (!monthKey) return;
    pendingCenterMonthKeyRef.current = null;
    scrollMonthIntoView(monthKey);
  }, [anchorMonthKey]);

  const captureCenterMonthKey = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return null;
    const r = scroller.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const el = document.elementFromPoint(x, y);
    const btn = el?.closest?.('[data-month-key]');
    return btn?.getAttribute?.('data-month-key') || null;
  };

  const handleScroll = () => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const scroller = scrollerRef.current;
      if (!scroller) return;

      const nearLeft = scroller.scrollLeft < EDGE_PX;
      const nearRight = scroller.scrollLeft + scroller.clientWidth > scroller.scrollWidth - EDGE_PX;
      if (!nearLeft && !nearRight) return;

      const centerKey = captureCenterMonthKey();
      pendingCenterMonthKeyRef.current = centerKey || selectedMonthKey;

      setAnchorMonthKey((prev) => addMonths(prev, nearLeft ? -SHIFT : SHIFT));
    });
  };

  return (
    <div className={styles.wrapper}>
      <div ref={scrollerRef} className={styles.scroller} onScroll={handleScroll}>
        {items.map((it) => {
          if (it.type === 'year') {
            return (
              <div key={it.key} className={styles.yearDivider}>
                {it.year}
              </div>
            );
          }

          const active = it.monthKey === selectedMonthKey;
          return (
            <button
              key={it.key}
              type="button"
              className={active ? styles.monthChipActive : styles.monthChip}
              onClick={() => onSelectMonth(it.monthKey)}
              data-month-key={it.monthKey}
            >
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default MonthCarousel;

