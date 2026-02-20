import { useState, useEffect, useRef, useCallback } from 'react'
import { Camera, X, RefreshCw, Check, Loader2, Maximize } from 'lucide-react'
import { useFortuna } from '../hooks/useFortuna'

interface MobileReceiptScannerProps {
    onCapture: (imageData: string) => void
    onClose: () => void
}

export function MobileReceiptScanner({ onCapture, onClose }: MobileReceiptScannerProps) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    
    const [hasPermission, setHasPermission] = useState<boolean | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isCapturing, setIsCapturing] = useState(false)
    const [capturedImage, setCapturedImage] = useState<string | null>(null)

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
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            if (!ctx || video.videoWidth === 0) return

            // Match canvas size to video frame
            if (canvas.width !== video.videoWidth) {
                canvas.width = video.videoWidth
                canvas.height = video.videoHeight
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

                if (diff < DIFFERENCE_THRESHOLD) {
                    steadyFrames.current++
                    if (steadyFrames.current >= STEADY_THRESHOLD) {
                        handleManualCapture() // Auto trigger
                    }
                } else {
                    steadyFrames.current = 0
                }
            }

            lastImageData.current = currentData
        }

        frameInterval.current = window.setInterval(checkFrame, 200)

        return () => {
            if (frameInterval.current) window.clearInterval(frameInterval.current)
        }
    }, [hasPermission, capturedImage, isCapturing])


    const handleManualCapture = useCallback(() => {
        if (!videoRef.current || !canvasRef.current || isCapturing) return
        
        setIsCapturing(true)
        if (frameInterval.current) window.clearInterval(frameInterval.current)

        const video = videoRef.current
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')

        if (ctx) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            
            // Compress JPEG
            const base64Image = canvas.toDataURL('image/jpeg', 0.8)
            setCapturedImage(base64Image)
        }
        setIsCapturing(false)
    }, [isCapturing])

    const handleRetake = () => {
        setCapturedImage(null)
        steadyFrames.current = 0
        lastImageData.current = null
    }

    const handleConfirm = () => {
        if (capturedImage) {
            onCapture(capturedImage)
        }
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
                {capturedImage ? (
                    <img src={capturedImage} alt="Captured receipt" style={styles.videoElement} />
                ) : (
                    <>
                        <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            muted 
                            style={styles.videoElement} 
                        />
                        {/* Shaded boundaries to guide user */}
                        <div style={styles.scannerGuide}>
                            <div className="corner-tl" style={styles.corner}></div>
                            <div className="corner-tr" style={styles.corner}></div>
                            <div className="corner-bl" style={styles.corner}></div>
                            <div className="corner-br" style={styles.corner}></div>
                            <div style={styles.guideText}>
                                {isCapturing 
                                  ? "Processing..." 
                                  : steadyFrames.current > 2 
                                        ? "Hold steady..." 
                                        : "Align receipt within frame"}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Hidden canvas for processing */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Bottom Controls */}
            <div style={styles.footer}>
                {capturedImage ? (
                    <div style={styles.actionRow}>
                        <button onClick={handleRetake} style={styles.secondaryButton}>
                            <RefreshCw size={18} /> Retake
                        </button>
                        <button onClick={handleConfirm} style={styles.primaryButton}>
                            <Check size={18} /> Use Photo
                        </button>
                    </div>
                ) : (
                    <div style={styles.captureContainer}>
                        <button 
                            onClick={handleManualCapture} 
                            disabled={isCapturing}
                            style={styles.captureButton}
                            aria-label="Capture photo"
                        >
                            <div style={styles.captureButtonInner}></div>
                        </button>
                    </div>
                )}
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
    }
}
