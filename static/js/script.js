const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const clearBtn = document.getElementById('clear');
const saveBtn = document.getElementById('save');
const colorPicker = document.getElementById('colorPicker');
const brushSize = document.getElementById('brushSize');
const undoBtn = document.getElementById('undo');
const redoBtn = document.getElementById('redo');
const fillBtn = document.getElementById('fillBtn');
const brushSizeDisplay = document.getElementById('brushSizeDisplay');
const coordsDisplay = document.getElementById('coordsDisplay');
const cursorCanvas = document.createElement('canvas');
const cursorCtx = cursorCanvas.getContext('2d');

let isDrawing = false;
let lastX = 0;
let lastY = 0;
const undoStack = [];
let currentStateIndex = -1;
let currentCanvasState = null;

cursorCanvas.style.position = 'absolute';
cursorCanvas.style.pointerEvents = 'none';
cursorCanvas.style.top = canvas.offsetTop + 'px';
cursorCanvas.style.left = canvas.offsetLeft + 'px';
canvas.parentElement.appendChild(cursorCanvas);

function saveState() {
    if (currentStateIndex < undoStack.length - 1) {
        undoStack.splice(currentStateIndex + 1);
    }
    undoStack.push(canvas.toDataURL());
    currentStateIndex++;
    if (undoStack.length > 50) {
        undoStack.shift();
        currentStateIndex--;
    }
}

ctx.clearRect(0, 0, canvas.width, canvas.height);
saveState();

function getTouchPos(touchEvent) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: touchEvent.touches[0].clientX - rect.left,
        y: touchEvent.touches[0].clientY - rect.top
    };
}

function getMousePos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    console.log(evt.clientX - rect.left - 5, evt.clientY - rect.top);
    return {
        x: evt.clientX - rect.left ,
        y: evt.clientY - rect.top
    };
}

function draw(e) {
    if (!isDrawing) return;
    
    const pos = e.type.includes('mouse') 
        ? getMousePos(canvas, e)
        : getTouchPos(e);
    
    currentCanvasState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = colorPicker.value;
    ctx.lineWidth = brushSize.value;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    [lastX, lastY] = [pos.x, pos.y];
}

function undo() {
    if (currentStateIndex > 0) {
        currentStateIndex--;
        const img = new Image();
        img.src = undoStack[currentStateIndex];
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
    }
}

function redo() {
    if (currentStateIndex < undoStack.length - 1) {
        currentStateIndex++;
        const img = new Image();
        img.src = undoStack[currentStateIndex];
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
    }
}

canvas.addEventListener('mousedown', (e) => {
    if (fillBtn.classList.contains('active')) {
        floodFill(e.offsetX, e.offsetY, colorPicker.value);
    } else {
        isDrawing = true;
        [lastX, lastY] = [e.offsetX, e.offsetY];
    }
});

canvas.addEventListener('mousemove', draw);

canvas.addEventListener('mouseup', () => {
    isDrawing = false;
    saveState();
});

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (fillBtn.classList.contains('active')) {
        const pos = getTouchPos(e);
        floodFill(pos.x, pos.y, colorPicker.value);
    } else {
        isDrawing = true;
        const pos = getTouchPos(e);
        [lastX, lastY] = [pos.x, pos.y];
    }
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    draw(e);
});

canvas.addEventListener('touchend', () => {
    isDrawing = false;
    saveState();
});

canvas.addEventListener('touchcancel', () => {
    isDrawing = false;
});

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (!e.shiftKey && currentStateIndex > 0) {
            // Undo
            currentStateIndex--;
            const img = new Image();
            img.src = undoStack[currentStateIndex];
            img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
            };
        } else if (e.shiftKey && currentStateIndex < undoStack.length - 1) {
            // Redo
            currentStateIndex++;
            const img = new Image();
            img.src = undoStack[currentStateIndex];
            img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
            };
        }
    }
});

clearBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    saveState();
});

saveBtn.addEventListener('click', () => {
    // Find the bounds of the drawn content
    const bounds = getDrawnContentBounds();
    
    if (bounds) {
        // Create a temporary canvas for the cropped image
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        // Set the temp canvas size to the cropped dimensions
        tempCanvas.width = bounds.width;
        tempCanvas.height = bounds.height;
        
        // Draw the cropped portion
        tempCtx.drawImage(
            canvas,
            bounds.left,
            bounds.top,
            bounds.width,
            bounds.height,
            0,
            0,
            bounds.width,
            bounds.height
        );
        
        // Get the cropped image data
        const dataURL = tempCanvas.toDataURL('image/png');
        
        fetch('/save-drawing', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ image: dataURL })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                window.location.href = '/submit';
            } else {
                alert('Error saving drawing');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Error saving drawing');
        });
    } else {
        alert('No drawing content found!');
    }
});

