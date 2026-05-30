/**
 * Миграция: workout_exercises.exercise + sets.workout_exercise
 * → workout_exercise_variants + sets.workout_exercise_variant
 *
 * Запуск:
 *   PB_URL=http://127.0.0.1:8090 \
 *   PB_ADMIN_EMAIL=admin@example.com \
 *   PB_ADMIN_PASSWORD=secret \
 *   node scripts/migrate-variants.mjs
 */

import PocketBase from 'pocketbase';

const pbUrl = process.env.PB_URL || process.env.VITE_PB_URL || 'http://127.0.0.1:8090';
const adminEmail = process.env.PB_ADMIN_EMAIL;
const adminPassword = process.env.PB_ADMIN_PASSWORD;

if (!adminEmail || !adminPassword) {
  console.error('Укажите PB_ADMIN_EMAIL и PB_ADMIN_PASSWORD');
  process.exit(1);
}

const pb = new PocketBase(pbUrl);

async function main() {
  console.log(`PocketBase: ${pbUrl}`);
  await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);

  const allWe = await pb.collection('workout_exercises').getFullList({ sort: 'created' });
  console.log(`Блоков workout_exercises: ${allWe.length}`);

  let variantsCreated = 0;
  let setsMigrated = 0;
  let skipped = 0;

  for (const we of allWe) {
    const exerciseId = we.exercise;
    if (!exerciseId) {
      console.warn(`  [skip] ${we.id} — нет exercise`);
      skipped += 1;
      continue;
    }

    let variant0 = null;
    try {
      const existing = await pb.collection('workout_exercise_variants').getFullList({
        filter: `workout_exercise = "${we.id}" && variant_index = 0`,
      });
      variant0 = existing[0] || null;
    } catch (e) {
      console.error(`  [error] не удалось проверить variants для ${we.id}:`, e.message);
      continue;
    }

    if (!variant0) {
      variant0 = await pb.collection('workout_exercise_variants').create({
        workout_exercise: we.id,
        exercise: exerciseId,
        variant_index: 0,
      });
      variantsCreated += 1;
      console.log(`  [variant] создан variant 0 для ${we.id}`);
    }

    const legacySets = await pb.collection('sets').getFullList({
      filter: `workout_exercise = "${we.id}"`,
      sort: 'set_number',
    });

    for (const s of legacySets) {
      if (s.workout_exercise_variant === variant0.id) continue;

      await pb.collection('sets').update(s.id, {
        workout_exercise_variant: variant0.id,
      });
      setsMigrated += 1;
    }

    const activeIndex = we.active_variant_index ?? 0;
    if (activeIndex !== 0) {
      await pb.collection('workout_exercises').update(we.id, {
        active_variant_index: 0,
      });
    } else if (we.active_variant_index === undefined || we.active_variant_index === null) {
      try {
        await pb.collection('workout_exercises').update(we.id, {
          active_variant_index: 0,
        });
      } catch {
        // поле может ещё не существовать в схеме
      }
    }
  }

  console.log('');
  console.log('Готово:');
  console.log(`  variants создано: ${variantsCreated}`);
  console.log(`  sets перепривязано: ${setsMigrated}`);
  console.log(`  пропущено блоков: ${skipped}`);
}

main().catch((e) => {
  console.error('Ошибка миграции:', e);
  process.exit(1);
});
