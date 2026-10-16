

import os
import io
import base64
import json
import time
import hashlib
import datetime
import sys
parent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__),'..', '..'))
sys.path.append(parent_dir)

test_model = None
MODEL_IMPORT_ERROR = None

from functools import wraps

from flask import (
    Flask, request, jsonify, render_template,
    session, send_from_directory
)
from flask_cors import CORS

# ── Optional heavy imports (install as needed) ──────────────────
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

# ── App setup ───────────────────────────────────────────────────
app = Flask(__name__, template_folder='templates', static_folder='static')
app.secret_key = os.environ.get('SECRET_KEY', 'signbridge-secret-key-change-in-production')
CORS(app, supports_credentials=True)

IS_VERCEL = os.environ.get('VERCEL') == '1'
DATA_DIR = os.environ.get('DATA_DIR') or (
    os.path.join(os.environ.get('TMPDIR', '/tmp'), 'signbridge')
    if IS_VERCEL else os.path.dirname(__file__)
)
os.makedirs(DATA_DIR, exist_ok=True)

UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', os.path.join(DATA_DIR, 'uploads'))
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['MAX_CONTENT_LENGTH'] = 4 * 1024 * 1024 if IS_VERCEL else 200 * 1024 * 1024

# ── Simple in-memory user store (replace with a real DB) ────────
USERS_FILE = os.path.join(DATA_DIR, 'users.json')
HISTORY_FILE = os.path.join(DATA_DIR, 'history.json')

def load_json(path, default):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return default

def save_json(path, data):
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

users_db = load_json(USERS_FILE, {})
history_db = load_json(HISTORY_FILE, {})

def hash_password(pw):
    return hashlib.sha256(pw.encode()).hexdigest()


# ── Auth helpers ────────────────────────────────────────────────
def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_email' not in session:
            return jsonify({'error': 'Not authenticated'}), 401
        return f(*args, **kwargs)
    return decorated


# ════════════════════════════════════════════════════════════════
#  YOUR MODEL INTEGRATION — edit this function
# ════════════════════════════════════════════════════════════════
def run_sign_model(frame_array, sign_language: str = 'ASL') -> dict:
    global test_model, MODEL_IMPORT_ERROR
    if MODEL_IMPORT_ERROR:
        raise ModelUnavailableError(MODEL_IMPORT_ERROR)
    if test_model is None:
        try:
            import importlib
            test_model = importlib.import_module('test_model')
        except Exception as e:
            MODEL_IMPORT_ERROR = str(e)
            raise ModelUnavailableError(MODEL_IMPORT_ERROR) from e
    result = test_model.predict_sign(frame_array)

    return result


class ModelUnavailableError(RuntimeError):
    pass


def decode_frame(b64_string: str):
    """Decode base64 JPEG/PNG string to numpy array (if available)."""
    header, data = b64_string.split(',', 1) if ',' in b64_string else ('', b64_string)
    img_bytes = base64.b64decode(data)
    if HAS_PIL and HAS_NUMPY:
        img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
        arr = np.array(img)
        if HAS_CV2:
            arr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
        return arr
    return img_bytes  # return raw bytes if PIL/numpy unavailable




def translate_text(text: str, from_lang: str, to_lang: str) -> str:
    """
    Replace with real translation API:
    e.g. Google Translate, DeepL, Helsinki-NLP/opus-mt models.
    """
    # key = (from_lang, to_lang)
    # mapping = DEMO_TRANSLATIONS.get(key, {})
    # if text in mapping:
    #     return mapping[text]
    # lang_labels = {'hi': 'हिन्दी', 'es': 'Español', 'fr': 'Français',
    #                'de': 'Deutsch', 'ar': 'عربي', 'ja': '日本語', 'mr': 'मराठी'}
    # label = lang_labels.get(to_lang, to_lang.upper())
    # return f'[{label}] {text}'



@app.route('/')
def index():
    return render_template('index.html')


# ── Auth ─────────────────────────────────────────────────────────
@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    if not name or not email or not password:
        return jsonify({'error': 'All fields required'}), 400
    if email in users_db:
        return jsonify({'error': 'Email already registered'}), 409
    users_db[email] = {
        'name': name,
        'email': email,
        'password': hash_password(password),
        'plan': 'Free',
        'created': datetime.datetime.utcnow().isoformat()
    }
    save_json(USERS_FILE, users_db)
    session['user_email'] = email
    user = {k: v for k, v in users_db[email].items() if k != 'password'}
    return jsonify({'user': user}), 201


