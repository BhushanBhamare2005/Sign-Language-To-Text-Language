# 🤟 SignBridge — Sign Language to Text Web Platform

A full-stack web platform for real-time sign language recognition with translation, history, and user accounts.

---

## 📁 Project Structure

```
signbridge/
├── app.py                  # Flask backend (API + server)
├── requirements.txt        # Python dependencies
├── Procfile                # For Render / Heroku deployment
├── Dockerfile              # Docker container
├── docker-compose.yml      # Docker Compose
├── templates/
│   └── index.html          # Main HTML (single-page app)
└── static/
    ├── css/
    │   └── style.css       # All styles
    └── js/
        └── app.js          # All frontend JavaScript
```

---

## 🚀 Local Setup

### 1. Clone / copy the project
```bash
cd signbridge
```

### 2. Create virtual environment
```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Run the server
```bash
python app.py
```

Open **http://localhost:5000** in your browser.

---

## 🧠 Connect Your Sign Language Model

Edit the `run_sign_model()` function in `app.py`:

```python
def run_sign_model(frame_array, sign_language: str = 'ASL') -> dict:
    # Your model inference here
    # frame_array is a numpy BGR image array
    
    # Example with MediaPipe:
    import mediapipe as mp
    mp_hands = mp.solutions.hands
    with mp_hands.Hands(static_image_mode=True) as hands:
        results = hands.process(cv2.cvtColor(frame_array, cv2.COLOR_BGR2RGB))
        if results.multi_hand_landmarks:
            # Pass landmarks to your classifier
            label, conf = your_classifier.predict(landmarks)
            return {'text': label, 'confidence': float(conf), 'signs': [label]}
    return {'text': '', 'confidence': 0.0, 'signs': []}
```

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/register` | Register new user |
| POST | `/api/login` | Login |
| POST | `/api/logout` | Logout |
| POST | `/api/convert` | Convert base64 frame → text |
| POST | `/api/convert_video` | Upload video → text |
| POST | `/api/translate` | Translate text |
| GET | `/api/history` | Get user history |
| POST | `/api/history` | Save history entry |
| DELETE | `/api/history/<id>` | Delete history entry |
| GET | `/api/health` | Health check |

---

## 🐳 Docker Deployment

```bash
docker-compose up --build
```

---

## ☁️ Deploy to Render (Free)

1. Push code to GitHub
2. Go to https://render.com → New Web Service
3. Connect your repo
4. Build command: `pip install -r requirements.txt`
5. Start command: `gunicorn app:app --bind 0.0.0.0:$PORT`
6. Done! Your app is live.

---

## ☁️ Deploy to Heroku

```bash
heroku create signbridge-app
git push heroku main
heroku open
```

---

## ✨ Features

- 🎥 **Live Camera** — real-time frame capture and sign detection
- 📤 **Video Upload** — process pre-recorded videos
- 🌍 **Translation** — translate output to Hindi, Spanish, French, Marathi, and more
- 📜 **History** — auto-saves all conversions with search & filter
- 📊 **Analytics** — session stats, charts, accuracy tracking
- 📖 **Sign Dictionary** — browse ASL, BSL, ISL signs
- 👤 **Accounts** — register, login, profile management
- ⚙️ **Settings** — configure auto-translate, TTS, thresholds

---

## 🔧 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | `signbridge-secret` | Flask session secret |
| `PORT` | `5000` | Server port |
| `FLASK_DEBUG` | `true` | Enable debug mode |
