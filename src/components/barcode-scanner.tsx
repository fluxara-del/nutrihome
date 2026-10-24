"use client";
import { useEffect, useRef, useState } from "react";
export function BarcodeScanner({ onRead, onClose }: { onRead: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const found = useRef(onRead); found.current = onRead;
  useEffect(() => {
    let cancelled = false, delivered = false;
    let controls: { stop: () => void } | undefined;
    const element = video.current;
    async function start() {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("Za kameru je potreban HTTPS ili lokalni razvoj na istom računalu. Barkod možeš upisati ručno.");
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }, { default: UPCEReader }] = await Promise.all([import("@zxing/browser"), import("@zxing/library"), import("@zxing/library/esm/core/oned/UPCEReader")]);
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader(new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_8, BarcodeFormat.EAN_13, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]]]), { delayBetweenScanAttempts: 180 });
        controls = await reader.decodeFromConstraints({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } }, element!, (result, _error, active) => {
          if (result && !cancelled && !delivered) { delivered = true; active.stop(); found.current(result.getBarcodeFormat() === BarcodeFormat.UPC_E ? UPCEReader.convertUPCEtoUPCA(result.getText()) : result.getText()); }
        });
        if (cancelled) controls.stop();
      } catch (cause) { if (!cancelled) setError(cause instanceof Error && cause.message.startsWith("Za kameru") ? cause.message : "Kamera nije dostupna ili pristup nije dopušten. Dopusti kameru u pregledniku ili upiši barkod ručno."); }
    }
    void start();
    return () => {
      cancelled = true; controls?.stop();
      const stream = element?.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop());
    };
  }, []);
  return <section className="card mt-4" aria-label="Skener barkoda"><h2>Skeniraj barkod</h2><p className="muted">Usmjeri stražnju kameru na EAN/UPC barkod. Slika se ne šalje vanjskom servisu.</p><video ref={video} autoPlay muted playsInline className="scanner-video"/>{error && <p role="alert" className="error">{error}</p>}<button type="button" className="back-link" onClick={onClose}>Zatvori kameru</button></section>;
}