@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    user = users_db.get(email)
    if not user or user['password'] != hash_password(password):
        return jsonify({'error': 'Invalid email or password'}), 401
    session['user_email'] = email
    safe = {k: v for k, v in user.items() if k != 'password'}
    return jsonify({'user': safe})


@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logged out'})


# ── Conversion ───────────────────────────────────────────────────
@app.route('/api/convert', methods=['POST'])
def convert_frame():
    """Accept a base64 video frame and return recognized text."""
    data = request.get_json()
    frame_b64 = data.get('frame', '')
    sign_language = data.get('sign_language', 'ASL')

    if not frame_b64:
        return jsonify({'error': 'No frame provided'}), 400

    t0 = time.time()
    try:
        frame = decode_frame(frame_b64)
        result = run_sign_model(frame, sign_language)
    except ModelUnavailableError as e:
        return jsonify({'error': f'Sign recognition is unavailable: {e}'}), 503
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    result['latency'] = round(time.time() - t0, 3)
    return jsonify(result)


@app.route('/api/convert_video', methods=['POST'])
def convert_video():
    """Accept a full video file and return recognized text."""
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400

    video_file = request.files['video']
    sign_language = request.form.get('sign_language', 'ASL')
    filename = f"{int(time.time())}_{video_file.filename}"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    video_file.save(filepath)

    # ── Integrate your video processing here ──────────────────
    # Example with OpenCV:
    #   cap = cv2.VideoCapture(filepath)
    #   results = []
    #   while cap.isOpened():
    #       ret, frame = cap.read()
    #       if not ret: break
    #       results.append(run_sign_model(frame, sign_language))
    #   cap.release()
    #   text = ' '.join(r['text'] for r in results if r['text'])
    # ──────────────────────────────────────────────────────────
    result = run_sign_model(None, sign_language)
    result['filename'] = filename

    # Clean up
    try:
        os.remove(filepath)
    except Exception:
        pass

    return jsonify(result)


# ── Translation ──────────────────────────────────────────────────
@app.route('/api/translate', methods=['POST'])
def translate():
    data = request.get_json()
    text = data.get('text', '').strip()
    from_lang = data.get('from_lang', 'en')
    to_lang = data.get('to_lang', 'hi')
    if not text:
        return jsonify({'error': 'No text provided'}), 400
    translated = translate_text(text, from_lang, to_lang)
    return jsonify({'translated': translated, 'from': from_lang, 'to': to_lang})


# ── History ──────────────────────────────────────────────────────
@app.route('/api/history', methods=['GET'])
@require_auth
def get_history():
    email = session['user_email']
    return jsonify({'history': history_db.get(email, [])})


@app.route('/api/history', methods=['POST'])
@require_auth
def save_history():
    email = session['user_email']
    entry = request.get_json()
    entry['id'] = int(time.time() * 1000)
    entry['time'] = datetime.datetime.utcnow().isoformat()
    if email not in history_db:
        history_db[email] = []
    history_db[email].insert(0, entry)
    history_db[email] = history_db[email][:200]  # keep last 200
    save_json(HISTORY_FILE, history_db)
    return jsonify({'entry': entry}), 201


@app.route('/api/history/<int:entry_id>', methods=['DELETE'])
@require_auth
def delete_history(entry_id):
    email = session['user_email']
    history_db[email] = [h for h in history_db.get(email, []) if h.get('id') != entry_id]
    save_json(HISTORY_FILE, history_db)
    return jsonify({'deleted': entry_id})


# ── Health check ─────────────────────────────────────────────────
@app.route('/api/health')
def health():
    return jsonify({
        'status': 'ok',
        'numpy': HAS_NUMPY,
        'pillow': HAS_PIL,
        'opencv': HAS_CV2,
        'time': datetime.datetime.utcnow().isoformat()
    })


# ════════════════════════════════════════════════════════════════
#  Entry point
# ════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'true').lower() == 'true'
    print(f"\n🤟  SignBridge server starting on http://localhost:{port}")
    print(f"   NumPy: {HAS_NUMPY} | Pillow: {HAS_PIL} | OpenCV: {HAS_CV2}\n")
    app.run(host='0.0.0.0', port=port, debug=debug)
