const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SUPPORTED_FORMATS = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_HISTORY_SIZE = 50;
const SHORTCUTS = {
    'Ctrl+O': 'Open Image',
    'Ctrl+S': 'Save Image',
    'Ctrl+Z': 'Undo',
    'Ctrl+Y': 'Redo',
    'Ctrl+A': 'Select All',
    'Delete': 'Clear Selection',
    'Escape': 'Cancel Selection',
    'Space': 'Pan Canvas',
    '+': 'Zoom In',
    '-': 'Zoom Out',
    '0': 'Reset Zoom',
    '1-9': 'Brush Size',
    'B': 'Brush Tool',
    'E': 'Eraser',
    'F': 'Fill Tool',
    'L': 'Line Tool',
    'R': 'Rectangle Tool',
    'C': 'Circle Tool',
    'T': 'Text Tool',
    'P': 'Pencil Tool',
    'A': 'Airbrush Tool',
    'I': 'Color Picker'
};

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }, 100);
}

class Paintr {
    constructor() {
        this.canvas = document.getElementById('drawingCanvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.currentTool = 'pencil';
        this.isDrawing = false;
        this.currentColor = '#CCCCCC'; 
        this.bgColor = '#000000'; 
        this.brushSize = 4;
        this.lastX = 0;
        this.lastY = 0;
        this.startX = 0;
        this.startY = 0;
        this.snapshot = null;
        this.history = [];
        this.historyIndex = -1;
        this.maxHistorySize = MAX_HISTORY_SIZE;
        this.polygonPoints = []; 
        this.airbrushInterval = null; 
        this.selection = null;
        this.curvePoints = [];
        this.isDrawingCurve = false;
        this.curveStartPoint = null;
        this.isAdvancedColors = false;
        this.zoom = 1;

        
        this.themeToggle = document.getElementById('themeToggle');
        this.colorModeToggle = document.getElementById('colorModeToggle');
        this.brushSizeSlider = document.getElementById('brushSize');
        this.brushSizeValue = document.getElementById('brushSizeValue');
        this.activeColorSwatch = document.getElementById('activeColorSwatch');
        this.currentColorDisplay = document.getElementById('currentColorDisplay');
        this.shortcutsHint = document.querySelector('.shortcuts');
        this.fileInput = this.createFileInput(); 

        this.initializeCanvas();
        this.setupEventListeners();
        this.setupThemeToggle();
        this.setupColorModeToggle();
        this.setupMenuActions(); 
        this.setupKeyboardShortcuts();
        this.updateColorDisplay(this.currentColor);
        this.setActiveTool('pencil'); 
        this.updateShortcutsHint();
        this.updateHistoryButtons();
    }

    createFileInput() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/gif,image/webp';
        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', this.handleFileSelect.bind(this));
        return input;
    }
    
    initializeCanvas() {
        const container = this.canvas.parentElement;
        if (!container) return; 

        const cs = getComputedStyle(container);
        const paddingX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const paddingY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        
        
        const statusBar = document.querySelector('.status-bar');
        const statusBarHeight = statusBar ? statusBar.offsetHeight : 20; 

        const availableWidth = container.clientWidth - paddingX;
        const availableHeight = container.clientHeight - paddingY - statusBarHeight;

        
        const currentDrawing = (this.historyIndex >= 0 && this.history.length > 0) ? this.history[this.historyIndex] : null;

        this.canvas.width = Math.max(10, availableWidth);
        this.canvas.height = Math.max(10, availableHeight);

        this.ctx.fillStyle = this.bgColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        
        if (currentDrawing) {
            
            this.loadImageDataURL(currentDrawing, false); 
        } else if (this.history.length === 0) { 
             this.saveState(); 
        }
        
        console.log(`Canvas initialized/resized to: ${this.canvas.width}x${this.canvas.height}`);
    }
    
