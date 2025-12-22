// components/AddPopup.js
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { userSignIn, getUser } from '../lib/auth';

export default function AddPopup({
  visible = false,
  anchorRef = null,   // ref to the button element
  onClose = () => {},
  // autoHide intentionally unused — popup closes only on outside click
  width = 125,
  height = 84,
  children = null
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [show, setShow] = useState(Boolean(visible))
  const popupRef = useRef(null)
  const router = useRouter()
  const [storeLocation, setStoreLocation] = useState('MGI');
  const [orderType, setOrderType] = useState(''); // '' | 'DI' | 'TA'
  const [tableNumber, setTableNumber] = useState(''); // e.g. 'Table 24' or ''

  useEffect(() => {
    // read saved user from localStorage on mount
    try {
      const saved = getUser();
      if (saved && typeof saved === 'object') {
        // use saved values if available (keeps fallback if not)
        if (saved.storeLocation) setStoreLocation(saved.storeLocation);
        if (saved.orderType) setOrderType(saved.orderType);
        if (saved.tableNumber) setTableNumber(saved.tableNumber);
      }
    } catch (e) {
      console.error('HeroLocation: failed to read user', e);
    }
  }, []);

  // sync visible prop -> internal
  useEffect(() => {
    setShow(Boolean(visible))
  }, [visible])
  
  const goToMenu = (mode) => {
    // If mode explicitly provided, use it; else use current orderType or default to TAKEAWAY
    const chosenMode = mode === 'dinein' ? 'DI' : mode === 'takeaway' ? 'TA' : "" ;
    let newTablenumber = tableNumber
    if (mode === 'takeaway') {
      newTablenumber = '000'
    } else if (mode === 'DI' && tableNumber === '') {
      newTablenumber = '000'
    }


    // Prepare user object using current state
    const userAuth = {
      storeLocation: storeLocation || 'MGI',
      orderType: chosenMode,
      tableNumber: newTablenumber, // keep table only for dine-in
    };

    // persist and go to menu
    userSignIn(userAuth);
    router.push('/menu');
  };

  // compute position relative to anchorRef
  useLayoutEffect(() => {
    if (!anchorRef || !anchorRef.current || !show) return
    const el = anchorRef.current
    const rect = el.getBoundingClientRect()

    const scrollY = window.scrollY || window.pageYOffset
    const scrollX = window.scrollX || window.pageXOffset
    const desiredTop = rect.bottom + 6 + scrollY // 6px gap below button
    let desiredLeft = rect.left + scrollX

    // clamp so popup doesn't overflow right edge
    const viewportW = document.documentElement.clientWidth || window.innerWidth
    const maxLeft = Math.max(8, viewportW - width - 8) // keep 8px margin
    desiredLeft = Math.min(Math.max(8, desiredLeft), maxLeft)

    setPos({ top: desiredTop, left: desiredLeft })
  }, [anchorRef, show, width, height])

  // click outside -> close
  useEffect(() => {
    if (!show) return

    function onDocClick(e) {
      const p = popupRef.current
      if (!p) return
      // if click happened outside popup element -> close
      if (!p.contains(e.target)) {
        setShow(false)
        onClose?.()
      }
    }

    // use capture so we reliably catch clicks
    document.addEventListener('mousedown', onDocClick, true)
    document.addEventListener('touchstart', onDocClick, true)
    return () => {
      document.removeEventListener('mousedown', onDocClick, true)
      document.removeEventListener('touchstart', onDocClick, true)
    }
  }, [show, onClose])

  if (!show) return null

  return (
    <>
      {/* transparent overlay to capture outside clicks (also for accessibility) */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1200,
          background: 'transparent',
          pointerEvents: 'auto'
        }}
        // clicking overlay will trigger document listener above as well,
        // but we also close here to be explicit
        onClick={() => {
          setShow(false)
          onClose?.()
        }}
        aria-hidden
      />

      {/* popup container */}
      <div
        ref={popupRef}
        role="dialog"
        aria-modal="false"
        style={{
          position: 'absolute',
          top: pos.top,
          left: pos.left,
          zIndex: 1300,
          width: width,
          height: height,
          borderRadius: 8,
          border: '1px solid rgba(0,0,0,0.06)',
          background: '#fff',
          boxShadow: '0 8px 20px rgba(2,6,23,0.12)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 8,
          boxSizing: 'border-box',
          pointerEvents: 'auto',
          gap: 6
        }}
      >
        {/* If children provided, render it (useful for custom content). Otherwise render default two-line layout */}
        {children ? (
          children
        ) : (
          <>
            {/* Row: Dine In */}
            <button 
                style={{ display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'white' }}
                onClick={() => goToMenu('dinein')}
            >
              <div style={{ width: 16, height: 16, flex: '0 0 16px' }}>
                <Image src="/images/fork-knife-icon.png" alt="Dine In" width={16} height={16} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  fontFamily: 'Gotham, Inter, system-ui, sans-serif',
                  fontWeight: 325,
                  fontSize: 12,
                  lineHeight: '150%',
                  color: '#111827'
                }}>Menu Dine In</div>
                <div style={{
                  fontFamily: 'Gotham, Inter, system-ui, sans-serif',
                  fontWeight: 325,
                  fontSize: 12,
                  lineHeight: '150%',
                  color: '#6b7280'
                }} />
              </div>
            </button>

            {/* Row: Takeaway */}
            <button 
                style={{ display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'white' }}
                onClick={() => goToMenu('takeaway')}
            >
              <div style={{ width: 16, height: 16, flex: '0 0 16px' }}>
                <Image src="/images/tote-icon.png" alt="Takeaway" width={16} height={16} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  fontFamily: 'Gotham, Inter, system-ui, sans-serif',
                  fontWeight: 325,
                  fontSize: 12,
                  lineHeight: '150%',
                  color: '#111827'
                }}>Menu Takeaway</div>
                <div style={{
                  fontFamily: 'Gotham, Inter, system-ui, sans-serif',
                  fontWeight: 325,
                  fontSize: 12,
                  lineHeight: '150%',
                  color: '#6b7280'
                }} />
              </div>
            </button>
          </>
        )}
      </div>
    </>
  )
}
