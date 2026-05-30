/**
 * Карусель вариантов упражнения.
 *
 * Пример использования:
 * <ExerciseVariantCarousel
 *   variantIndex={0}
 *   variantCount={3}
 *   mode="edit"
 *   onPrev={() => setIndex((i) => i - 1)}
 *   onNext={() => setIndex((i) => i + 1)}
 * />
 */
import { getVariantLabel } from '../../lib/workoutVariantConstants';
import styles from './ExerciseVariantCarousel.module.css';

function ExerciseVariantCarousel({
  variantIndex,
  variantCount,
  mode,
  onPrev,
  onNext,
  positionIndex,
}) {
  const carouselPos = positionIndex ?? variantIndex;
  const atStart = carouselPos <= 0;
  const atEnd = carouselPos >= variantCount - 1;
  const label = getVariantLabel(variantIndex);
  const position = variantCount > 0 ? `${carouselPos + 1} / ${variantCount}` : '1 / 1';

  return (
    <div className={styles.carousel} data-mode={mode}>
      <button
        type="button"
        className={styles.arrowBtn}
        onClick={onPrev}
        disabled={atStart}
        aria-label="Предыдущий вариант"
      >
        ←
      </button>

      <div className={styles.labelWrap}>
        <span className={styles.label}>{label}</span>
        <span className={styles.position}>{position}</span>
      </div>

      <button
        type="button"
        className={styles.arrowBtn}
        onClick={onNext}
        disabled={atEnd}
        aria-label="Следующий вариант"
      >
        →
      </button>
    </div>
  );
}

export default ExerciseVariantCarousel;