    setupEventListeners() {
        
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));
        this.canvas.addEventListener('click', this.handleClick.bind(this)); 
        
        
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setActiveTool(btn.dataset.tool));
        });
        
        
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.style.backgroundColor; 
                this.setCurrentColor(color);
            });
        });
        
        
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => this.initializeCanvas(), 100);
        });
        
 
        this.canvas.addEventListener('mousemove', (e) => {
            const { x, y } = this.getMousePos(e);
            document.getElementById('xCoord').textContent = Math.round(x);
            document.getElementById('yCoord').textContent = Math.round(y);
        });

       
        this.brushSizeSlider.addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value, 10);
            this.brushSizeValue.textContent = this.brushSize;
        });

     
        let previewElement = null;
        this.canvas.addEventListener('mousemove', (e) => {
            if (previewElement) {
                previewElement.remove();
            }
            if (this.currentTool !== 'text' && this.currentTool !== 'pick') {
                previewElement = this.showToolPreview(e);
            }
        });

        this.canvas.addEventListener('mouseout', () => {
            if (previewElement) {
                previewElement.remove();
                previewElement = null;
            }
        });
    }

    setupMenuActions() {
        document.querySelectorAll('.menu-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                switch (action) {
                    case 'file':
                        this.fileInput.click();
                        break;
                    case 'save':
                        this.saveImage();
                        break;
                    case 'undo':
                        this.undo();
                        break;
                    case 'redo':
                        this.redo();
                        break;
                    case 'help':
                        alert('Paintr - A simple paint app.\nUse tools on the left, colors on the right.\nCtrl+O: Open, Ctrl+S: Save, Ctrl+Z: Undo, Ctrl+Y: Redo');
                        break;
                }
            });
        });
    }
    
    setupThemeToggle() {
        this.themeToggle.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light-mode');
            this.themeToggle.textContent = isLight ? '🌙' : '☀️';
            this.bgColor = isLight ? '#FFFFFF' : '#000000'; 

            this.bgColor = '#000000'; 
            this.updateColorDisplay(this.currentColor); 
        });
    }

    setupColorModeToggle() {
        this.colorModeToggle.addEventListener('click', () => {
            const isBasicColors = document.querySelector('.contemporary-colors').style.display === 'none';
            document.querySelector('.contemporary-colors').style.display = isBasicColors ? 'flex' : 'none';
            document.querySelector('.basic-colors').style.display = isBasicColors ? 'none' : 'flex';
            this.colorModeToggle.textContent = isBasicColors ? '🎨' : '🎯';
        });
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }

    setActiveTool(tool) {
        if (!tool) return;
        this.stopAirbrush();
        if (this.currentTool === 'polygon' && this.polygonPoints.length > 0) {
            this.drawPolygon(true); 
        }
        this.polygonPoints = [];

        document.querySelectorAll('.tool-btn').forEach(b => {
            b.classList.remove('active');
        });
        
        const toolButton = document.querySelector(`.tool-btn[data-tool="${tool}"]`);
        if (toolButton) {
            toolButton.classList.add('active');
            this.currentTool = tool;
            this.canvas.style.cursor = this.getCursorForTool(tool);

           
            if (tool === 'pencil') {
                this.brushSize = 1;
            } else if (tool === 'brush') {
                this.brushSize = 4;
            } else if (tool === 'eraser') {
                this.brushSize = 20;
            } else if (tool === 'airbrush') {
                this.brushSize = 25; 
            }
            this.brushSizeSlider.value = this.brushSize;
            this.brushSizeValue.textContent = this.brushSize;
        } else {
            console.warn("Tool button not found:", tool);
            this.currentTool = 'pencil';
            document.querySelector('.tool-btn[data-tool="pencil"]').classList.add('active');
            this.canvas.style.cursor = 'crosshair';
            this.brushSize = 1;
            this.brushSizeSlider.value = 1;
            this.brushSizeValue.textContent = 1;
        }
    }

    setCurrentColor(color) {
        this.currentColor = this.rgbToHex(color);
        document.querySelectorAll('.color-btn').forEach(b => {
            b.classList.remove('active');
        });
        
        const colorButton = Array.from(document.querySelectorAll('.color-btn')).find(btn => 
            this.rgbToHex(btn.style.backgroundColor) === this.currentColor
        );
        
        if (colorButton) {
            colorButton.classList.add('active');
        }
        
        this.updateColorDisplay(this.currentColor);
    }

    updateColorDisplay(color) {
        if (this.activeColorSwatch) {
            this.activeColorSwatch.style.backgroundColor = color;
            const isLight = document.body.classList.contains('light-mode');
            this.activeColorSwatch.style.borderColor = isLight ? 'var(--light-text)' : 'var(--dark-text)';
        }
        
        if (this.currentColorDisplay) {
            this.currentColorDisplay.style.backgroundColor = color;
            const isLight = document.body.classList.contains('light-mode');
            this.currentColorDisplay.style.borderColor = isLight ? 'var(--light-border)' : 'var(--dark-border)';
        }
    }

    getCursorForTool(tool) {
        switch (tool) {
            case 'pencil': return 'crosshair';
            case 'eraser': return 'cell';
            case 'brush': return 'crosshair';
            case 'fill': return 'pointer';
            case 'pick': return 'crosshair';
            case 'text': return 'text';
            case 'line':
            case 'rectangle':
            case 'circle':
            case 'polygon':
                return 'crosshair';
            case 'airbrush': return 'crosshair';
            default: return 'default';
        }
    }
    
    startDrawing(e) {
        if (e.button !== 0) return;
        
        const { x, y } = this.getMousePos(e);
        this.isDrawing = true;
        this.lastX = x;
        this.lastY = y;
        this.startX = x;
        this.startY = y;

        this.ctx.lineWidth = this.brushSize;
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.fillStyle = this.currentColor;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        switch (this.currentTool) {
            case 'select':
                this.startSelection(x, y);
                break;
            case 'curve':
                this.startCurve(x, y);
                break;
            case 'rounded-rect':
                this.startRoundedRect(x, y);
                break;
            default:
                if (['line', 'rectangle', 'circle', 'polygon'].includes(this.currentTool) && this.currentTool !== 'polygon') {
                    this.snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
                }
        }

        if (this.currentTool === 'pencil' || this.currentTool === 'brush' || this.currentTool === 'eraser') {
            this.ctx.beginPath();
            this.ctx.moveTo(this.lastX, this.lastY);
        }

        if (this.currentTool === 'airbrush') {
            this.startAirbrush();
        }
    }
    
    draw(e) {
        if (!this.isDrawing) return;
        
        const { x, y } = this.getMousePos(e);
        
        switch (this.currentTool) {
            case 'select':
                this.updateSelection(x, y);
                break;
            case 'curve':
                this.updateCurve(x, y);
                break;
            case 'rounded-rect':
                this.updateRoundedRect(x, y);
                break;
            case 'pencil':
            case 'brush':
                this.ctx.lineTo(x, y);
                this.ctx.stroke();
                break;
            case 'eraser':
                this.ctx.strokeStyle = this.bgColor;
                this.ctx.lineWidth = this.brushSize * 1.5;
                this.ctx.lineTo(x, y);
                this.ctx.stroke();
                break;
            case 'line':
            case 'rectangle':
            case 'circle':
                if (!this.snapshot) return;
                this.ctx.putImageData(this.snapshot, 0, 0);
                this.drawShapePreview(x, y);
                break;
        }
        
        this.lastX = x;
        this.lastY = y;
    }

    handleClick(e) {
         if (e.button !== 0) return; 
         const { x, y } = this.getMousePos(e);

         switch (this.currentTool) {
            case 'pick':
                this.pickColor(x, y);
                break;
            case 'fill':
                this.floodFill(Math.round(x), Math.round(y), this.currentColor);
                this.saveState();
                break;
            case 'text':
                this.addText(x, y);
                break;
            case 'polygon':
                this.handlePolygonClick(x,y);
                break;
         }
    }

    handlePolygonClick(x, y) {
        this.polygonPoints.push({ x, y });
        
        
        if (this.polygonPoints.length > 1) {
            if (!this.snapshot && this.polygonPoints.length === 2) {
                this.snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            } else if (this.snapshot) {
                this.ctx.putImageData(this.snapshot, 0, 0);
            }

            this.ctx.beginPath();
            this.ctx.strokeStyle = this.currentColor;
            this.ctx.lineWidth = this.brushSize;
            this.ctx.moveTo(this.polygonPoints[0].x, this.polygonPoints[0].y);
            
        
            for (let i = 1; i < this.polygonPoints.length; i++) {
                this.ctx.lineTo(this.polygonPoints[i].x, this.polygonPoints[i].y);
            }
            
            if (this.polygonPoints.length === 2) {
                const p1 = this.polygonPoints[0];
                const p2 = this.polygonPoints[1];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx);
                
                const p3x = p1.x + length * Math.cos(angle + Math.PI / 3);
                const p3y = p1.y + length * Math.sin(angle + Math.PI / 3);
                
                this.ctx.setLineDash([5, 5]);
                this.ctx.lineTo(p3x, p3y);
                this.ctx.lineTo(p1.x, p1.y);
                this.ctx.setLineDash([]);
            }
            
            this.ctx.stroke();
        }

        if (this.polygonPoints.length === 3) {
            this.drawPolygon(true);
        }
    }

    drawPolygon(finalize = false) {
        if (this.polygonPoints.length < 2) {
            this.polygonPoints = [];
            this.snapshot = null;
            return;
        }

        if (this.snapshot) {
            this.ctx.putImageData(this.snapshot, 0, 0);
        }

        this.ctx.beginPath();
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.fillStyle = this.currentColor;
        this.ctx.lineWidth = this.brushSize;
        
       
        this.ctx.moveTo(this.polygonPoints[0].x, this.polygonPoints[0].y);
        for (let i = 1; i < this.polygonPoints.length; i++) {
            this.ctx.lineTo(this.polygonPoints[i].x, this.polygonPoints[i].y);
        }
        
       
        this.ctx.closePath();
        
        
        if (finalize) {
            this.ctx.fill();
        }
        
        this.ctx.stroke();

        if (finalize) {
            this.polygonPoints = [];
            this.snapshot = null;
            this.saveState();
        }
    }

    drawShapePreview(currentX, currentY) {
        this.ctx.beginPath();
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.fillStyle = this.currentColor;
        this.ctx.lineWidth = this.brushSize;

        if (this.currentTool === 'line') {
            this.ctx.moveTo(this.startX, this.startY);
            this.ctx.lineTo(currentX, currentY);
        } else if (this.currentTool === 'rectangle') {
            const width = currentX - this.startX;
            const height = currentY - this.startY;
            this.ctx.strokeRect(this.startX, this.startY, width, height);
        } else if (this.currentTool === 'circle') {
            const dx = currentX - this.startX;
            const dy = currentY - this.startY;
            const radiusX = Math.abs(dx / 2);
            const radiusY = Math.abs(dy / 2);
            const centerX = this.startX + dx / 2;
            const centerY = this.startY + dy / 2;
            this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        } else if (this.currentTool === 'rounded-rect') {
            const width = currentX - this.startX;
            const height = currentY - this.startY;
            const radius = Math.min(Math.abs(width), Math.abs(height)) * 0.2;
            
            this.ctx.moveTo(this.startX + radius, this.startY);
            this.ctx.lineTo(this.startX + width - radius, this.startY);
            this.ctx.quadraticCurveTo(this.startX + width, this.startY, this.startX + width, this.startY + radius);
            this.ctx.lineTo(this.startX + width, this.startY + height - radius);
            this.ctx.quadraticCurveTo(this.startX + width, this.startY + height, this.startX + width - radius, this.startY + height);
            this.ctx.lineTo(this.startX + radius, this.startY + height);
            this.ctx.quadraticCurveTo(this.startX, this.startY + height, this.startX, this.startY + height - radius);
            this.ctx.lineTo(this.startX, this.startY + radius);
            this.ctx.quadraticCurveTo(this.startX, this.startY, this.startX + radius, this.startY);
            this.ctx.closePath();
        }
        this.ctx.stroke();
    }
    
    stopDrawing(e) {
        if (!this.isDrawing) return;

        const { x, y } = this.getMousePos(e || { clientX: this.lastX, clientY: this.lastY });

        switch (this.currentTool) {
            case 'select':
                this.finalizeSelection();
                break;
            case 'curve':
                this.finalizeCurve();
                break;
            case 'rounded-rect':
                this.finalizeRoundedRect();
                break;
            case 'pencil':
            case 'brush':
            case 'eraser':
                this.ctx.lineTo(x, y);
                this.ctx.stroke();
                this.ctx.closePath();
                break;
            case 'line':
            case 'rectangle':
            case 'triangle':
            case 'circle':
                if (this.snapshot) {
                    this.ctx.putImageData(this.snapshot, 0, 0);
                    this.drawShapePreview(x, y);
                    this.snapshot = null;
                }
                break;
        }

        if (this.currentTool === 'airbrush') {
            this.stopAirbrush();
        }

        this.isDrawing = false;
        this.saveState();
    }

    startAirbrush() {
        if (this.airbrushInterval) return;
        this.airbrushInterval = setInterval(() => {
            const x = this.lastX;
            const y = this.lastY;
            const size = this.brushSize;
            
            
            for (let i = 0; i < 25; i++) {
                
                const goldenAngle = Math.PI * (3 - Math.sqrt(5));
                const radius = Math.sqrt(i / 25) * size * 2; 
                const angle = i * goldenAngle;
                
                const dotX = Math.round(x + Math.cos(angle) * radius);
                const dotY = Math.round(y + Math.sin(angle) * radius);
                
                this.ctx.fillStyle = this.currentColor;
                this.ctx.fillRect(dotX, dotY, 1, 1);
            }
        }, 25); 
    }

    stopAirbrush() {
        if (this.airbrushInterval) {
            clearInterval(this.airbrushInterval);
            this.airbrushInterval = null;
        }
    }

    addText(x, y) {
        const text = prompt("Enter text:", "Hello Paintr!");
        if (text) {
            this.ctx.font = `${this.brushSize * 5}px 'MS Sans Serif', sans-serif`; 
            this.ctx.fillStyle = this.currentColor;
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'top';
            this.ctx.fillText(text, x, y);
            this.saveState();
        }
    }
    
    clearCanvas() {
        this.ctx.fillStyle = this.bgColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
    }
    
    saveState() {
       
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        
        
        this.history.push(this.canvas.toDataURL());
        
        
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
        
        this.historyIndex = this.history.length - 1;
        this.updateHistoryButtons();
    }
    
    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.loadState(this.history[this.historyIndex]);
            this.updateHistoryButtons();
            showNotification('Undo successful', 'info');
        }
    }
    
    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.loadState(this.history[this.historyIndex]);
            this.updateHistoryButtons();
            showNotification('Redo successful', 'info');
        }
    }
    
    loadState(state) {
        const img = new Image();
        img.onload = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);
        };
        img.src = state;
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvasAspect = this.canvas.width / this.canvas.height;
                    const imgAspect = img.width / img.height;
                    let drawWidth, drawHeight, offsetX, offsetY;

                    if (imgAspect > canvasAspect) {
                        drawWidth = this.canvas.width;
                        drawHeight = drawWidth / imgAspect;
                        offsetX = 0;
                        offsetY = (this.canvas.height - drawHeight) / 2;
                    } else {
                        drawHeight = this.canvas.height;
                        drawWidth = drawHeight * imgAspect;
                        offsetY = 0;
                        offsetX = (this.canvas.width - drawWidth) / 2;
                    }

                    this.clearCanvas(); 
                    this.ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
                    this.saveState(); 
                };
                 img.onerror = () => alert("Failed to load image file.");
                img.src = event.target.result;
            };
            reader.onerror = () => alert("Error reading file.");
            reader.readAsDataURL(file);
        }
        e.target.value = null; 
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'o':
                        e.preventDefault();
                        this.handleFileOpen();
                        break;
                    case 's':
                        e.preventDefault();
                        this.saveImage();
                        break;
                    case 'z':
                        e.preventDefault();
                        if (!e.shiftKey) this.undo();
                        break;
                    case 'y':
                        e.preventDefault();
                        this.redo();
                        break;
                    case 'a':
                        e.preventDefault();
                        this.selectAll();
                        break;
                }
            }

            switch (e.key.toLowerCase()) {
                case 'b':
                    this.setActiveTool('brush');
                    break;
                case 'e':
                    this.setActiveTool('eraser');
                    break;
                case 'f':
                    this.setActiveTool('fill');
                    break;
                case 'l':
                    this.setActiveTool('line');
                    break;
                case 'r':
                    this.setActiveTool('rectangle');
                    break;
                case 'c':
                    this.setActiveTool('circle');
                    break;
                case 't':
                    this.setActiveTool('text');
                    break;
                case 'p':
                    this.setActiveTool('pencil');
                    break;
                case 'a':
                    this.setActiveTool('airbrush');
                    break;
                case 'i':
                    this.setActiveTool('pick');
                    break;
                case ' ':
                    if (!this.isDrawing) {
                        this.canvas.style.cursor = 'grab';
                    }
                    break;
                case '+':
                    this.zoomIn();
                    break;
                case '-':
                    this.zoomOut();
                    break;
                case '0':
                    this.resetZoom();
                    break;
                case 'escape':
                    this.cancelSelection();
                    break;
                case 'delete':
                    this.clearSelection();
                    break;
            }

            if (!isNaN(e.key) && e.key !== '0') {
                const size = parseInt(e.key);
                if (size >= 1 && size <= 9) {
                    this.brushSize = size;
                    this.updateBrushSize();
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === ' ') {
                this.canvas.style.cursor = 'default';
            }
        });
    }

    updateShortcutsHint() {
         if (!this.shortcutsHint) return;
         this.shortcutsHint.textContent = `Ctrl+S: Save | Ctrl+O: Open | Ctrl+Z: Undo | Ctrl+Y: Redo`;
    }

    saveImage() {
        try {
            const link = document.createElement('a');
            link.download = 'paintr-drawing.png';
            link.href = this.canvas.toDataURL('image/png');
            link.click();
            showNotification('Image saved successfully', 'success');
        } catch (error) {
            showNotification('Error saving image: ' + error.message, 'error');
        }
    }

    pickColor(x, y) {
        try {
            const pixelData = this.ctx.getImageData(x, y, 1, 1).data;
            
            if (pixelData[3] === 0) return; 

            const hexColor = `#${("000000" + ((pixelData[0] << 16) | (pixelData[1] << 8) | pixelData[2]).toString(16)).slice(-6)}`;
            this.setCurrentColor(hexColor);
            
            
        } catch (error) {
             console.error("Error picking color:", error); 
             
        }
    }

    floodFill(startX, startY, fillColor) {
        console.time('floodFill');
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        const imageData = this.ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        const data = imageData.data;
        const startIdx = (startY * canvasWidth + startX) * 4;
        const startColor = [data[startIdx], data[startIdx + 1], data[startIdx + 2], data[startIdx + 3]];
        
        const targetColor = this.hexToRgb(fillColor);
        if (!targetColor) return; 

        
        if (startColor[0] === targetColor.r && startColor[1] === targetColor.g && startColor[2] === targetColor.b) {
            console.timeEnd('floodFill');
            return; 
        }

        const queue = [[startX, startY]];
        const visited = new Set(); 

        while (queue.length > 0) {
            const [x, y] = queue.shift();

            if (x < 0 || x >= canvasWidth || y < 0 || y >= canvasHeight) continue;
            
            const idx = (y * canvasWidth + x) * 4;
            const key = `${x},${y}`;

            if (visited.has(key)) continue;
            
            const currentColor = [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];

            
            if (currentColor[0] === startColor[0] && 
                currentColor[1] === startColor[1] && 
                currentColor[2] === startColor[2] && 
                currentColor[3] === startColor[3]) 
            {
                
                data[idx] = targetColor.r;
                data[idx + 1] = targetColor.g;
                data[idx + 2] = targetColor.b;
                data[idx + 3] = 255; 

                visited.add(key);

                queue.push([x + 1, y]);
                queue.push([x - 1, y]);
                queue.push([x, y + 1]);
                queue.push([x, y - 1]);
            }
        }

        this.ctx.putImageData(imageData, 0, 0);
        console.timeEnd('floodFill');
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    rgbToHex(rgbString) {
        if (!rgbString || !rgbString.startsWith('rgb')) return rgbString; 
        const match = rgbString.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (!match) return rgbString;
        const r = parseInt(match[1], 10);
        const g = parseInt(match[2], 10);
        const b = parseInt(match[3], 10);
        return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase()}`;
    }

    showToolPreview(e) {
        const { x, y } = this.getMousePos(e);
        const preview = document.createElement('div');
        preview.className = 'tool-preview';
        preview.style.position = 'fixed';
        preview.style.left = `${e.clientX}px`;
        preview.style.top = `${e.clientY}px`;
        preview.style.pointerEvents = 'none';
        preview.style.zIndex = '1000';
        
        this.canvas.style.cursor = this.getCursorForTool(this.currentTool);
        
        if (['brush', 'eraser', 'airbrush'].includes(this.currentTool)) {
            preview.style.width = `${this.brushSize * 2}px`;
            preview.style.height = `${this.brushSize * 2}px`;
            preview.style.border = '1px solid rgba(255, 255, 255, 0.5)';
            preview.style.borderRadius = '50%';
            preview.style.transform = 'translate(-50%, -50%)';
            document.body.appendChild(preview);
            return preview;
        }
        
        return null;
    }

    startSelection(x, y) {
        this.selection = {
            startX: x,
            startY: y,
            width: 0,
            height: 0
        };
        this.snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }

    updateSelection(x, y) {
        if (!this.selection) return;
        this.ctx.putImageData(this.snapshot, 0, 0);
        
        this.selection.width = x - this.selection.startX;
        this.selection.height = y - this.selection.startY;
        
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeRect(
            this.selection.startX,
            this.selection.startY,
            this.selection.width,
            this.selection.height
        );
        this.ctx.setLineDash([]);
    }

    finalizeSelection() {
        if (!this.selection) return;
        
        const selectionCanvas = document.createElement('canvas');
        selectionCanvas.width = Math.abs(this.selection.width);
        selectionCanvas.height = Math.abs(this.selection.height);
        const selectionCtx = selectionCanvas.getContext('2d');
        
        selectionCtx.drawImage(
            this.canvas,
            this.selection.startX,
            this.selection.startY,
            this.selection.width,
            this.selection.height,
            0,
            0,
            Math.abs(this.selection.width),
            Math.abs(this.selection.height)
        );
        
        this.currentSelection = selectionCanvas;
        this.selection = null;
    }

    startCurve(x, y) {
        this.curveStartPoint = { x, y };
        this.curvePoints = [{ x, y }];
        this.isDrawingCurve = true;
        this.snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }

    updateCurve(x, y) {
        if (!this.isDrawingCurve) return;
        
        this.curvePoints.push({ x, y });
        this.ctx.putImageData(this.snapshot, 0, 0);
        
        this.ctx.beginPath();
        this.ctx.moveTo(this.curveStartPoint.x, this.curveStartPoint.y);
        
        for (let i = 1; i < this.curvePoints.length; i++) {
            const point = this.curvePoints[i];
            const prevPoint = this.curvePoints[i - 1];
            const nextPoint = this.curvePoints[i + 1] || point;
            
            const cpX = (prevPoint.x + point.x) / 2;
            const cpY = (prevPoint.y + point.y) / 2;
            
            this.ctx.quadraticCurveTo(cpX, cpY, point.x, point.y);
        }
        
        this.ctx.stroke();
    }

    finalizeCurve() {
        if (!this.isDrawingCurve) return;
        this.isDrawingCurve = false;
        this.curvePoints = [];
    }

    startRoundedRect(x, y) {
        this.startX = x;
        this.startY = y;
        this.snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }

    updateRoundedRect(x, y) {
        if (!this.snapshot) return;
        this.ctx.putImageData(this.snapshot, 0, 0);
        
        const width = x - this.startX;
        const height = y - this.startY;
        const radius = Math.min(Math.abs(width), Math.abs(height)) * 0.2; 
        
        this.ctx.beginPath();
        this.ctx.moveTo(this.startX + radius, this.startY);
        this.ctx.lineTo(this.startX + width - radius, this.startY);
        this.ctx.quadraticCurveTo(this.startX + width, this.startY, this.startX + width, this.startY + radius);
        this.ctx.lineTo(this.startX + width, this.startY + height - radius);
        this.ctx.quadraticCurveTo(this.startX + width, this.startY + height, this.startX + width - radius, this.startY + height);
        this.ctx.lineTo(this.startX + radius, this.startY + height);
        this.ctx.quadraticCurveTo(this.startX, this.startY + height, this.startX, this.startY + height - radius);
        this.ctx.lineTo(this.startX, this.startY + radius);
        this.ctx.quadraticCurveTo(this.startX, this.startY, this.startX + radius, this.startY);
        this.ctx.closePath();
        this.ctx.stroke();
    }

    finalizeRoundedRect() {
        if (!this.snapshot) return;
        this.ctx.putImageData(this.snapshot, 0, 0);
        this.updateRoundedRect(this.lastX, this.lastY);
        this.snapshot = null;
    }

    updateHistoryButtons() {
        const undoBtn = document.querySelector('[data-action="undo"]');
        const redoBtn = document.querySelector('[data-action="redo"]');
        
        if (undoBtn) {
            undoBtn.disabled = this.historyIndex <= 0;
            undoBtn.classList.toggle('disabled', this.historyIndex <= 0);
        }
        
        if (redoBtn) {
            redoBtn.disabled = this.historyIndex >= this.history.length - 1;
            redoBtn.classList.toggle('disabled', this.historyIndex >= this.history.length - 1);
        }
    }

    updateShortcutHints() {
        const shortcutsElement = document.querySelector('.shortcuts');
        if (shortcutsElement) {
            shortcutsElement.innerHTML = Object.entries(SHORTCUTS)
                .map(([key, action]) => `<span class="shortcut-hint">${key}: ${action}</span>`)
                .join(' | ');
        }
    }

    selectAll() {
        if (this.activeTool === 'select') {
            this.selection = {
                x: 0,
                y: 0,
                width: this.canvas.width,
                height: this.canvas.height
            };
            this.drawSelection();
            showNotification('All selected', 'info');
        }
    }

    clearSelection() {
        if (this.selection) {
            this.ctx.clearRect(
                this.selection.x,
                this.selection.y,
                this.selection.width,
                this.selection.height
            );
            this.selection = null;
            this.saveState();
            showNotification('Selection cleared', 'info');
        }
    }

    cancelSelection() {
        if (this.selection) {
            this.selection = null;
            this.redrawCanvas();
            showNotification('Selection cancelled', 'info');
        }
    }

    zoomIn() {
        this.zoom *= 1.2;
        this.updateZoom();
        showNotification(`Zoom: ${Math.round(this.zoom * 100)}%`, 'info');
    }

    zoomOut() {
        this.zoom /= 1.2;
        this.updateZoom();
        showNotification(`Zoom: ${Math.round(this.zoom * 100)}%`, 'info');
    }

    resetZoom() {
        this.zoom = 1;
        this.updateZoom();
        showNotification('Zoom reset', 'info');
    }

    updateZoom() {
        this.canvas.style.transform = `scale(${this.zoom})`;
        this.canvas.style.transformOrigin = 'top left';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const paintr = new Paintr();
}); 