// Glitch effects and cyberpunk animations
class CyberpunkEffects {
    constructor() {
        this.init();
    }
    
    init() {
        this.addMatrixRain();
        this.addScanlines();
        this.addGlitchEffects();
        this.addParticleSystem();
    }
    
    addMatrixRain() {
        // Create matrix rain background effect
        const canvas = document.createElement('canvas');
        canvas.id = 'matrix-rain';
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.zIndex = '-1';
        canvas.style.opacity = '0.1';
        canvas.style.pointerEvents = 'none';
        
        document.body.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        
        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
        const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
        const fontSize = 14;
        const columns = canvas.width / fontSize;
        const drops = Array(Math.floor(columns)).fill(1);
        
        const draw = () => {
            ctx.fillStyle = 'rgba(10, 10, 10, 0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.fillStyle = '#00ffff';
            ctx.font = `${fontSize}px monospace`;
            
            for (let i = 0; i < drops.length; i++) {
                const text = chars[Math.floor(Math.random() * chars.length)];
                ctx.fillText(text, i * fontSize, drops[i] * fontSize);
                
                if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i]++;
            }
        };
        
        setInterval(draw, 100);
    }
    
    addScanlines() {
        // Add CRT-style scanlines
        const scanlines = document.createElement('div');
        scanlines.id = 'scanlines';
        scanlines.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1000;
            background: linear-gradient(
                transparent 50%,
                rgba(0, 255, 255, 0.02) 50%
            );
            background-size: 100% 4px;
            animation: scanline 0.1s linear infinite;
        `;
        
        document.body.appendChild(scanlines);
        
        // Add scanline animation CSS
        const scanlineCSS = `
            @keyframes scanline {
                0% { transform: translateY(0); }
                100% { transform: translateY(4px); }
            }
        `;
        
        const style = document.createElement('style');
        style.textContent = scanlineCSS;
        document.head.appendChild(style);
    }
    
    addGlitchEffects() {
        // Random glitch effects on panels
        const panels = document.querySelectorAll('.panel');
        
        const glitchPanel = (panel) => {
            panel.style.animation = 'none';
            panel.offsetHeight; // Trigger reflow
            panel.style.animation = 'glitch-panel 0.1s ease-in-out';
            
            setTimeout(() => {
                panel.style.animation = '';
            }, 100);
        };
        
        const addGlitchCSS = () => {
            const glitchCSS = `
                @keyframes glitch-panel {
                    0%, 100% { transform: translate(0); }
                    10% { transform: translate(-2px, -1px); }
                    20% { transform: translate(2px, 1px); }
                    30% { transform: translate(-1px, 2px); }
                    40% { transform: translate(1px, -2px); }
                    50% { transform: translate(-2px, 1px); }
                    60% { transform: translate(2px, -1px); }
                    70% { transform: translate(-1px, -2px); }
                    80% { transform: translate(1px, 2px); }
                    90% { transform: translate(-2px, -1px); }
                }
            `;
            
            const style = document.createElement('style');
            style.textContent = glitchCSS;
            document.head.appendChild(style);
        };
        
        addGlitchCSS();
        
        // Random glitch effects
        setInterval(() => {
            if (Math.random() < 0.1) { // 10% chance every interval
                const randomPanel = panels[Math.floor(Math.random() * panels.length)];
                glitchPanel(randomPanel);
            }
        }, 5000);
    }
    
    addParticleSystem() {
        // Create floating particles
        const particleContainer = document.createElement('div');
        particleContainer.id = 'particles';
        particleContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: -1;
        `;
        
        document.body.appendChild(particleContainer);
        
        const createParticle = () => {
            const particle = document.createElement('div');
            particle.className = 'particle';
            
            const size = Math.random() * 3 + 1;
            const opacity = Math.random() * 0.5 + 0.3;
            const duration = Math.random() * 10 + 10;
            const color = ['#00ffff', '#ff00ff', '#ffff00'][Math.floor(Math.random() * 3)];
            
            particle.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                background: ${color};
                border-radius: 50%;
                opacity: ${opacity};
                left: ${Math.random() * 100}%;
                top: 100%;
                animation: float-up ${duration}s linear infinite;
                box-shadow: 0 0 ${size * 2}px ${color};
            `;
            
            particleContainer.appendChild(particle);
            
            // Remove particle after animation
            setTimeout(() => {
                if (particle.parentNode) {
                    particle.parentNode.removeChild(particle);
                }
            }, duration * 1000);
        };
        
        // Add particle animation CSS
        const particleCSS = `
            @keyframes float-up {
                0% {
                    transform: translateY(0) rotate(0deg);
                    opacity: 0;
                }
                10% {
                    opacity: 1;
                }
                90% {
                    opacity: 1;
                }
                100% {
                    transform: translateY(-100vh) rotate(360deg);
                    opacity: 0;
                }
            }
        `;
        
        const style = document.createElement('style');
        style.textContent = particleCSS;
        document.head.appendChild(style);
        
        // Create particles periodically
        setInterval(createParticle, 2000);
    }
    
    addHoverEffects() {
        // Enhanced hover effects for interactive elements
        const interactiveElements = document.querySelectorAll('.btn-primary, .btn-secondary, .metric-card, .model-card');
        
        interactiveElements.forEach(element => {
            element.addEventListener('mouseenter', () => {
                this.createHoverGlow(element);
            });
        });
    }
    
    createHoverGlow(element) {
        const glow = document.createElement('div');
        glow.className = 'hover-glow';
        glow.style.cssText = `
            position: absolute;
            top: -10px;
            left: -10px;
            right: -10px;
            bottom: -10px;
            background: radial-gradient(circle, rgba(0, 255, 255, 0.3) 0%, transparent 70%);
            border-radius: inherit;
            z-index: -1;
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
        `;
        
        element.style.position = 'relative';
        element.appendChild(glow);
        
        // Fade in glow
        setTimeout(() => {
            glow.style.opacity = '1';
        }, 10);
        
        // Remove glow on mouse leave
        element.addEventListener('mouseleave', () => {
            glow.style.opacity = '0';
            setTimeout(() => {
                if (glow.parentNode) {
                    glow.parentNode.removeChild(glow);
                }
            }, 300);
        }, { once: true });
    }
    
    addDataStreamEffect() {
        // Add data stream effect to log containers
        const logContainer = document.getElementById('log-container');
        if (logContainer) {
            const observer = new MutationObserver(() => {
                this.animateNewLogEntry();
            });
            
            observer.observe(logContainer, { childList: true });
        }
    }
    
    animateNewLogEntry() {
        const logEntries = document.querySelectorAll('.log-entry');
        if (logEntries.length > 0) {
            const newEntry = logEntries[logEntries.length - 1];
            newEntry.style.opacity = '0';
            newEntry.style.transform = 'translateX(-20px)';
            newEntry.style.transition = 'all 0.3s ease';
            
            setTimeout(() => {
                newEntry.style.opacity = '1';
                newEntry.style.transform = 'translateX(0)';
            }, 100);
        }
    }
    
    addTerminalCursor() {
        // Add blinking cursor to terminal title
        const title = document.querySelector('.terminal-title h1');
        if (title) {
            const cursor = document.createElement('span');
            cursor.textContent = '_';
            cursor.style.cssText = `
                animation: cursor-blink 1s infinite;
                color: var(--primary-cyan);
                margin-left: 5px;
            `;
            
            title.appendChild(cursor);
            
            const cursorCSS = `
                @keyframes cursor-blink {
                    0%, 50% { opacity: 1; }
                    51%, 100% { opacity: 0; }
                }
            `;
            
            const style = document.createElement('style');
            style.textContent = cursorCSS;
            document.head.appendChild(style);
        }
    }
    
    addElectricArcs() {
        // Add electric arc effects between panels
        setInterval(() => {
            if (Math.random() < 0.05) { // 5% chance
                this.createElectricArc();
            }
        }, 3000);
    }
    
    createElectricArc() {
        const panels = document.querySelectorAll('.panel');
        if (panels.length < 2) return;
        
        const panel1 = panels[Math.floor(Math.random() * panels.length)];
        const panel2 = panels[Math.floor(Math.random() * panels.length)];
        
        if (panel1 === panel2) return;
        
        const arc = document.createElement('div');
        arc.className = 'electric-arc';
        
        const rect1 = panel1.getBoundingClientRect();
        const rect2 = panel2.getBoundingClientRect();
        
        const x1 = rect1.left + rect1.width / 2;
        const y1 = rect1.top + rect1.height / 2;
        const x2 = rect2.left + rect2.width / 2;
        const y2 = rect2.top + rect2.height / 2;
        
        const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
        
        arc.style.cssText = `
            position: fixed;
            left: ${x1}px;
            top: ${y1}px;
            width: ${distance}px;
            height: 2px;
            background: linear-gradient(90deg, 
                transparent 0%, 
                #00ffff 10%, 
                #ffffff 50%, 
                #00ffff 90%, 
                transparent 100%
            );
            transform-origin: 0 50%;
            transform: rotate(${angle}deg);
            z-index: 1001;
            opacity: 0;
            animation: arc-flash 0.5s ease-out;
            box-shadow: 0 0 10px #00ffff;
            pointer-events: none;
        `;
        
        document.body.appendChild(arc);
        
        // Add arc flash animation
        const arcCSS = `
            @keyframes arc-flash {
                0% { opacity: 0; }
                50% { opacity: 1; }
                100% { opacity: 0; }
            }
        `;
        
        const style = document.createElement('style');
        style.textContent = arcCSS;
        document.head.appendChild(style);
        
        setTimeout(() => {
            if (arc.parentNode) {
                arc.parentNode.removeChild(arc);
            }
        }, 500);
    }
}

// Initialize cyberpunk effects when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const effects = new CyberpunkEffects();
    
    // Add additional visual enhancements
    setTimeout(() => {
        effects.addHoverEffects();
        effects.addDataStreamEffect();
        effects.addTerminalCursor();
        effects.addElectricArcs();
    }, 1000);
});