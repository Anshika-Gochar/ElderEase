# ElderEase — AI-Powered Elderly Care Platform 🌿

ElderEase is a comprehensive, remote care platform designed to support independent elderly living while providing peace of mind to their caregivers. The platform combines proactive daily reminders, structured task management, and one-tap SOS emergency broadcasts with a warm, conversational AI companion ("Saathi") that monitors mental well-being in real-time. By bridging the gap between clinical data and emotional support, ElderEase empowers elders to live safely at home and helps caregivers detect behavior changes, low mood, or medical anomalies before they become critical.

---

## Live Demo

| App | URL | Credentials |
| :--- | :--- | :--- |
| **Elder Companion App** | `https://elderease-elder.vercel.app` | **Email**: `elder@demo.local`<br>**Password**: `DemoPass123!` |
| **Caregiver Dashboard** | `https://elderease-caregiver.vercel.app` | **Email**: `caregiver@demo.local`<br>**Password**: `DemoPass123!` |

*Note: These are pre-seeded demo accounts. You may also register new accounts and link them via email on the Caregiver platform.*

---

## Architecture

ElderEase is built on a decoupled, 4-service monorepo architecture:

```
                                  +─────────────+
                                  |  Gemini API |
                                  +──────▲──────+
                                         | HTTP
+────────────────+  HTTP / WSS    +──────┴──────+  HTTP  +─────────────+
|  client-elder  | ─────────────> |   backend   | ─────> |  ai-service |
+────────────────+                +──────┬──────+        +─────────────+
                                         | Mongoose
+────────────────+  HTTP / WSS           |               +─────────────+
|client-caregiver| ──────────────────────┼─────────────> | MongoDB     |
+────────────────+                       |               | Atlas       |
                                         |               +─────────────+
                                         | SDKs / API
                                         v
                      +──────────────────────────────────────+
                      | Twilio SMS / SendGrid / Firebase FCM |
                      +──────────────────────────────────────+
```

### Flow Map:
1. **client-elder** (React): Front-end for the elderly user. Connects to the Node `backend` via REST APIs and WebSockets (Socket.io) for real-time notifications. Directs Saathi chat requests through backend proxy.
2. **client-caregiver** (React): Dashboard for the caregiver. Connects to `backend` for dashboard stats and consumes real-time notifications (SOS, med logs, task completions) via WebSockets.
3. **backend** (Node.js + Express): Main REST API and WebSocket controller. Persists core app models in MongoDB, coordinates cron reminder jobs, dispatches SMS via Twilio, emails via SendGrid, push notifications via Firebase, and proxies AI requests.
4. **ai-service** (Python FastAPI): Microservice wrapping NLP and ML tasks. Leverages the Gemini API for conversational memory and responses, Vader NLP for chat sentiment tracking, and Scikit-Learn IsolationForest for behavior anomaly detection.

---

## Features

### For Elders
* **Saathi AI Companion**: Chat interface with a warm, simple, elder-friendly helper that remembers context and logs daily sentiment scores.
* **Medication Adherence**: Today's medication checklist with notifications and a one-tap confirmation when doses are taken.
* **Routine Daily Tasks**: Streak tracking and routines to encourage activity, task completion, and cognitive exercise.
* **SOS Broadcast**: A prominent emergency button that instantly alerts all linked caregivers via SMS, push notifications, and email.
* **Mood History**: View simple 7-day and 30-day sentiment charts summarizing daily chats with Saathi.

### For Caregivers
* **Live Activity Feed**: WebSocket-driven feed displaying real-time events (taken medications, missed doses, task completion, and mood updates).
* **Comprehensive Stats**: At-a-glance view of daily task completion rates, medication compliance percentages, and active alerts.
* **Mood Trend Visualization**: Recharts area chart showing 7-day rolling sentiment averages to monitor signs of depression or loneliness.
* **AI Daily Digest**: Proactive, LLM-generated summaries compiling the elder's chats and overall wellness trends.
* **Medication Compliance Chart**: 14-day history chart displaying adherence per medication.
* **Real-time Anomaly Flags**: Automated alerts flagged by Python's IsolationForest detector mapping behavior drift (e.g., severe social withdrawal, sudden skipped doses).

---

## Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React 18 / Redux Toolkit | Client-side reactive UI rendering and state management |
| **Frontend build** | Vite 5 | Fast local compilation and client asset optimization |
| **Backend API** | Node.js 20 / Express 4 | Core application REST endpoints, middleware, and business logic |
| **Real-time communication** | Socket.io 4 | Bi-directional, real-time message broadcasting and rooms |
| **Scheduler** | Node-cron 3 | Triggers medication dose checks and anomaly checks daily |
| **AI Microservice** | FastAPI 0.109 | Python REST API hosting lightweight, fast NLP and ML inference endpoints |
| **AI LLM Engine** | Google Gemini API (2.5-flash) | Generates warm conversational companion chat and caregiver daily digests |
| **Data Layer** | MongoDB 7 / Mongoose 8 | Multi-document transactional primary database (Atlas cloud deployment) |
| **Notifications** | Twilio SMS / SendGrid / Firebase FCM | Handles text broadcasts, email alerts, and device push notifications |
| **Containerization** | Docker / Docker Compose | Local testing containers with cross-service Alpine/Slim builds |

---

## Getting Started

### Prerequisites
* **Node.js** v20.x or higher
* **Python** v3.11.x or higher
* **Docker & Docker Compose** (Only required if running the full stack containerized locally)

