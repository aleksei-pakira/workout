/// <reference path="../pb_data/types.d.ts" />

function getAuthRole(e) {
  if (!e.auth) return '';
  return String(e.auth.get('role') || '');
}

function isTrainer(e) {
  return getAuthRole(e) === 'trainer';
}

function isPerformer(e) {
  return getAuthRole(e) === 'performer';
}

function performerHasTrainer(app, performerId) {
  const rows = app.findRecordsByFilter(
    'trainer_clients',
    'client = {:client}',
    '-created',
    1,
    0,
    { client: performerId }
  );
  return rows.length > 0;
}

function performerCanEditPlans(app, performerId) {
  let rows = [];
  try {
    rows = app.findRecordsByFilter(
      'client_settings',
      'performer = {:id}',
      '',
      1,
      0,
      { id: performerId }
    );
  } catch (err) {
    return false;
  }
  if (rows.length === 0) return false;
  return rows[0].get('client_can_edit_plans') === true;
}

function isCoachedLocked(app, e) {
  if (!e.auth || !isPerformer(e)) return false;
  const id = e.auth.id;
  if (!performerHasTrainer(app, id)) return false;
  if (performerCanEditPlans(app, id)) return false;
  return true;
}

function fieldChanged(record, original, name) {
  return String(record.get(name) ?? '') !== String(original.get(name) ?? '');
}

function forbid(msg) {
  throw new ForbiddenError(msg || 'Недостаточно прав');
}

function ensureClientSettings(app, performerId) {
  const existing = app.findRecordsByFilter(
    'client_settings',
    'performer = {:id}',
    '',
    1,
    0,
    { id: performerId }
  );
  if (existing.length > 0) return;

  const col = app.findCollectionByNameOrId('client_settings');
  const rec = new Record(col);
  rec.set('performer', performerId);
  rec.set('client_can_edit_plans', false);
  app.save(rec);
}

function blockCoachedStructure(app, e) {
  if (e.hasSuperuserAuth()) return;
  if (isTrainer(e)) return;
  if (isCoachedLocked(app, e)) {
    forbid('План ведёт тренер. Редактирование недоступно.');
  }
}

onRecordUpdateRequest(function (e) {
  if (e.hasSuperuserAuth()) return e.next();
  if (isTrainer(e)) return e.next();
  if (!isCoachedLocked(e.app, e)) return e.next();

  const original = e.record.originalCopy();
  const allowed = { workout_status: true };
  const check = ['user', 'date', 'title', 'notes', 'workout_status'];

  for (let i = 0; i < check.length; i++) {
    const f = check[i];
    if (fieldChanged(e.record, original, f) && !allowed[f]) {
      forbid('Можно менять только статус тренировки.');
    }
  }

  e.next();
}, 'workouts');

onRecordUpdateRequest(function (e) {
  if (e.hasSuperuserAuth()) return e.next();
  if (isTrainer(e)) return e.next();
  if (!isCoachedLocked(e.app, e)) return e.next();

  const original = e.record.originalCopy();
  const allowed = { status: true };
  const check = ['status', 'weight', 'reps', 'set_number', 'values', 'workout_exercise_variant'];

  for (let i = 0; i < check.length; i++) {
    const f = check[i];
    if (fieldChanged(e.record, original, f) && !allowed[f]) {
      forbid('Можно менять только статус подхода.');
    }
  }

  e.next();
}, 'sets');

onRecordCreateRequest(function (e) {
  blockCoachedStructure(e.app, e);
  e.next();
}, 'workouts');

onRecordDeleteRequest(function (e) {
  blockCoachedStructure(e.app, e);
  e.next();
}, 'workouts');

['workout_exercises', 'workout_exercise_variants'].forEach(function (name) {
  onRecordCreateRequest(function (e) {
    blockCoachedStructure(e.app, e);
    e.next();
  }, name);

  onRecordDeleteRequest(function (e) {
    blockCoachedStructure(e.app, e);
    e.next();
  }, name);

  onRecordUpdateRequest(function (e) {
    blockCoachedStructure(e.app, e);
    e.next();
  }, name);
});

onRecordCreateRequest(function (e) {
  blockCoachedStructure(e.app, e);
  e.next();
}, 'sets');

onRecordDeleteRequest(function (e) {
  blockCoachedStructure(e.app, e);
  e.next();
}, 'sets');

onRecordUpdateRequest(function (e) {
  if (e.hasSuperuserAuth()) return e.next();

  if (!isTrainer(e)) {
    forbid('Только тренер может менять настройки клиента.');
  }

  const performerId = e.record.get('performer');
  if (!performerId) return e.next();

  const links = e.app.findRecordsByFilter(
    'trainer_clients',
    'trainer = {:t} && client = {:c}',
    '',
    1,
    0,
    { t: e.auth.id, c: performerId }
  );

  if (links.length === 0) {
    forbid('Нет связи с этим клиентом.');
  }

  e.next();
}, 'client_settings');

onRecordCreateRequest(function (e) {
  if (e.hasSuperuserAuth()) return e.next();

  const trainerId = e.record.get('trainer');
  const clientId = e.record.get('client');

  if (!trainerId || !clientId) {
    throw new BadRequestError('trainer и client обязательны');
  }
  if (trainerId === clientId) {
    throw new BadRequestError('Нельзя привязать себя к себе');
  }

  const trainer = e.app.findRecordById('users', trainerId);
  const client = e.app.findRecordById('users', clientId);

  if (trainer.get('role') !== 'trainer') {
    throw new BadRequestError('trainer должен иметь role = trainer');
  }
  if (client.get('role') !== 'performer') {
    throw new BadRequestError('client должен иметь role = performer');
  }

  if (e.auth && clientId !== e.auth.id) {
    forbid('Можно присоединиться только от своего имени.');
  }

  ensureClientSettings(e.app, clientId);

  e.next();
}, 'trainer_clients');
