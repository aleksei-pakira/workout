// src/pages/RegisterPage.jsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import pb from '../lib/pocketbase';
import styles from './RegisterPage.module.css';

function RegisterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
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

    try {
      // Создаем пользователя в PocketBase
      const user = await pb.collection('users').create({
        email: formData.email,
        password: formData.password,
        passwordConfirm: formData.passwordConfirm,
        name: formData.name || formData.email.split('@')[0]
      });

      // Автоматически входим после регистрации
      await pb.collection('users').authWithPassword(
        formData.email,
        formData.password
      );

      // Перенаправляем на главную
      navigate('/');
    } catch (error) {
      console.error('Ошибка регистрации:', error);
      setErrors({
        form: error.message || 'Ошибка при регистрации. Попробуйте позже.'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>
          <span className={styles.titleIcon}>📝</span>
          Регистрация
        </h1>

        {errors.form && (
          <div className={styles.errorMessage}>
            ⚠️ {errors.form}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Имя (опционально) */}
          <div className={styles.formGroup}>
            <label className={styles.label}>
              Имя (необязательно)
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={styles.input}
              placeholder="Как к вам обращаться?"
            />
          </div>

          {/* Email */}
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
              placeholder="your@email.com"
            />
            {errors.email && (
              <div className={styles.errorText}>{errors.email}</div>
            )}
          </div>

          {/* Пароль */}
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
            />
            {errors.password && (
              <div className={styles.errorText}>{errors.password}</div>
            )}
          </div>

          {/* Подтверждение пароля */}
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
            />
            {errors.passwordConfirm && (
              <div className={styles.errorText}>{errors.passwordConfirm}</div>
            )}
          </div>

          {/* Требования к паролю */}
          <div className={styles.passwordRequirements}>
            <div className={styles.requirement}>
              {formData.password.length >= 8 ? '✅' : '⚪'} Минимум 8 символов
            </div>
            <div className={styles.requirement}>
              {/[A-Z]/.test(formData.password) ? '✅' : '⚪'} Хотя бы одна заглавная буква
            </div>
            <div className={styles.requirement}>
              {/[0-9]/.test(formData.password) ? '✅' : '⚪'} Хотя бы одна цифра
            </div>
          </div>

          {/* Кнопка регистрации */}
          <button
            type="submit"
            disabled={loading}
            className={styles.submitButton}
          >
            {loading ? (
              <>⏳ Регистрация...</>
            ) : (
              <>📝 Зарегистрироваться</>
            )}
          </button>
        </form>

        {/* Ссылка на вход */}
        <div className={styles.loginLink}>
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </div>

        {/* Тестовые данные */}
        <div className={styles.demoNote}>
          <strong>ℹ️ Для теста</strong> можно использовать:
          <div>test@example.com / Test123456</div>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;