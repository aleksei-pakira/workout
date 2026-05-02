import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import pb from '../lib/pocketbase';
import styles from './RegisterPage.module.css';

function pbErrorToFieldErrors(err) {
  const out = {};
  const data = err?.data?.data || err?.data || null;
  if (data && typeof data === 'object') {
    for (const [key, val] of Object.entries(data)) {
      if (val && typeof val === 'object' && typeof val.message === 'string') {
        out[key] = val.code === 'validation_not_unique' ? 'Email уже используется' : val.message;
      }
    }
  }
  return out;
}

function RegisterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [mode, setMode] = useState('form'); // form | verify_sent
  const [verifySending, setVerifySending] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    passwordConfirm: '',
    name: ''
  });

  // Валидация формы
  const validateForm = () => {
    const newErrors = {};

    if (!formData.email) {
      newErrors.email = 'Email обязателен';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Неверный формат email';
    }

    if (!formData.password) {
      newErrors.password = 'Пароль обязателен';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Пароль должен быть минимум 8 символов';
    }

    if (formData.password !== formData.passwordConfirm) {
      newErrors.passwordConfirm = 'Пароли не совпадают';
    }

    return newErrors;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Очищаем ошибку при изменении поля
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const emailTrimmed = useMemo(() => formData.email.trim(), [formData.email]);

  const requestVerify = async () => {
    if (!emailTrimmed) return;
    try {
      setVerifySending(true);
      setVerifyError('');
      await pb.collection('users').requestVerification(emailTrimmed, { requestKey: null });
    } catch (err) {
      console.error('Ошибка отправки письма подтверждения:', err);
      setVerifyError('Не удалось отправить письмо. Попробуйте позже.');
    } finally {
      setVerifySending(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Валидация
    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    setErrors({});
    setVerifyError('');

    try {
      // Создаем пользователя в PocketBase
      await pb.collection('users').create({
        email: emailTrimmed,
        password: formData.password,
        passwordConfirm: formData.passwordConfirm,
        name: formData.name || emailTrimmed.split('@')[0]
      }, { requestKey: null });

      await pb.collection('users').requestVerification(emailTrimmed, { requestKey: null });
      setMode('verify_sent');
    } catch (err) {
      console.error('Ошибка регистрации:', err);
      const fieldErrors = pbErrorToFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
      } else {
        setErrors({
          form: err?.message || 'Не удалось создать аккаунт. Попробуйте позже.'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {mode === 'verify_sent' ? (
          <>
            <h1 className={styles.title}>Проверьте почту</h1>
            <div className={styles.muted}>
              Мы отправили письмо на <span className={styles.emailInline}>{emailTrimmed}</span>. Перейдите по ссылке из
              письма, чтобы подтвердить email.
            </div>

            {verifyError ? (
              <div className={styles.errorMessage}>
                ⚠️ {verifyError}
              </div>
            ) : null}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnOutline}
                disabled={verifySending}
                onClick={requestVerify}
              >
                Отправить письмо ещё раз
              </button>
              <button type="button" className={styles.btnPrimary} onClick={() => navigate('/login')}>
                Войти
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className={styles.title}>Регистрация</h1>

            {errors.form ? (
              <div className={styles.errorMessage}>
                ⚠️ {errors.form}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Имя (необязательно)</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className={styles.input}
                  placeholder="Как к вам обращаться?"
                  disabled={loading}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Email <span className={styles.required}>*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={`${styles.input} ${errors.email ? styles.inputError : ''}`}
                  placeholder="you@email.com"
                  autoComplete="email"
                  disabled={loading}
                />
                {errors.email ? <div className={styles.errorText}>{errors.email}</div> : null}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Пароль <span className={styles.required}>*</span>
                </label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className={`${styles.input} ${errors.password ? styles.inputError : ''}`}
                  placeholder="Минимум 8 символов"
                  autoComplete="new-password"
                  disabled={loading}
                />
                {errors.password ? <div className={styles.errorText}>{errors.password}</div> : null}
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Подтверждение пароля <span className={styles.required}>*</span>
                </label>
                <input
                  type="password"
                  name="passwordConfirm"
                  value={formData.passwordConfirm}
                  onChange={handleChange}
                  className={`${styles.input} ${errors.passwordConfirm ? styles.inputError : ''}`}
                  placeholder="Повторите пароль"
                  autoComplete="new-password"
                  disabled={loading}
                />
                {errors.passwordConfirm ? (
                  <div className={styles.errorText}>{errors.passwordConfirm}</div>
                ) : null}
              </div>

              <div className={styles.helpText}>Пароль должен быть минимум 8 символов.</div>

              <button type="submit" disabled={loading} className={styles.btnPrimary}>
                {loading ? 'Создаём…' : 'Создать аккаунт'}
              </button>
            </form>

            <div className={styles.loginLink}>
              Уже есть аккаунт? <Link to="/login">Войти</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default RegisterPage;