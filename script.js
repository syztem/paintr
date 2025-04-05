const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SUPPORTED_FORMATS = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_HISTORY_SIZE = 50;
const SHORTCUTS = {
    'Ctrl+O': 'Open Image', 'Ctrl+S': 'Save Image', 'Ctrl+Z': 'Undo', 'Ctrl+Y': 'Redo',
    'Ctrl+A': 'Select All', 'Delete': 'Clear Selection', 'Escape': 'Cancel Selection',
    'Space': 'Pan Canvas', '+': 'Zoom In', '-': 'Zoom Out', '0': 'Reset Zoom', '1-9': 'Brush Size',
    'B': 'Brush Tool', 'E': 'Eraser', 'F': 'Fill Tool', 'L': 'Line Tool', 'R': 'Rectangle Tool',
    'C': 'Circle Tool', 'T': 'Text Tool', 'P': 'Pencil Tool', 'A': 'Airbrush Tool', 'I': 'Color Picker'
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
        input.accept = SUPPORTED_FORMATS.join(',');
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
             this.saveState(true);
        }
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
            btn.addEventListener('click', () => this.setCurrentColor(btn.style.backgroundColor));
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
             this.updateBrushSize(parseInt(e.target.value, 10));
        });

        let previewElement = null;
        this.canvas.addEventListener('mousemove', (e) => {
            if (previewElement) previewElement.remove();
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
                    case 'file': this.fileInput.click(); break;
                    case 'save': this.saveImage(); break;
                    case 'undo': this.undo(); break;
                    case 'redo': this.redo(); break;
                    case 'help': alert('Paintr - Simple paint app. Tools on left, colors on right. Check status bar for basic shortcuts.'); break;
                }
            });
        });
    }

    setupThemeToggle() {
        this.themeToggle.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light-mode');
            this.themeToggle.textContent = isLight ? '🌙' : '☀️';
            this.bgColor = '#000000';
            this.updateColorDisplay(this.currentColor);
        });
    }

    setupColorModeToggle() {
        this.colorModeToggle.addEventListener('click', () => {
            const contempColors = document.querySelector('.contemporary-colors');
            const basicColors = document.querySelector('.basic-colors');
            const isBasicVisible = basicColors.style.display !== 'none';
            contempColors.style.display = isBasicVisible ? 'flex' : 'none';
            basicColors.style.display = isBasicVisible ? 'none' : 'flex';
            this.colorModeToggle.textContent = isBasicVisible ? '🎨' : '🎯';
        });
        document.querySelector('.contemporary-colors').style.display = 'flex';
        document.querySelector('.basic-colors').style.display = 'none';
        this.colorModeToggle.textContent = '🎨';
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX / this.zoom,
            y: (e.clientY - rect.top) * scaleY / this.zoom
        };
    }

    setActiveTool(tool) {
        if (!tool) return;
        this.stopAirbrush();
        if (this.currentTool === 'polygon' && this.polygonPoints.length > 0) {
            this.drawPolygon(true);
        }
        this.polygonPoints = [];

        document.querySelectorAll('.tool-btn.active').forEach(b => b.classList.remove('active'));
        const toolButton = document.querySelector(`.tool-btn[data-tool="${tool}"]`);

        if (toolButton) {
            toolButton.classList.add('active');
            this.currentTool = tool;
            this.canvas.style.cursor = this.getCursorForTool(tool);

            let defaultSize = 4;
            if (tool === 'pencil') defaultSize = 1;
            else if (tool === 'eraser') defaultSize = 20;
            else if (tool === 'airbrush') defaultSize = 25;
            this.updateBrushSize(defaultSize);

        } else {
            this.setActiveTool('pencil');
        }
    }

     updateBrushSize(size) {
        this.brushSize = size;
        this.brushSizeSlider.value = size;
        this.brushSizeValue.textContent = size;
    }

    setCurrentColor(color) {
        this.currentColor = this.rgbToHex(color);
        document.querySelectorAll('.color-btn.active').forEach(b => b.classList.remove('active'));
        const colorButton = Array.from(document.querySelectorAll('.color-btn')).find(btn =>
            this.rgbToHex(btn.style.backgroundColor) === this.currentColor
        );
        if (colorButton) colorButton.classList.add('active');
        this.updateColorDisplay(this.currentColor);
    }

    updateColorDisplay(color) {
        const isLight = document.body.classList.contains('light-mode');
        const borderColor = isLight ? 'var(--light-text)' : 'var(--dark-text)';
        const displayBorderColor = isLight ? 'var(--light-border)' : 'var(--dark-border)';

        if (this.activeColorSwatch) {
            this.activeColorSwatch.style.backgroundColor = color;
            this.activeColorSwatch.style.borderColor = borderColor;
        }
        if (this.currentColorDisplay) {
            this.currentColorDisplay.style.backgroundColor = color;
            this.currentColorDisplay.style.borderColor = displayBorderColor;
        }
    }

    getCursorForTool(tool) {
        switch (tool) {
            case 'pencil': case 'brush': case 'line': case 'rectangle':
            case 'circle': case 'polygon': case 'airbrush': case 'pick':
            case 'curve': case 'rounded-rect': case 'select':
                 return 'crosshair';
            case 'eraser': return 'cell';
            case 'fill': return 'pointer';
            case 'text': return 'text';
            default: return 'default';
        }
    }

    startDrawing(e) {
        if (e.button !== 0) return;
        const { x, y } = this.getMousePos(e);
        this.isDrawing = true;
        this.lastX = x; this.lastY = y;
        this.startX = x; this.startY = y;

        this.ctx.lineWidth = this.brushSize;
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.fillStyle = this.currentColor;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        const shapeTools = ['line', 'rectangle', 'circle', 'curve', 'rounded-rect', 'select'];
        if (shapeTools.includes(this.currentTool)) {
             this.snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        }

        if (['pencil', 'brush', 'eraser'].includes(this.currentTool)) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.lastX, this.lastY);
        }

        if (this.currentTool === 'airbrush') this.startAirbrush();
        if (this.currentTool === 'curve') this.curvePoints = [{ x, y }];
    }

    draw(e) {
        if (!this.isDrawing) return;
        const { x, y } = this.getMousePos(e);

        switch (this.currentTool) {
            case 'pencil': case 'brush':
                this.ctx.lineTo(x, y);
                this.ctx.stroke();
                break;
            case 'eraser':
                this.ctx.save();
                this.ctx.globalCompositeOperation = 'destination-out';
                this.ctx.strokeStyle = 'rgba(0,0,0,1)';
                this.ctx.lineWidth = this.brushSize * 1.5;
                this.ctx.beginPath();
                this.ctx.moveTo(this.lastX, this.lastY);
                this.ctx.lineTo(x, y);
                this.ctx.stroke();
                this.ctx.restore();
                break;
            case 'line': case 'rectangle': case 'circle': case 'rounded-rect': case 'select':
                 if (!this.snapshot) return;
                 this.ctx.putImageData(this.snapshot, 0, 0);
                 this.drawShapePreview(x, y);
                 break;
            case 'curve':
                 if (!this.snapshot) return;
                 this.ctx.putImageData(this.snapshot, 0, 0);
                 this.drawCurvePreview(x, y);
                 break;
        }
        this.lastX = x; this.lastY = y;
    }

    handleClick(e) {
         if (e.button !== 0) return;
         const { x, y } = this.getMousePos(e);
         switch (this.currentTool) {
            case 'pick': this.pickColor(x, y); break;
            case 'fill': this.floodFill(Math.round(x), Math.round(y), this.currentColor); this.saveState(); break;
            case 'text': this.addText(x, y); break;
            case 'polygon': this.handlePolygonClick(x, y); break;
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
            this.drawPolygonPreview();
        }
        if (this.polygonPoints.length === 3) {
            this.drawPolygon(true);
        }
    }

    drawPolygonPreview() {
        this.ctx.beginPath();
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.brushSize;
        this.ctx.moveTo(this.polygonPoints[0].x, this.polygonPoints[0].y);
        for (let i = 1; i < this.polygonPoints.length; i++) {
            this.ctx.lineTo(this.polygonPoints[i].x, this.polygonPoints[i].y);
        }
        if (this.polygonPoints.length === 2) {
             this.ctx.setLineDash([5, 5]);
             this.ctx.lineTo(this.polygonPoints[0].x, this.polygonPoints[0].y);
             this.ctx.setLineDash([]);
        }
        this.ctx.stroke();
    }

    drawPolygon(finalize = false) {
        if (this.polygonPoints.length < 3) {
            if(finalize) {
                 this.polygonPoints = [];
                 this.snapshot = null;
                 if(this.history[this.historyIndex]) this.loadState(this.history[this.historyIndex]);
            }
            return;
        }
        if (this.snapshot) this.ctx.putImageData(this.snapshot, 0, 0);

        this.ctx.beginPath();
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.fillStyle = this.currentColor;
        this.ctx.lineWidth = this.brushSize;
        this.ctx.moveTo(this.polygonPoints[0].x, this.polygonPoints[0].y);
        for (let i = 1; i < this.polygonPoints.length; i++) {
            this.ctx.lineTo(this.polygonPoints[i].x, this.polygonPoints[i].y);
        }
        this.ctx.closePath();
        if (finalize) this.ctx.fill();
        this.ctx.stroke();

        if (finalize) {
            this.polygonPoints = [];
            this.snapshot = null;
            this.saveState();
        }
    }

    drawShapePreview(currentX, currentY) {
        this.ctx.beginPath();
        this.ctx.strokeStyle = (this.currentTool === 'select') ? '#00ff00' : this.currentColor;
        this.ctx.fillStyle = this.currentColor;
        this.ctx.lineWidth = (this.currentTool === 'select') ? 1 : this.brushSize;
        if (this.currentTool === 'select') this.ctx.setLineDash([5, 5]);

        const width = currentX - this.startX;
        const height = currentY - this.startY;

        if (this.currentTool === 'line') {
            this.ctx.moveTo(this.startX, this.startY);
            this.ctx.lineTo(currentX, currentY);
        } else if (this.currentTool === 'rectangle' || this.currentTool === 'select') {
            this.ctx.strokeRect(this.startX, this.startY, width, height);
        } else if (this.currentTool === 'circle') {
            const radiusX = Math.abs(width / 2);
            const radiusY = Math.abs(height / 2);
            const centerX = this.startX + width / 2;
            const centerY = this.startY + height / 2;
            this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        } else if (this.currentTool === 'rounded-rect') {
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
        if (this.currentTool === 'select') this.ctx.setLineDash([]);
    }

     drawCurvePreview(currentX, currentY) {
        this.ctx.beginPath();
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.brushSize;
        this.ctx.moveTo(this.curvePoints[0].x, this.curvePoints[0].y);

        if (this.curvePoints.length === 1) {
             this.ctx.lineTo(currentX, currentY);
        } else {
             const lastPoint = this.curvePoints[this.curvePoints.length - 1];
             const cpX = (lastPoint.x + currentX) / 2;
             const cpY = (lastPoint.y + currentY) / 2;

             for (let i = 1; i < this.curvePoints.length; i+=2) {
                 if (i + 1 < this.curvePoints.length) {
                    const p1 = this.curvePoints[i];
                    const p2 = this.curvePoints[i+1];
                    this.ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
                 } else {
                    this.ctx.lineTo(this.curvePoints[i].x, this.curvePoints[i].y);
                 }
             }

             this.ctx.quadraticCurveTo(cpX, cpY, currentX, currentY);
        }
        this.ctx.stroke();
    }


    stopDrawing(e) {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        const { x, y } = this.getMousePos(e || { clientX: this.lastX / (this.canvas.width / this.canvas.getBoundingClientRect().width) + this.canvas.getBoundingClientRect().left, clientY: this.lastY / (this.canvas.height / this.canvas.getBoundingClientRect().height) + this.canvas.getBoundingClientRect().top });

        switch (this.currentTool) {
            case 'select':
                 if (this.snapshot) this.ctx.putImageData(this.snapshot, 0, 0);
                 this.finalizeSelection(x, y);
                 break;
             case 'pencil': case 'brush': case 'eraser':
                this.ctx.closePath();
                break;
            case 'line': case 'rectangle': case 'circle': case 'rounded-rect': case 'curve':
                if (this.snapshot) {
                    this.ctx.putImageData(this.snapshot, 0, 0);
                    if(this.currentTool === 'curve') this.finalizeCurve(x,y);
                    else this.drawShapePreview(x, y);
                    this.snapshot = null;
                }
                break;
        }

        if (this.currentTool === 'airbrush') this.stopAirbrush();


        if (this.currentTool !== 'select' && this.currentTool !== 'pick') {
             this.saveState();
        }
    }

    startAirbrush() {
        if (this.airbrushInterval) return;
        this.airbrushInterval = setInterval(() => {
            const x = this.lastX; const y = this.lastY;
            const size = this.brushSize;
            for (let i = 0; i < 25; i++) {
                const angle = Math.random() * 2 * Math.PI;
                const radius = Math.sqrt(Math.random()) * size;
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
        const text = prompt("Enter text:", "Paintr!");
        if (text) {
            this.ctx.font = `${this.brushSize * 5}px sans-serif`;
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

    saveState(isInitial = false) {

        const currentState = this.canvas.toDataURL();
        if (!isInitial && this.history.length > 0 && this.history[this.historyIndex] === currentState) {
            return;
        }

        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        this.history.push(currentState);
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
            showNotification('Undo', 'info');
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.loadState(this.history[this.historyIndex]);
            this.updateHistoryButtons();
            showNotification('Redo', 'info');
        }
    }

    loadState(state) {
        const img = new Image();
        img.onload = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
        };
        img.onerror = () => console.error("Failed to load state image.");
        img.src = state;
    }

    loadImageDataURL(dataURL, save = true) {
         const img = new Image();
         img.onload = () => {
             this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
             this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
             if (save) this.saveState();
         };
         img.onerror = () => showNotification("Failed to load image data.", "error");
         img.src = dataURL;
     }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file && file.size <= MAX_FILE_SIZE && SUPPORTED_FORMATS.includes(file.type)) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {

                    const hRatio = this.canvas.width / img.width;
                    const vRatio = this.canvas.height / img.height;
                    const ratio = Math.min(hRatio, vRatio);
                    const centerShift_x = (this.canvas.width - img.width * ratio) / 2;
                    const centerShift_y = (this.canvas.height - img.height * ratio) / 2;

                    this.clearCanvas();
                    this.ctx.drawImage(img, 0, 0, img.width, img.height,
                                       centerShift_x, centerShift_y, img.width * ratio, img.height * ratio);
                    this.history = [];
                    this.historyIndex = -1;
                    this.saveState(true);
                    showNotification('Image loaded', 'success');
                };
                 img.onerror = () => showNotification("Failed to load image file.", "error");
                img.src = event.target.result;
            };
            reader.onerror = () => showNotification("Error reading file.", "error");
            reader.readAsDataURL(file);
        } else if (file && file.size > MAX_FILE_SIZE) {
             showNotification(`File too large (Max: ${MAX_FILE_SIZE / 1024 / 1024}MB)`, 'error');
        } else if (file) {
             showNotification(`Unsupported format. Use: ${SUPPORTED_FORMATS.map(f => f.split('/')[1]).join(', ')}`, 'error');
        }
        e.target.value = null;
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const key = e.key.toLowerCase();
            const ctrlCmd = e.ctrlKey || e.metaKey;

            if (ctrlCmd) {
                switch (key) {
                    case 'o': e.preventDefault(); this.fileInput.click(); break;
                    case 's': e.preventDefault(); this.saveImage(); break;
                    case 'z': e.preventDefault(); if (!e.shiftKey) this.undo(); else this.redo(); break;
                    case 'y': e.preventDefault(); this.redo(); break;
                    case 'a': e.preventDefault(); if (this.currentTool === 'select') this.selectAll(); break;
                }
            } else {
                switch (key) {
                    case 'b': this.setActiveTool('brush'); break;
                    case 'e': this.setActiveTool('eraser'); break;
                    case 'f': this.setActiveTool('fill'); break;
                    case 'l': this.setActiveTool('line'); break;
                    case 'r': this.setActiveTool('rectangle'); break;
                    case 'c': this.setActiveTool('circle'); break;
                    case 't': this.setActiveTool('text'); break;
                    case 'p': this.setActiveTool('pencil'); break;
                    case 'a': this.setActiveTool('airbrush'); break;
                    case 'i': this.setActiveTool('pick'); break;
                    case ' ': if (!this.isDrawing) this.canvas.style.cursor = 'grab'; break;
                    case '+': this.zoomIn(); break;
                    case '-': this.zoomOut(); break;
                    case '0': this.resetZoom(); break;
                    case 'escape': this.cancelSelection(); break;
                    case 'delete': case 'backspace': this.clearSelection(); break;
                    default:
                        if (!isNaN(key) && key !== '0') {
                             const size = parseInt(key);
                             if (size >= 1 && size <= 9) this.updateBrushSize(size);
                        }
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === ' ') this.canvas.style.cursor = this.getCursorForTool(this.currentTool);
        });
    }

    updateShortcutsHint() {
         if (this.shortcutsHint) {
             this.shortcutsHint.textContent = `Ctrl+S: Save | Ctrl+O: Open | Ctrl+Z: Undo | Ctrl+Y: Redo`;
         }
    }

    saveImage() {
        try {
            const link = document.createElement('a');
            link.download = 'paintr-drawing.png';
            link.href = this.canvas.toDataURL('image/png');
            link.click();
            showNotification('Image saved', 'success');
        } catch (error) {
            showNotification('Error saving image: ' + error.message, 'error');
        }
    }

    pickColor(x, y) {
        try {
            const pixelData = this.ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
            if (pixelData[3] === 0) return;
            const hexColor = `#${((1 << 24) + (pixelData[0] << 16) + (pixelData[1] << 8) + pixelData[2]).toString(16).slice(1).toUpperCase()}`;
            this.setCurrentColor(hexColor);

        } catch (error) {
             if (error.name === 'SecurityError') {
                 showNotification('Cannot pick color from loaded image due to security restrictions.', 'warning');
             } else {
                 showNotification('Error picking color.', 'error');
             }
        }
    }

    floodFill(startX, startY, fillColor) {
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        const imageData = this.ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        const data = imageData.data;
        const startIdx = (startY * canvasWidth + startX) * 4;
        const startColor = [data[startIdx], data[startIdx + 1], data[startIdx + 2], data[startIdx + 3]];
        const targetRgb = this.hexToRgb(fillColor);

        if (!targetRgb || (startColor[0] === targetRgb.r && startColor[1] === targetRgb.g && startColor[2] === targetRgb.b && startColor[3] === 255)) {
             return;
        }

        const queue = [[startX, startY]];
        const visited = new Uint8Array(canvasWidth * canvasHeight);

        while (queue.length > 0) {
            const [x, y] = queue.shift();

            if (x < 0 || x >= canvasWidth || y < 0 || y >= canvasHeight) continue;

            const visitedIdx = y * canvasWidth + x;
            if (visited[visitedIdx]) continue;

            const currentIdx = visitedIdx * 4;
            const currentColor = [data[currentIdx], data[currentIdx + 1], data[currentIdx + 2], data[currentIdx + 3]];

            if (currentColor[0] === startColor[0] && currentColor[1] === startColor[1] &&
                currentColor[2] === startColor[2] && currentColor[3] === startColor[3])
            {
                data[currentIdx] = targetRgb.r;
                data[currentIdx + 1] = targetRgb.g;
                data[currentIdx + 2] = targetRgb.b;
                data[currentIdx + 3] = 255;
                visited[visitedIdx] = 1;

                queue.push([x + 1, y]);
                queue.push([x - 1, y]);
                queue.push([x, y + 1]);
                queue.push([x, y - 1]);
            } else {
                 visited[visitedIdx] = 1;
            }
        }
        this.ctx.putImageData(imageData, 0, 0);
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
    }

    rgbToHex(rgbString) {
        if (!rgbString || !rgbString.startsWith('rgb')) return rgbString;
        const match = rgbString.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (!match) return rgbString;
        return `#${((1 << 24) | (parseInt(match[1]) << 16) | (parseInt(match[2]) << 8) | parseInt(match[3])).toString(16).slice(1).toUpperCase()}`;
    }

    showToolPreview(e) {
        this.canvas.style.cursor = this.getCursorForTool(this.currentTool);

        if (['brush', 'eraser', 'airbrush', 'pencil'].includes(this.currentTool)) {
            const preview = document.createElement('div');
            preview.className = 'tool-preview';
            preview.style.position = 'fixed';
            preview.style.left = `${e.clientX}px`;
            preview.style.top = `${e.clientY}px`;
            preview.style.pointerEvents = 'none';
            preview.style.zIndex = '1000';
            const size = (this.currentTool === 'eraser' ? this.brushSize * 1.5 : this.brushSize) * this.zoom * 2;
            preview.style.width = `${size}px`;
            preview.style.height = `${size}px`;
            preview.style.border = '1px solid rgba(128, 128, 128, 0.7)';
            preview.style.borderRadius = '50%';
            preview.style.transform = 'translate(-50%, -50%)';
            document.body.appendChild(preview);
            return preview;
        }
        return null;
    }

    finalizeSelection(x, y) {
        if (!this.snapshot) return;
        this.selection = {
            x: Math.min(this.startX, x),
            y: Math.min(this.startY, y),
            width: Math.abs(x - this.startX),
            height: Math.abs(y - this.startY)
        };
        this.snapshot = null;

        this.drawShapePreview(x, y);
        showNotification('Area selected. Press Delete/Backspace to clear or Esc to cancel.', 'info');
    }

    finalizeCurve(x,y) {
        if (!this.snapshot || !this.curvePoints || this.curvePoints.length < 1) return;
        this.ctx.putImageData(this.snapshot, 0, 0);


        this.ctx.beginPath();
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.brushSize;
        this.ctx.moveTo(this.curvePoints[0].x, this.curvePoints[0].y);


        this.curvePoints.push({ x, y });
        for (let i = 1; i < this.curvePoints.length; i++) {
             this.ctx.lineTo(this.curvePoints[i].x, this.curvePoints[i].y);
        }

        this.ctx.stroke();
        this.curvePoints = [];
        this.snapshot = null;
    }

    updateHistoryButtons() {
        const undoBtn = document.querySelector('[data-action="undo"]');
        const redoBtn = document.querySelector('[data-action="redo"]');
        if (undoBtn) undoBtn.disabled = this.historyIndex <= 0;
        if (redoBtn) redoBtn.disabled = this.historyIndex >= this.history.length - 1;
        if (undoBtn) undoBtn.classList.toggle('disabled', undoBtn.disabled);
        if (redoBtn) redoBtn.classList.toggle('disabled', redoBtn.disabled);
    }

    selectAll() {
         this.currentTool = 'select';
         this.setActiveTool('select');
         this.selection = { x: 0, y: 0, width: this.canvas.width, height: this.canvas.height };

         if (this.history.length > 0) this.loadState(this.history[this.historyIndex]);
         this.drawShapePreview(this.canvas.width, this.canvas.height);
         showNotification('All selected. Press Delete/Backspace to clear or Esc to cancel.', 'info');
    }

    clearSelection() {
        if (this.selection && this.selection.width > 0 && this.selection.height > 0) {
             this.ctx.save();
             this.ctx.beginPath();
             this.ctx.rect(this.selection.x, this.selection.y, this.selection.width, this.selection.height);
             this.ctx.clip();
             this.ctx.globalCompositeOperation = 'destination-out';
             this.ctx.fillStyle = 'rgba(0,0,0,1)';
             this.ctx.fillRect(this.selection.x, this.selection.y, this.selection.width, this.selection.height);
             this.ctx.restore();

             this.selection = null;
             this.saveState();
             showNotification('Selection cleared', 'info');
        } else if (this.selection) {
             this.cancelSelection();
        }
    }

    cancelSelection() {
        if (this.selection) {
            this.selection = null;
            if (this.history.length > 0) {
                this.loadState(this.history[this.historyIndex]);
            }
            showNotification('Selection cancelled', 'info');
        }
    }

    zoomIn() {
        this.zoom = Math.min(this.zoom * 1.2, 8);
        this.updateZoom();
        showNotification(`Zoom: ${Math.round(this.zoom * 100)}%`, 'info');
    }

    zoomOut() {
        this.zoom = Math.max(this.zoom / 1.2, 0.25);
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

        const container = this.canvas.parentElement;
        if(container) {
            container.style.overflow = this.zoom > 1 ? 'auto' : 'hidden';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const paintr = new Paintr();
});
