import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Camera, X, Check, Loader2 } from 'lucide-react'
import { useFortuna } from '../hooks/useFortuna'

interface MobileReceiptScannerProps {
    onCapture: (imageData: string) => void
    onClose: () => void
export function MobileReceiptScanner({ onCapture, onClose }: MobileReceiptScannerProps) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
    
    const [hasPermission, setHasPermission] = useState<boolean | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isCapturing, setIsCapturing] = useState(false)
    const [capturedImages, setCapturedImages] = useState<string[]>([])
    const [showFlash, setShowFlash] = useState(false)

    // Motion detection state
    const lastImageData = useRef<ImageData | null>(null)
    const steadyFrames = useRef(0)
    const frameInterval = useRef<number | null>(null)

    const STEADY_THRESHOLD = 5 // Number of consecutive steady frames required
    const DIFFERENCE_THRESHOLD = 2000000 // Pixel difference score to consider "motion"

    // Initialize Camera
    useEffect(() => {
        let stream: MediaStream | null = null

        const startCamera = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'environment', // Prefer back camera
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    }
                })
                
                if (videoRef.current) {
                    videoRef.current.srcObject = stream
                    videoRef.current.play()
                }
                setHasPermission(true)
            } catch (err: any) {
                console.error("Camera access error:", err)
                setHasPermission(false)
                setError(err.message || "Failed to access camera. Please check permissions.")
            }
        }

        startCamera()

        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop())
            }
            if (frameInterval.current) {
                window.clearInterval(frameInterval.current)
            }
        }
    }, [])

    // Auto-Capture logic (Motion detection)
    useEffect(() => {
        if (!hasPermission || capturedImage || isCapturing) {
            if (frameInterval.current) window.clearInterval(frameInterval.current)
            return
        }

        const checkFrame = () => {
            if (!videoRef.current || !canvasRef.current) return
            const video = videoRef.current
            const canvas = canvasRef.current
            const overlay = overlayCanvasRef.current
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            const overlayCtx = overlay?.getContext('2d')
            if (!ctx || !overlayCtx || video.videoWidth === 0) return

            // Match canvas size to video frame
            if (canvas.width !== video.videoWidth) {
                canvas.width = video.videoWidth
                canvas.height = video.videoHeight
            }
            if (overlay && overlay.width !== video.getBoundingClientRect().width) {
                overlay.width = video.getBoundingClientRect().width
                overlay.height = video.getBoundingClientRect().height
            }

            // Draw current frame to hidden canvas
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            
            // Get a smaller sample area for faster calculation (center of screen)
            const sampleWidth = 200
            const sampleHeight = 200
            const startX = (canvas.width - sampleWidth) / 2
            const startY = (canvas.height - sampleHeight) / 2
            
            const currentData = ctx.getImageData(startX, startY, sampleWidth, sampleHeight)
            
            if (lastImageData.current) {
                // Calculate difference
                let diff = 0
                const curPixels = currentData.data
                const lastPixels = lastImageData.current.data
                
                for (let i = 0; i < curPixels.length; i += 4) {
                    // Simple RGB difference
                    diff += Math.abs(curPixels[i] - lastPixels[i]) +
                            Math.abs(curPixels[i+1] - lastPixels[i+1]) +
                            Math.abs(curPixels[i+2] - lastPixels[i+2])
                }

                // --- AR Edge Detection Overlay ---
                // We're doing a highly-simplified placeholder heuristic here: 
                // In production, we'd use a Canny edge detector or contour finding algo.
                // For now, if it's steady, we tighten a green border to pretend we found the document.

                overlayCtx.clearRect(0, 0, overlay!.width, overlay!.height)

                let boxScale = 0.9
                let strokeColor = 'rgba(255, 255, 255, 0.5)'

                if (diff < DIFFERENCE_THRESHOLD) {
                    steadyFrames.current++
                    // Animate the box zooming in to lock onto the document
                    boxScale = Math.max(0.6, 0.9 - (steadyFrames.current * 0.05))

                    if (steadyFrames.current >= STEADY_THRESHOLD) {
                        strokeColor = 'var(--accent-emerald, #10b981)' // Turn green when locked
                        handleManualCapture() // Auto trigger
                    }
                } else {
                    steadyFrames.current = 0
                }

                // Draw the AR edge box
                const ow = overlay!.width
                const oh = overlay!.height
                const bw = ow * boxScale
                const bh = oh * boxScale
                const bx = (ow - bw) / 2
                const by = (oh - bh) / 2

                overlayCtx.strokeStyle = strokeColor
                overlayCtx.lineWidth = 4
                overlayCtx.setLineDash([20, 15])
                overlayCtx.strokeRect(bx, by, bw, bh)
                // --- End AR Edge Detection ---
            }

            lastImageData.current = currentData
        }

        frameInterval.current = window.setInterval(checkFrame, 200)

        return () => {
            if (frameInterval.current) window.clearInterval(frameInterval.current)
        }
    }, [hasPermission, isCapturing]) // removed capturedImage dependency for turbo scanning

    const handleManualCapture = useCallback(() => {
        if (!videoRef.current || !canvasRef.current || isCapturing) return
        
        setIsCapturing(true)
        setShowFlash(true) // trigger flash feedback

        // Don't clear interval, let it keep scanning
        // if (frameInterval.current) window.clearInterval(frameInterval.current)

        const video = videoRef.current
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')

        if (ctx) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            
            // Compress JPEG
            const base64Image = canvas.toDataURL('image/jpeg', 0.8)
            setCapturedImages(prev => [...prev, base64Image])

            // Instantly send to parent for concurrent background processing
            onCapture(base64Image)

            // Reset steady state so it doesn't repeatedly fire identical frames
            steadyFrames.current = -5 // Requires 10 frames to re-trigger auto-capture a 2nd time
        }

        setTimeout(() => setShowFlash(false), 300)

        // Very short cooldown for turbo mode
        setTimeout(() => setIsCapturing(false), 600)
    }, [isCapturing, onCapture])

    const handleConfirmBatch = () => {
        onClose()
    }

    if (hasPermission === false) {
        return (
            <div style={styles.overlay}>
                <div style={styles.errorContainer}>
                    <div style={styles.errorIcon}><Camera size={32} /></div>
                    <h3 style={styles.errorTitle}>Camera Access Denied</h3>
                    <p style={styles.errorText}>{error}</p>
                    <button onClick={onClose} style={styles.secondaryButton}>Close</button>
                </div>
            </div>
        )
    }

    return (
        <div style={styles.overlay}>
            {/* Header controls */}
            <div style={styles.header}>
                <button onClick={onClose} style={styles.iconButton}>
                    <X size={24} color="#fff" />
                </button>
            </div>

            <div style={styles.cameraContainer}>
                {showFlash && <div style={styles.flashOverlay}></div>}

                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={styles.videoElement}
                />

                {/* Secondary transparent canvas for drawing AR green boxes over the video */}
                <canvas
                    ref={overlayCanvasRef}
                    style={styles.arOverlay}
                />

                {/* Shaded boundaries to guide user - now simplified as the AR canvas handles the dynamic green boxes */}
                <div style={styles.scannerGuide}>
                    <div style={styles.guideText}>
                        {isCapturing 
                            ? "Captured!"
                            : steadyFrames.current > 2
                                ? "Hold steady..."
                                : "Align document within frame"}
                    </div>
                </div>
            </div>

            {/* Hidden canvas for processing */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Bottom Controls */}
            <div style={styles.footer}>
                <div style={styles.captureContainer}>
                    {/* Badge showing # of scans */}
                    <div style={{ position: 'absolute', left: 24, bottom: 24 }}>
                        {capturedImages.length > 0 && (
                            <div style={styles.batchBadge}>
                                <div style={styles.batchThumbnail}>
                                    <span style={{ fontSize: 18, fontWeight: 700 }}>{capturedImages.length}</span>
                                </div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-emerald)' }}>Processing...</div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleManualCapture}
                        disabled={isCapturing}
                        style={styles.captureButton}
                        aria-label="Capture photo"
                    >
                        <div style={{ ...styles.captureButtonInner, ...(isCapturing ? { opacity: 0.5 } : {}) }}></div>
                    </button>

                    {/* Done button */}
                    <div style={{ position: 'absolute', right: 24, bottom: 30 }}>
                        {capturedImages.length > 0 && (
                            <button onClick={handleConfirmBatch} style={styles.doneButton}>
                                Done <Check size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#000',
        zIndex: 9999, // Ensure it's on top of everything
        display: 'flex',
        flexDirection: 'column',
    },
    header: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        padding: '24px 16px',
        display: 'flex',
        justifyContent: 'flex-start',
        zIndex: 10,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
    },
    iconButton: {
        background: 'rgba(255,255,255,0.2)',
        border: 'none',
        borderRadius: '50%',
        width: 40, height: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        backdropFilter: 'blur(4px)',
    },
    cameraContainer: {
        flex: 1,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    videoElement: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
    },
    scannerGuide: {
        position: 'absolute',
        top: '10%', bottom: '15%', left: '8%', right: '8%',
        border: '2px solid rgba(255,255,255,0.3)',
        boxShadow: '0 0 0 4000px rgba(0,0,0,0.5)', // Dims everything outside the box
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
    },
    corner: {
        position: 'absolute',
        width: 30, height: 30,
        borderColor: 'var(--accent-gold, #facc15)',
        borderStyle: 'solid',
    },
    guideText: {
        color: '#fff',
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: '8px 16px',
        borderRadius: 20,
        fontSize: 14,
        fontWeight: 500,
        backdropFilter: 'blur(4px)',
    },
    footer: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        padding: '32px 24px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    captureContainer: {
        display: 'flex',
        justifyContent: 'center',
        width: '100%',
    },
    captureButton: {
        width: 72, height: 72,
        borderRadius: '50%',
        backgroundColor: 'rgba(255,255,255,0.3)',
        border: '4px solid #fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
    },
    captureButtonInner: {
        width: 54, height: 54,
        borderRadius: '50%',
        backgroundColor: '#fff',
    },
    actionRow: {
        display: 'flex',
        gap: 16,
        width: '100%',
        maxWidth: 400,
    },
    primaryButton: {
        flex: 1,
        backgroundColor: 'var(--accent-gold, #facc15)',
        color: '#000',
        border: 'none',
        borderRadius: 12,
        padding: '16px',
        fontSize: 16,
        fontWeight: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        cursor: 'pointer',
    },
    secondaryButton: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.2)',
        color: '#fff',
        border: 'none',
        borderRadius: 12,
        padding: '16px',
        fontSize: 16,
        fontWeight: 500,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        cursor: 'pointer',
        backdropFilter: 'blur(10px)',
    },
    errorContainer: {
        backgroundColor: '#1a1f2e',
        padding: 32,
        borderRadius: 16,
        margin: 'auto',
        maxWidth: 320,
        textAlign: 'center',
        border: '1px solid rgba(255,255,255,0.1)',
    },
    errorIcon: {
        color: '#ef4444',
        marginBottom: 16,
    },
    errorTitle: {
        color: '#fff',
        margin: '0 0 8px 0',
        fontSize: 18,
    },
    errorText: {
        color: '#9ca3af',
        margin: '0 0 24px 0',
        fontSize: 14,
        lineHeight: 1.5,
    },
    arOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none', // pass clicks through to the buttons
        zIndex: 2,
    },
    flashOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(255,255,255,0.8)',
        zIndex: 3,
        pointerEvents: 'none',
        animation: 'fadeOut 0.3s forwards',
    },
    batchBadge: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    },
    batchThumbnail: {
        width: 48, height: 60,
        backgroundColor: 'var(--bg-elevated)',
        border: '2px solid var(--accent-gold)',
        borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 4, color: '#fff',
        boxShadow: '2px 2px 0 0 rgba(255,255,255,0.2), 4px 4px 0 0 rgba(255,255,255,0.1)',
    },
    doneButton: {
        backgroundColor: 'var(--accent-gold)',
        color: '#000',
        padding: '12px 24px',
        borderRadius: 24,
        border: 'none',
        fontWeight: 700, fontSize: 16,
        display: 'flex', alignItems: 'center', gap: 6,
        cursor: 'pointer',
    }
}

// Add the flash animation globally
if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes fadeOut {
            from { opacity: 0.8; }
            to { opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}