function getDrawnContentBounds() {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    let left = canvas.width;
    let right = 0;
    let top = canvas.height;
    let bottom = 0;
    let hasContent = false;

    // Scan through all pixels to find the bounds
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const alpha = data[((y * canvas.width + x) * 4) + 3];
            if (alpha > 0) {
                hasContent = true;
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
            }
        }
    }

    // Return null if no content is found
    if (!hasContent) return null;

    // Add a small padding around the content
    const padding = 10;
    left = Math.max(0, left - padding);
    top = Math.max(0, top - padding);
    right = Math.min(canvas.width, right + padding);
    bottom = Math.min(canvas.height, bottom + padding);

    return {
        left,
        top,
        width: right - left,
        height: bottom - top
    };
}

function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth - 20;
    canvas.height = window.innerHeight - 100;
    
    cursorCanvas.width = canvas.width;
    cursorCanvas.height = canvas.height;
    cursorCanvas.style.top = canvas.offsetTop + 'px';
    cursorCanvas.style.left = canvas.offsetLeft + 'px';
    
    if (undoStack.length > 0) {
        const img = new Image();
        img.src = undoStack[currentStateIndex];
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
    }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function floodFill(startX, startY, fillColor) {
    // Check if we're trying to fill an empty canvas
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    
    // Get the color we're filling
    const startPos = (startY * canvas.width + startX) * 4;
    const startR = pixels[startPos];
    const startG = pixels[startPos + 1];
    const startB = pixels[startPos + 2];
    const startA = pixels[startPos + 3];
    
    // If the canvas is empty (all pixels transparent), fill the entire canvas directly
    if (startR === 0 && startG === 0 && startB === 0 && startA === 0) {
        ctx.fillStyle = fillColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        saveState();
        return;
    }
    
    // Convert fill color from hex to RGB
    const fillColorEl = document.createElement('div');
    fillColorEl.style.color = fillColor;
    document.body.appendChild(fillColorEl);
    const computedColor = window.getComputedStyle(fillColorEl).color;
    document.body.removeChild(fillColorEl);
    const [r, g, b] = computedColor.match(/\d+/g).map(Number);
    
    function matchesStart(pos) {
        return pixels[pos] === startR &&
               pixels[pos + 1] === startG &&
               pixels[pos + 2] === startB &&
               pixels[pos + 3] === startA;
    }

    // Use a queue instead of recursion for better performance
    const queue = [];
    queue.push(startX, startY);
    
    while (queue.length > 0) {
        const y = queue.pop();
        const x = queue.pop();
        
        let currentPos = (y * canvas.width + x) * 4;
        
        if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) continue;
        if (!matchesStart(currentPos)) continue;
        
        // Find the leftmost and rightmost pixels to fill on this line
        let left = x;
        let right = x;
        
        // Move left
        while (left > 0 && matchesStart((y * canvas.width + (left - 1)) * 4)) {
            left--;
        }
        
        // Move right
        while (right < canvas.width - 1 && matchesStart((y * canvas.width + (right + 1)) * 4)) {
            right++;
        }
        
        // Fill the line
        for (let i = left; i <= right; i++) {
            currentPos = (y * canvas.width + i) * 4;
            pixels[currentPos] = r;
            pixels[currentPos + 1] = g;
            pixels[currentPos + 2] = b;
            pixels[currentPos + 3] = 255;
        }
        
        // Check pixels above and below the filled line
        for (let i = left; i <= right; i++) {
            if (y > 0 && matchesStart(((y - 1) * canvas.width + i) * 4)) {
                queue.push(i, y - 1);
            }
            if (y < canvas.height - 1 && matchesStart(((y + 1) * canvas.width + i) * 4)) {
                queue.push(i, y + 1);
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);
    saveState();
}

fillBtn.addEventListener('click', () => {
    fillBtn.classList.toggle('active');
});

// Update brush size display
brushSize.addEventListener('input', (e) => {
    brushSizeDisplay.textContent = `${e.target.value}px`;
});

// Update coordinates display and draw cursor
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    coordsDisplay.textContent = `X: ${Math.round(x)}, Y: ${Math.round(y)}`;
    
    // Redraw the canvas and add a circle cursor
    // (Add this part where you handle your canvas drawing)
    ctx.beginPath();
    ctx.arc(x, y, brushSize.value/2, 0, Math.PI * 2);
    ctx.stroke();
    updateBrushPreview(e);
});

// Make sure cursor is hidden when leaving canvas
canvas.addEventListener('mouseleave', () => {
    coordsDisplay.textContent = 'X: 0, Y: 0';
});

function updateBrushPreview(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.save();
    // Clear the previous frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Redraw your saved canvas state here if you have one
    
    // Draw the brush preview circle
    ctx.beginPath();
    ctx.arc(x, y, brushSize/2, 0, Math.PI * 2);
    ctx.strokeStyle = currentColor;
    ctx.stroke();
    ctx.restore();
}

function drawBrushPreview(e) {
    if (isDrawing) return; // Don't show preview while drawing
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left +30;
    const y = e.clientY - rect.top;
    
    // Clear the cursor canvas
    cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
    
    // Draw the brush preview circle on the cursor canvas
    cursorCtx.beginPath();
    cursorCtx.arc(x, y, brushSize.value/2, 0, Math.PI * 2);
    cursorCtx.strokeStyle = colorPicker.value;
    cursorCtx.stroke();
}

canvas.addEventListener('mousemove', drawBrushPreview);
