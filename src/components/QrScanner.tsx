import { useEffect } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { Button } from '@/components/ui/button'

interface QrScannerProps {
  onScan: (text: string) => void
  onClose: () => void
}

const QrScanner = ({ onScan, onClose }: QrScannerProps) => {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      'reader',
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    )

    scanner.render(
      (decodedText) => {
        onScan(decodedText)
        scanner.clear()
      },
      (error) => {
        // ignore errors
      }
    )

    return () => {
      scanner.clear().catch(console.error)
    }
  }, [onScan])

  return (
    <div className="space-y-4">
      <div id="reader" className="w-full overflow-hidden rounded-lg border"></div>
      <Button variant="outline" className="w-full" onClick={onClose}>
        스캔 취소
      </Button>
    </div>
  )
}

export default QrScanner
