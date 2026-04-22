// src/components/layout/Header.jsx
import { Link, useNavigate } from 'react-router-dom';
import pb from '../../lib/pocketbase'; // Два уровня вверх: components/layout -> src -> lib
import styles from './Header.module.css';

function Header() {
  const navigate = useNavigate();
  const user = pb.authStore.model;

  const handleLogout = () => {
    pb.authStore.clear();
    navigate('/login');
  };

  const getInitial = () => {
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return '?';
  };

  return (
    <header className={styles.header}>
      <div className={styles.headerContainer}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Link to="/" className={styles.logo}>
            <span className={styles.logoFull}>WorkoutTracker</span>
            <span className={styles.logoShort}>WT</span>
          </Link>

          <nav className={styles.nav}>
            <Link to="/workouts" className={styles.navLink}>
              Тренировки
            </Link>
            <Link to="/exercises" className={styles.navLink}>
              Упражнения
            </Link>
          </nav>
        </div>

        <div className={styles.userSection}>
          {user ? (
            <>
              <span className={styles.userEmail}>
                {user.email}
              </span>
              <div
                className={styles.avatar}
                onClick={() => navigate('/profile')}
                title="Профиль"
              >
                {getInitial()}
              </div>
              <button
                onClick={handleLogout}
                className={styles.logoutBtn}
              >
                Выйти
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className={styles.loginBtn}
            >
              Войти
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;