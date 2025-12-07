"use client";

import Image from 'next/image';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import styles from '../styles/HeroLocation.module.css';
import cardStyles from '../styles/OptionCard.module.css';
import { userSignIn, getUser } from '../lib/auth';

export default function HeroLocation() {
  const router = useRouter();

  // local state filled from getUser() or fallback defaults
  const [storeLocation, setStoreLocation] = useState('MGI');
  const [orderType, setOrderType] = useState(''); // '' | 'DI' | 'TA'
  const [tableNumber, setTableNumber] = useState(''); // e.g. 'Table 24' or ''

  useEffect(() => {
    // read saved user from localStorage on mount
    try {
      const saved = getUser();
    } catch (e) {
      console.error('HeroLocation: failed to read user', e);
    }
  }, []);

  const goToMenu = (mode) => {
    // If mode explicitly provided, use it; else use current orderType or default to TAKEAWAY
    const chosenMode = mode === 'dinein' ? 'DI' : mode === 'takeaway' ? 'TA' : (orderType || 'TA');

    // Prepare user object using current state
    const userAuth = {
      storeLocation: storeLocation || 'MGI',
      orderType: chosenMode,
      tableNumber: chosenMode === 'DI' ? (tableNumber || "") : 'Takeaway', // keep table only for dine-in
    };

    // persist and go to menu
    userSignIn(userAuth);
    router.push('/menu');
  };

  const handleKeyActivate = (e, mode) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      goToMenu(mode);
    }
  };

  return (
    <section className={styles.heroRoot}>
      <div className={styles.heroImageWrap}>
        <Image
          src="/images/new-hero.png"
          alt="hero"
          width={1200}
          height={420}
          priority
          className="w-full h-auto object-cover"
        />
      </div>

      <div className={styles.floatingCardContainer}>
        <div className={styles.cardRounded}>
          <div className={styles.cardInner}>
            <h3 className={styles.headerTitle}>Yoshinoya Mall Grand Indonesia</h3>
            <p className={styles.leadMuted}>Jl. M.H. Thamrin No.1, Kb. Melati, Kecamatan Tanah Abang, Kota Jakarta Pusat, Daerah Khusus Ibukota Jakarta 10230</p>

            <div className={styles.btnWrap}>
              <button
                className={styles.btnGradient}
                onClick={() => goToMenu('dinein')}
                aria-label="Buka menu - Makan di sini"
              >
                <Image
                  src="/images/chair-icon.png"
                  alt="Chair Icon"
                  width={18}
                  height={18}
                />
                <span style={{ fontSize: 14 }}>{tableNumber !== '' && tableNumber !== '000' ? tableNumber : 'Table'}</span>
              </button>
            </div>

            {/* option cards */}
            <div className={styles.optionsRow}>
              {/* Card 1 - Makan di sini */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Makan di sini"
                className={cardStyles.card}
                onClick={() => goToMenu('dinein')}
                onKeyDown={(e) => handleKeyActivate(e, 'dinein')}
                style={{ cursor: 'pointer' }}
              >
                <div className={cardStyles.imgWrap}>
                  <Image src="/images/eat-here.png" alt="Makan di sini" width={147} height={120} className="object-cover" />
                </div>
                <div className={cardStyles.title}>Makan di sini</div>
              </div>

              {/* Card 2 - Bawa pulang */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Bawa pulang"
                className={cardStyles.card}
                onClick={() => goToMenu('takeaway')}
                onKeyDown={(e) => handleKeyActivate(e, 'takeaway')}
                style={{ cursor: 'pointer' }}
              >
                <div className={cardStyles.imgWrap}>
                  <Image src="/images/takeaway.png" alt="Bawa pulang" width={147} height={120} className="object-cover" />
                </div>
                <div className={cardStyles.title}>Bawa pulang</div>
              </div>
            </div>

            {/* InfoBox rendered separately in page */}
          </div>
        </div>
      </div>
    </section>
  );
}