### Installation

#### 1. Clone the repository
```bash
git clone https://github.com/your-org/elderease.git
cd elderease
```

#### 2. Copy and configure Environment Variables
You must set up `.env` files for each component folder. Use the templates provided:

```bash
# Root environment (used for Docker build args)
cp .env.example .env

# Backend Express service
cp backend/.env.example backend/.env

# AI Python service
cp ai-service/.env.example ai-service/.env

# Client Elder application
cp apps/client-elder/.env.example apps/client-elder/.env

# Client Caregiver application
cp apps/client-caregiver/.env.example apps/client-caregiver/.env
```

Ensure you configure the API keys:
* Get a **Gemini API Key** from [Google AI Studio](https://aistudio.google.com/).
* Get **Twilio credentials** from [Twilio Console](https://www.twilio.com/).
* Get **SendGrid API Key** from [SendGrid Dashboard](https://sendgrid.com/).
* Download your **Firebase Service Account JSON** from Firebase Console -> Project Settings -> Service Accounts, and format the private key in `backend/.env`.

#### 3. Install dependencies and start services locally

* **Express Backend Node service**:
  ```bash
  cd backend
  npm install
  npm run dev
  ```
  *(Runs on port 5000)*

* **Python AI service**:
  ```bash
  cd ai-service
  python -m venv venv
  source venv/bin/activate  # venv\Scripts\activate on Windows
  pip install -r requirements.txt
  uvicorn main:app --reload --port 8000
  ```
  *(Runs on port 8000)*

* **Elder Client App**:
  ```bash
  cd apps/client-elder
  npm install
  npm run dev
  ```
  *(Runs on port 5173)*

* **Caregiver Client App**:
  ```bash
  cd apps/client-caregiver
  npm install
  npm run dev
  ```
  *(Runs on port 5174)*

#### 4. Seed Demo Accounts
To populate your local database with default users, medications, tasks, and historical logs:
```bash
cd backend
npm run seed  # Command to trigger seed script
```

---

## Environment Variables

### Root Service Build Variables (docker-compose)
| Variable | Service | Required | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Global | No | Running environment (`development` or `production`) |
| `VITE_API_URL` | client-elder/caregiver | Yes | Compiled REST API address of backend |
| `VITE_SOCKET_URL` | client-elder/caregiver | Yes | WebSockets server address of backend |
| `VITE_FIREBASE_API_KEY` | client-elder/caregiver | Yes | Firebase web configuration API Key |

### Express Backend Service Variables (`backend/.env`)
| Variable | Required | Description |
| :--- | :--- | :--- |
| `PORT` | No | Port backend runs on (defaults to 5000) |
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `JWT_SECRET` | Yes | Secret string used to sign user JWT authorization tokens |
| `FIREBASE_PRIVATE_KEY` | Yes | Private key string extracted from service account JSON |
| `TWILIO_ACCOUNT_SID` | Yes | Twilio account identifier for SMS dispatch |
| `SENDGRID_API_KEY` | Yes | SendGrid platform authentication key |
| `AI_SERVICE_URL` | Yes | FastAPI address (used for forwarding chat & anomaly checks) |

### AI Microservice Variables (`ai-service/.env`)
| Variable | Required | Description |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Yes (otherwise Stubs) | Google AI Studio API key for model connection |
| `GEMINI_MODEL` | No | Model name (e.g. `gemini-2.5-flash`) |
| `MONGODB_URI` | Yes | MongoDB connection string (pointing to same DB) |
| `PORT` | No | Port FastAPI listens on (defaults to 8000) |
| `STUB_MODE` | No | If `true`, Gemini requests default to static responses |

---

## Project Structure

```
ElderEase/
├── apps/
│   ├── client-elder/           # Elder portal React application
│   │   ├── src/                # Components, slices, state hooks
│   │   └── Dockerfile          # Nginx static server build configuration
│   └── client-caregiver/       # Caregiver panel React application
│       ├── src/                # Stats, charts, socket hooks
│       └── Dockerfile          # Nginx static server build configuration
├── backend/                    # Express REST backend
│   ├── src/
│   │   ├── config/             # DB, Redis, and env validation setups
│   │   ├── routes/             # Authentication, dashboards, medications
│   │   └── sockets/            # Socket.io room joins & event emitters
│   └── Dockerfile              # Node production build configuration
├── ai-service/                 # FastAPI Python service
│   ├── app/
│   │   ├── routers/            # Chat proxy, mood trackers, and detectors
│   │   └── services/           # Gemini and IsolationForest engines
│   └── Dockerfile              # Python production build configuration
├── docker-compose.yml          # Container configuration for full-stack local builds
├── .env.example                # Root environment placeholder
└── README.md                   # This project manual
```

---

## Development Phases

| Phase | Description | Status |
| :--- | :--- | :--- |
| **Phase 1** | Foundation Monorepo: auth, base layout, and initial roles | **Complete** |
| **Phase 2** | Medication Reminders: scheduler, timeline grid, Twilio/SendGrid stubs | **Complete** |
| **Phase 3** | AI Companion (Saathi): chat routing, session history, Gemini wrapper | **Complete** |
| **Phase 4** | Mood & Anomalies: VADER scoring, IsolationForest rule checks | **Complete** |
| **Phase 5** | Caregiver Dashboard: WebSocket feed, Recharts area trends, digests | **Complete** |
| **Phase 6** | Polish & Deploy: Docker configurations, env validations, Vercel/Railway | **Complete** |

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
