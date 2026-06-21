// src/components/layout/Header.jsx
import { Link, useNavigate } from 'react-router-dom';
import pb from '../../lib/pocketbase';
import { clearSelectedClientId } from '../../lib/coachSessionStorage';
import { isTrainer } from '../../lib/permissions';
import { useCoachSession } from '../../hooks/useCoachSession';
import styles from './Header.module.css';

function Header() {
  const navigate = useNavigate();
  const user = pb.authStore.model;
  const {
    isTrainerView,
    selectedClient,
    clearClient,
  } = useCoachSession();

  const handleLogout = () => {
    clearSelectedClientId();
    pb.authStore.clear();
    navigate('/login');
  };

  const getInitial = () => {
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return '?';
  };

  const clientLabel = selectedClient?.name || selectedClient?.email || 'Клиент';

  return (
    <>
      {isTrainer(user) && isTrainerView ? (
        <div className={styles.coachBanner}>
          <span>
            Клиент: <strong>{clientLabel}</strong>
          </span>
          <button type="button" className={styles.coachBannerBtn} onClick={() => { clearClient(); navigate('/clients'); }}>
            Сменить клиента
          </button>
        </div>
      ) : null}
      {isTrainer(user) && !isTrainerView ? (
        <div className={styles.coachBannerWarn}>
          <span>Выберите клиента для работы с тренировками</span>
          <button type="button" className={styles.coachBannerBtn} onClick={() => navigate('/clients')}>
            Клиенты
          </button>
        </div>
      ) : null}
      <header className={`${styles.header} ${isTrainer(user) ? styles.headerWithBanner : ''}`}>
        <div className={styles.headerContainer}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Link to="/" className={styles.logo}>
              <span className={styles.logoFull}>WorkoutTracker</span>
              <span className={styles.logoShort}>WT</span>
            </Link>

            <nav className={styles.nav}>
              <Link to="/workouts/calendar" className={styles.navLink}>
                Тренировки
              </Link>
              <Link to="/exercises" className={styles.navLink}>
                Упражнения
              </Link>
              {isTrainer(user) ? (
                <Link to="/clients" className={styles.navLink}>
                  Клиенты
                </Link>
              ) : null}
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
    </>
  );
}

export default Header;
