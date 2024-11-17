from flask import Flask, request, send_file, jsonify, render_template
import os
from flask import Response
import time
import sqlite3
from werkzeug.utils import secure_filename

app = Flask(__name__)

# Add this function near the top of the file with other helper functions
def allowed_file(filename):
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Serve static files
@app.route('/')
@app.route('/home')
def index():
    return render_template('index.html')

@app.route('/submit')
def submit():
    return render_template('submit.html')

@app.route('/heartbeat')
def heartbeat():
    return jsonify({'status': 'ok'})

@app.route('/dashboard')
def dashboard():
    with sqlite3.connect('partyboard.db') as conn:
        c = conn.cursor()
        c.execute('SELECT * FROM drawings WHERE blacklisted = FALSE')
        drawings = c.fetchall()
    return render_template('dashboard.html', drawings=drawings)

@app.route('/blacklist', methods=['POST'])
def blacklist():
    data = request.get_json()
    print(data)
    id = data['id']
    with sqlite3.connect('partyboard.db') as conn:
        c = conn.cursor()
        c.execute('UPDATE drawings SET blacklisted = TRUE WHERE id = ?', (id,))
        conn.commit()
    return jsonify({'success': True})

@app.route('/canvas')
def canvas():
    return render_template('canvas.html')

@app.route('/gallery')
def gallery():
    return render_template('gallery.html')

@app.route('/<path:path>')
def static_files(path):
    return send_file(path)

# Add these new routes for CSS and JavaScript files
@app.route('/css/<path:path>')
def serve_css(path):
    return send_file(os.path.join('static', 'css', path))

@app.route('/js/<path:path>')
def serve_js(path):
    return send_file(os.path.join('static', 'js', path))

@app.route('/image_ids')
def image_ids():
    with sqlite3.connect('partyboard.db') as conn:
        c = conn.cursor()
        c.execute('SELECT path FROM drawings WHERE blacklisted = FALSE')
        drawings = c.fetchall()
        print(drawings)
        # Extract paths from tuples
        drawings_list = [drawing[0] for drawing in drawings]

    return jsonify(drawings_list)

@app.route('/image_ids_blacklisted')
def image_ids_blacklisted():
    with sqlite3.connect('partyboard.db') as conn:
        c = conn.cursor()
        c.execute('SELECT path FROM drawings WHERE blacklisted = TRUE')
        drawings = c.fetchall()
        print(drawings)
        # Extract paths from tuples
        drawings_list = [drawing[0] for drawing in drawings]

    return jsonify(drawings_list)

@app.route('/background')
def background():
    # images = os.listdir(os.path.join('static', 'background'))
    images = []
    # Get background images from database
    with sqlite3.connect('partyboard.db') as conn:
        c = conn.cursor()
        c.execute('SELECT path FROM background_images')
        db_images = c.fetchall()
        # Extract paths from tuples and combine with directory listing
        images = list(set([img[0] for img in db_images] + images))
    return render_template('background.html', images=images)

@app.route('/background/upload', methods=['POST'])
def upload_background():
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No file part'}), 400
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400
            
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            
            # Ensure directory exists
            upload_dir = os.path.join('static', 'background')
            os.makedirs(upload_dir, exist_ok=True)
            
            # Save file
            file_path = os.path.join(upload_dir, filename)
            file.save(file_path)
            
            # Store in SQLite database
            with sqlite3.connect('partyboard.db') as conn:
                c = conn.cursor()
                c.execute('INSERT INTO background_images (path) VALUES (?)', (filename,))
                conn.commit()
                
            return jsonify({'success': True, 'filename': filename})
            
        return jsonify({'error': 'Invalid file type'}), 400
        
    except Exception as e:
        # Log the error (you might want to use proper logging)
        print(f"Error in upload_background: {str(e)}")
        return jsonify({'error': 'Server error occurred'}), 500

# Initialize SQLite database
def init_db():
    with sqlite3.connect('partyboard.db') as conn:
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS background
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  path TEXT NOT NULL,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        c.execute('''CREATE TABLE IF NOT EXISTS drawings
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  path TEXT NOT NULL,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  blacklisted BOOLEAN DEFAULT FALSE)''')
        c.execute('''CREATE TABLE IF NOT EXISTS background_images
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  path TEXT NOT NULL,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        conn.commit()

# Initialize the database when the module loads
init_db()

@app.route('/background', methods=['POST'])
def update_background():
    data = request.get_json()
    background = data['background']
    
    # Store in SQLite database
    conn = sqlite3.connect('partyboard.db')
    c = conn.cursor()
    c.execute('INSERT INTO background (path) VALUES (?)', (background,))
    conn.commit()
    conn.close()

    return jsonify(background)

@app.route('/background_path')
def background_path():
    def generate():
        while True:
            conn = sqlite3.connect('partyboard.db')
            c = conn.cursor()
            c.execute('SELECT path FROM background ORDER BY created_at DESC LIMIT 1')
            result = c.fetchone()
            conn.close()

            if result:
                background = result[0]
                global current_background
                current_background = os.path.join('static', 'background', background)
            yield f"data: {current_background}\n\n"
            # Add a small delay to prevent overwhelming the connection
            time.sleep(0.5)

    return Response(generate(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    })
    

# Handle drawing save
@app.route('/save-drawing', methods=['POST'])
def save_drawing():
    try:
        data = request.get_json()
        image_data = data['image'].split(',')[1]  # Remove the data URL prefix
        import base64
        import time
        
        # Create assets/drawings directory if it doesn't exist
        os.makedirs('assets/drawings', exist_ok=True)
        
        # Generate unique filename using timestamp
        filename = f"drawing_{int(time.time())}.png"
        filepath = os.path.join('assets/drawings', filename)
        
        # Decode and save the image
        with open(filepath, 'wb') as f:
            f.write(base64.b64decode(image_data))
        
        # Store in SQLite database
        conn = sqlite3.connect('partyboard.db')
        c = conn.cursor()
        c.execute('INSERT INTO drawings (path, blacklisted) VALUES (?, FALSE)', (filepath,))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
