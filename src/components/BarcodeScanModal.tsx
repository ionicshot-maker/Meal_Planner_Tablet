import { useEffect, useRef, useState } from 'react'
import Quagga from '@ericblade/quagga2'
import { Modal } from './ui'
import styles from './BarcodeScanModal.module.css'

type ScanState = 'loading' | 'active' | 'denied' | 'nocamera' | 'error'
type QuaggaDetected = { codeResult: { code: string | null } }

interface Props {
  onDetected: (code: string) => void
  onClose: () => void
}

// Standalone camera-scan modal — same Quagga2 lifecycle as the Import Ingredients
// barcode tab, packaged so it can be launched from anywhere (e.g. the ingredient
// editor's "Scan" button) without leaving the current screen.
export function BarcodeScanModal({ onDetected, onClose }: Props) {
  const [scanState, setScanState] = useState<ScanState>('loading')
  const [scanFlash, setScanFlash] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let scanned = false

    function detected(result: QuaggaDetected) {
      if (cancelled || scanned) return
      const code = result.codeResult.code
      if (!code) return
      scanned = true
      setScanFlash(true)
      try { navigator.vibrate?.(120) } catch { /* not supported */ }
      try { Quagga.offDetected(detected) } catch { /* ignore */ }
      try { Quagga.stop() } catch { /* ignore */ }
      activeRef.current = false
      setTimeout(() => { if (!cancelled) onDetected(code) }, 250)
    }

    (async () => {
      try {
        await Quagga.init({
          inputStream: {
            type: 'LiveStream',
            target: containerRef.current!,
            constraints: {
              facingMode: { ideal: 'environment' },
              width:  { min: 320, ideal: 1280 },
              height: { min: 240, ideal: 720  },
            },
          },
          locator: { patchSize: 'medium', halfSample: true },
          numOfWorkers: 0,
          frequency: 10,
          decoder: { readers: ['ean_reader', 'ean_8_reader', 'upc_reader', 'upc_e_reader', 'code_128_reader'] },
          locate: true,
        })
        if (cancelled) { try { Quagga.stop() } catch { /* ignore */ }; return }
        activeRef.current = true
        Quagga.start()
        Quagga.onDetected(detected)
        setScanState('active')
      } catch (err) {
        if (cancelled) return
        activeRef.current = false
        const name = err instanceof Error ? err.name : String(err)
        const msg  = err instanceof Error ? err.message : String(err)
        const msgLc = msg.toLowerCase()
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError'
          || msgLc.includes('permission') || msgLc.includes('denied')) {
          setScanState('denied')
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'NotReadableError'
          || msgLc.includes('no camera') || msgLc.includes('not found')) {
          setScanState('nocamera')
        } else {
          setScanState('error')
          setErrorMsg(msg)
        }
      }
    })()

    return () => {
      cancelled = true
      if (activeRef.current) {
        try { Quagga.offDetected(detected) } catch { /* ignore */ }
        try { Quagga.stop() } catch { /* ignore */ }
        activeRef.current = false
      }
    }
  }, [onDetected])

  return (
    <Modal open onClose={onClose} title="Scan Barcode" size="sm">
      <div className={styles.scannerArea}>
        <div ref={containerRef} className={styles.scannerContainer} />

        {scanState === 'loading' && (
          <div className={styles.overlay}>
            <p className={styles.statusText}>Starting camera…</p>
          </div>
        )}

        {scanState === 'active' && (
          <div className={styles.overlay}>
            <div className={`${styles.scanBox} ${scanFlash ? styles.scanBoxFlash : ''}`} />
            <p className={styles.statusText}>Align barcode within the box</p>
          </div>
        )}

        {scanState === 'denied' && (
          <div className={styles.errorBox}>
            <p>Camera access was denied. Allow camera access in your browser settings, then try again.</p>
          </div>
        )}

        {scanState === 'nocamera' && (
          <div className={styles.errorBox}>
            <p>No camera was found on this device.</p>
          </div>
        )}

        {scanState === 'error' && (
          <div className={styles.errorBox}>
            <p>Camera error: {errorMsg}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
