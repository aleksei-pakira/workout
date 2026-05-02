import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import pb from '../lib/pocketbase';
import styles from './LoginPage.module.css';

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email.trim() || !password) return;

    try {
      setLoading(true);
      setError('');
      await pb.collection('users').authWithPassword(email.trim(), password, { requestKey: null });
      navigate('/');
    } catch (err) {
      const status = err?.status;
      const message = String(err?.message || '');
      if (status === 403 && message.toLowerCase().includes('requirements to authenticate')) {
        setError('Подтвердите email (письмо могло попасть в спам).');
      } else {
        setError('Неверный email или пароль.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Вход</h1>

        {error ? (
          <div className={styles.errorMessage}>
            <span className={styles.errorIcon}>⚠️</span>
            {error}
          </div>
        ) : null}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Email</label>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@email.com"
              disabled={loading}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Пароль</label>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              disabled={loading}
              required
            />
          </div>

          <button type="submit" className={styles.userButton} disabled={loading}>
            Войти
            {loading ? <span className={styles.loader} /> : null}
          </button>
        </form>

        <div className={styles.registerLink}>
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;