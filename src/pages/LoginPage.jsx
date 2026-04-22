// src/pages/LoginPage.jsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom'; // 👈 ДОБАВЬТЕ Link сюда!
import pb from '../lib/pocketbase';
import styles from './LoginPage.module.css';

function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAdminLogin = async () => {
    try {
      setLoading(true);
      setError('');
      await pb.admins.authWithPassword('admin@trainer.local', 'trainer.local');
      navigate('/');
    } catch (error) {
      setError('Ошибка входа админа: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUserLogin = async () => {
    try {
      setLoading(true);
      setError('');
      await pb.collection('users').authWithPassword('user@demo.com', 'trainer.local');
      navigate('/');
    } catch (error) {
      setError('Ошибка входа пользователя: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>
          Вход в дневник
        </h1>

        {error && (
          <div className={styles.errorMessage}>
            <span className={styles.errorIcon}>⚠️</span>
            {error}
          </div>
        )}

        <div className={styles.buttonContainer}>
          <button
            onClick={handleAdminLogin}
            disabled={loading}
            className={styles.adminButton}
          >
            <span className={styles.buttonIcon}>🔑</span>
            Войти как администратор
            {loading && <span className={styles.loader}></span>}
          </button>

          <button
            onClick={handleUserLogin}
            disabled={loading}
            className={styles.userButton}
          >
            <span className={styles.buttonIcon}>👤</span>
            Войти как пользователь
            {loading && <span className={styles.loader}></span>}
          </button>
        </div>

        {/* 👇 ССЫЛКА НА РЕГИСТРАЦИЮ - ПРАВИЛЬНОЕ МЕСТО 👇 */}
        <div className={styles.registerLink}>
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </div>

        <div className={styles.infoText}>
          <div>Тестовые аккаунты:</div>
          <div className={styles.demoCredentials}>
            admin@trainer.local / trainer.local
          </div>
          <div className={styles.demoCredentials}>
            user@demo.com / trainer.local
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;