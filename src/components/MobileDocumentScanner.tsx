import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Camera, X, Check, Loader2 } from 'lucide-react'
import { useFortuna } from '../hooks/useFortuna'

interface MobileDocumentScannerProps {
    onCapture: (imageData: string) => void
    onClose: () => void
}

export function MobileDocumentScanner({ onCapture, onClose }: MobileDocumentScannerProps) {
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
        if (!hasPermission || capturedImages.length > 0 || isCapturing) {
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
                overlayCtx.clearRect(0, 0, overlay!.width, overlay!.height)

                let boxScale = 0.9
                let strokeColor = 'rgba(255, 255, 255, 0.4)'
                let lineWidth = 3

                if (diff < DIFFERENCE_THRESHOLD) {
                    steadyFrames.current++
                    // Smooth, dynamic "lock-on" animation
                    boxScale = Math.max(0.65, 0.9 - (steadyFrames.current * 0.05))
                    lineWidth = 4 + (steadyFrames.current * 0.5) // get thicker as it locks

                    if (steadyFrames.current >= STEADY_THRESHOLD) {
                        strokeColor = 'var(--accent-emerald, #10b981)' // Turn intensely green when locked
                        lineWidth = 6

                        if (steadyFrames.current === STEADY_THRESHOLD) {
                            if ('vibrate' in navigator) navigator.vibrate(30);

                            // Draw an intense flash outline before capture
                            overlayCtx.fillStyle = 'rgba(16, 185, 129, 0.2)'
                            overlayCtx.fillRect(0, 0, overlay!.width, overlay!.height)
                        }
                        handleManualCapture() // Auto trigger
                    }
                } else {
                    steadyFrames.current = Math.max(0, steadyFrames.current - 1) // slow decay, not instant drop
                }

                // Draw the magnetic corner brackets
                const ow = overlay!.width
                const oh = overlay!.height
                const bw = ow * boxScale
                const bh = oh * boxScale
                const bx = (ow - bw) / 2
                const by = (oh - bh) / 2

                const cornerSize = 45 // Longer, more pronounced brackets
                overlayCtx.strokeStyle = strokeColor
                overlayCtx.lineWidth = lineWidth
                overlayCtx.lineCap = 'round'
                overlayCtx.lineJoin = 'round'
                overlayCtx.shadowColor = strokeColor === 'rgba(255, 255, 255, 0.4)' ? 'transparent' : strokeColor
                overlayCtx.shadowBlur = steadyFrames.current > 0 ? 15 : 0 // Glow effect
                overlayCtx.setLineDash([])

                // Helper to draw corners with nice rounded joints
                const drawCorner = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
                    overlayCtx.beginPath()
                    overlayCtx.moveTo(x1, y1)
                    overlayCtx.lineTo(x2, y2)
                    overlayCtx.lineTo(x3, y3)
                    overlayCtx.stroke()
                }

                drawCorner(bx + cornerSize, by, bx, by, bx, by + cornerSize) // Top Left
                drawCorner(bx + bw - cornerSize, by, bx + bw, by, bx + bw, by + cornerSize) // Top Right
                drawCorner(bx, by + bh - cornerSize, bx, by + bh, bx + cornerSize, by + bh) // Bottom Left
                drawCorner(bx + bw - cornerSize, by + bh, bx + bw, by + bh, bx + bw, by + bh - cornerSize) // Bottom Right


                // If steadying, show progress bar indicator
                if (steadyFrames.current > 0 && steadyFrames.current < STEADY_THRESHOLD) {
                    const progress = steadyFrames.current / STEADY_THRESHOLD
                    overlayCtx.shadowBlur = 0 // reset shadow for progress bar
                    overlayCtx.fillStyle = 'rgba(255,255,255,0.2)'
                    overlayCtx.beginPath(); overlayCtx.roundRect(bx, by + bh + 16, bw, 6, 3); overlayCtx.fill();

                    overlayCtx.fillStyle = 'var(--accent-emerald, #10b981)'
                    overlayCtx.beginPath(); overlayCtx.roundRect(bx, by + bh + 16, bw * progress, 6, 3); overlayCtx.fill();
                }
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

        setTimeout(() => setShowFlash(false), 200) // Much faster, sharper photographic flash

        // Very short cooldown for turbo mode
        setTimeout(() => setIsCapturing(false), 500)
    }, [isCapturing, onCapture])

    const handleConfirmBatch = () => {
        onClose()
    }

    if (hasPermission === false) {
        return (
            <div style={styles.overlay}>
                <div style={styles.errorContainer}>
                    <div style={styles.errorIcon}><Camera size={40} /></div>
                    <h3 style={styles.errorTitle}>Camera Access Required</h3>
                    <p style={styles.errorText}>{error}</p>
                    <button onClick={onClose} style={styles.secondaryButton}>Dismiss</button>
                </div>
            </div>
        )
    }

    return (
        <div style={styles.overlay}>
            <style>{`
                .tactile-button {
                    transition: transform 0.1s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .tactile-button:active {
                    transform: scale(0.92);
                }
                .glass-header {
                    background: linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                }
                .glass-footer {
                    background: linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 40%, transparent 100%);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                }
                .scanner-flash {
                    animation: photoflash 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
                }
                @keyframes photoflash {
                    0% { background-color: rgba(255,255,255,1); opacity: 1; }
                    100% { background-color: rgba(255,255,255,0); opacity: 0; }
                }
                .shutter-glow {
                    box-shadow: 0 0 0 4px rgba(255,255,255,0.2);
                    transition: all 0.2s ease;
                }
                .shutter-glow:hover {
                    box-shadow: 0 0 0 8px rgba(255,255,255,0.3);
                }
                @keyframes pulse-ring {
                    0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
                    70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
                }
            `}</style>

            {/* Header controls - Frosted Glass Gradient */}
            <div className="glass-header" style={styles.header}>
                <button onClick={onClose} className="tactile-button" style={styles.iconButton}>
                    <X size={24} color="#fff" />
                </button>
                <div style={{ flex: 1, textAlign: 'center', color: '#fff', fontSize: 14, fontWeight: 600, marginTop: 10, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.8 }}>
                    Document Scanner
                </div>
                <div style={{ width: 44 }}></div> {/* Spacer */}
            </div>

            <div style={styles.cameraContainer}>
                {showFlash && <div className="scanner-flash" style={styles.flashOverlay}></div>}

                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={styles.videoElement}
                />

                <canvas
                    ref={overlayCanvasRef}
                    style={styles.arOverlay}
                />

                <div style={styles.scannerGuide}>
                    <div style={styles.guideText}>
                        <div style={{
                            width: 8, height: 8, borderRadius: '50%', background: isCapturing ? 'transparent' : steadyFrames.current > 2 ? 'var(--accent-emerald)' : '#fff',
                            marginRight: 8, display: 'inline-block', transition: 'background 0.3s'
                        }}></div>
                        {isCapturing 
                            ? "Captured!"
                            : steadyFrames.current > 2
                                ? "Hold steady..."
                                : "Auto-Capture Active"}
                    </div>
                </div>
            </div>

            {/* Hidden canvas for processing */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Bottom Controls - Frosted Glass Footer */}
            <div className="glass-footer" style={styles.footer}>
                <div style={styles.captureContainer}>
                    {/* Badge showing # of scans */}
                    <div style={{ position: 'absolute', left: 24, bottom: 32 }}>
                        {capturedImages.length > 0 && (
                            <div style={styles.batchBadge}>
                                <div style={styles.batchThumbnail}>
                                    <span style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{capturedImages.length}</span>
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-emerald)', marginTop: 8 }}>Scanned</div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleManualCapture}
                        disabled={isCapturing}
                        className="tactile-button shutter-glow"
                        style={styles.captureButton}
                        aria-label="Capture photo"
                    >
                        <div style={{ ...styles.captureButtonInner, ...(isCapturing ? { transform: 'scale(0.8)', opacity: 0.5 } : {}) }}></div>
                    </button>

                    {/* Done button */}
                    <div style={{ position: 'absolute', right: 24, bottom: 36 }}>
                        {capturedImages.length > 0 && (
                            <button onClick={handleConfirmBatch} className="tactile-button" style={styles.doneButton}>
                                Next <Check size={18} />
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
        padding: '32px 24px 64px 24px', // Extra bottom padding for the gradient fade
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        zIndex: 10,
    },
    iconButton: {
        background: 'rgba(255,255,255,0.15)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '50%',
        width: 44, height: 44,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
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
        top: '12%', bottom: '15%', left: '10%', right: '10%',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        pointerEvents: 'none',
        paddingTop: 40,
    },
    guideText: {
        color: '#fff',
        backgroundColor: 'rgba(0,0,0,0.65)',
        border: '1px solid rgba(255,255,255,0.1)',
        padding: '8px 20px',
        borderRadius: 24,
        fontSize: 14,
        fontWeight: 600,
        display: 'flex', alignItems: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
    },
    footer: {
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        padding: '64px 24px 40px 24px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    captureContainer: {
        display: 'flex',
        justifyContent: 'center',
        width: '100%',
        position: 'relative',
        alignItems: 'center',
    },
    captureButton: {
        width: 84, height: 84,
        borderRadius: '50%',
        backgroundColor: 'rgba(255,255,255,0.15)',
        border: '4px solid #fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
        backdropFilter: 'blur(4px)',
    },
    captureButtonInner: {
        width: 62, height: 62,
        borderRadius: '50%',
        backgroundColor: '#fff',
        transition: 'all 0.15s ease',
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
        borderRadius: 14,
        padding: '16px',
        fontSize: 16,
        fontWeight: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        cursor: 'pointer',
    },
    secondaryButton: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.15)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14,
        padding: '16px',
        fontSize: 16,
        fontWeight: 500,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        cursor: 'pointer',
    },
    errorContainer: {
        backgroundColor: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(12px)',
        padding: 40,
        borderRadius: 24,
        margin: 'auto',
        maxWidth: 340,
        textAlign: 'center',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
    },
    errorIcon: {
        color: 'var(--accent-red, #ef4444)',
        marginBottom: 20,
        background: 'rgba(239, 68, 68, 0.15)',
        width: 80, height: 80, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px',
    },
    errorTitle: {
        color: '#fff',
        margin: '0 0 12px 0',
        fontSize: 20,
        fontWeight: 700,
        letterSpacing: '-0.02em',
    },
    errorText: {
        color: 'rgba(255,255,255,0.7)',
        margin: '0 0 32px 0',
        fontSize: 15,
        lineHeight: 1.6,
    },
    arOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
        zIndex: 2,
    },
    flashOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 3,
        pointerEvents: 'none',
    },
    batchBadge: {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        animation: 'fadeUp 0.3s ease forwards',
    },
    batchThumbnail: {
        width: 54, height: 68,
        backgroundColor: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
        border: '2px solid var(--accent-gold)',
        borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 4, color: '#fff',
        boxShadow: '2px 2px 0 0 rgba(255,255,255,0.15), 4px 4px 0 0 rgba(255,255,255,0.1)',
    },
    doneButton: {
        backgroundColor: 'var(--accent-gold)',
        color: '#000',
        padding: '14px 28px',
        borderRadius: 30,
        border: 'none',
        fontWeight: 800, fontSize: 16,
        display: 'flex', alignItems: 'center', gap: 8,
        cursor: 'pointer',
        boxShadow: '0 4px 14px rgba(250, 204, 21, 0.4)',
        animation: 'fadeUp 0.3s ease forwards',
    }
}
