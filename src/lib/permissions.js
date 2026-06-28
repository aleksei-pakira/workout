export const ROLES = {
  TRAINER: 'trainer',
  PERFORMER: 'performer',
};

export function isTrainer(user) {
  return user?.role === ROLES.TRAINER;
}

export function isPerformer(user) {
  if (!user) return false;
  return !user.role || user.role === ROLES.PERFORMER;
}

/** CRUD плана тренировок (календарь, create/paste/edit/delete). */
export function canEditPlans({ authUser, trainerLinkCount = 0, clientCanEditPlans = false }) {
  if (!authUser) return false;

  if (isTrainer(authUser)) return true;

  if (trainerLinkCount === 0) return true;
  return clientCanEditPlans === true;
}

/** CRUD библиотеки упражнений (exercises, custom_exercises, user_exercise_library). */
export function canManageExerciseLibrary({ authUser }) {
  return Boolean(authUser?.id);
}

/** Смена workout_status и sets.status на календаре. */
export function canChangeStatuses({ authUser }) {
  return Boolean(authUser?.id);
}

export function getCoachingModeLabel({ trainerLinkCount, clientCanEditPlans }) {
  if (trainerLinkCount === 0) return 'Самостоятельный режим';
  if (clientCanEditPlans) return 'С тренером — редактирование разрешено';
  return 'С тренером — план ведёт тренер';
}

export function isUniqueConstraintError(err) {
  const data = err?.data || err?.response?.data || {};
  for (const val of Object.values(data)) {
    if (val?.code === 'validation_not_unique') return true;
  }
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('unique') || msg.includes('validation_not_unique');
}
