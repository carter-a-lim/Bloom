# 🌸 Bloom

**One prompt. Full technical blueprint.**

Describe any app and Bloom instantly generates a complete, production-ready architecture on an infinite canvas — broken down into layers, functional groups, and concrete implementation tasks.

## What It Does

Type something like `"create youtube"` or `"create discord"` and Bloom:

1. Identifies the MVP feature scope (no bloat, no missing pieces)
2. Picks the right tech stack for the project
3. Decomposes it into Frontend and Backend layers
4. Breaks each layer into functional groups and concrete implementation tasks
5. Streams the full tree live onto an interactive canvas

## Example Output

For `"create youtube"`:
```
Frontend (React)
├── Video Upload
│   ├── React Dropzone component
│   ├── Upload progress bar
│   └── Video upload API request
├── Video Playback
│   ├── HLS.js player component
│   └── Video playback controls
├── Search
│   ├── Search bar component
│   └── Search results page
└── ...

Backend (Node.js + Express + PostgreSQL)
├── Authentication
│   ├── bcrypt password hash
│   ├── JWT refresh token
│   └── OAuth 2.0 integration
├── Video Management
│   ├── S3 multipart upload
│   ├── HLS transcoding job
│   └── Video metadata storage
└── ...
```

## Setup

**Prerequisites:** Node.js, Python 3.10+, a [Groq API key](https://console.groq.com) (free)

```bash
git clone https://github.com/your-org/bloom.git
cd bloom
cp .env.example .env
# Add your GROQ_API_KEY to .env
```

**Install dependencies:**
```bash
npm install
cd services/atomizer && pip install -r requirements.txt
```

**Start services:**
```bash
# Terminal 1 — Atomizer (AI decomposition engine)
cd services/atomizer && uvicorn main:app --port 8000

# Terminal 2 — Frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Stack

| Service | Tech | Port |
|---------|------|------|
| Canvas UI | Next.js + React Flow | 3000 |
| Atomizer | FastAPI + LiteLLM | 8000 |

## Models

Bloom uses [Groq](https://console.groq.com) for fast, free inference:
- **Llama 3.3 70B** — best quality (default)
- **Llama 3.1 8B** — fastest
- **Mixtral 8x7B** — alternative

## .env

```env
GROQ_API_KEY=gsk_...
GROQ_MODEL=groq/llama-3.3-70b-versatile  # optional override
```
