# ManaMap: Telangana Procurement Intelligence Platform

ManaMap is a map-first procurement intelligence and infrastructure tracking platform for Telangana State. It automatically ingests, scrapes, parses, and maps municipal infrastructure projects, road works, and tenders.

## 🏗️ Architecture

- **Backend**: FastAPI (Python), Playwright, SQLAlchemy, WebSockets, PostgreSQL/SQLite.
- **Frontend**: React (TypeScript), Vite, Tailwind CSS, Leaflet/Mapbox.

## 🚀 Running Locally

### Prerequisites

- Node.js (v18+)
- Python (3.10+)
- pnpm (recommended)

### 1. Backend Setup

1. Navigate to the backend directory and install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Setup Playwright browsers:
   ```bash
   playwright install chromium
   ```
3. Initialize the database and launch the FastAPI server:
   ```bash
   python backend/main.py
   ```
   The API documentation will be available at `http://localhost:8000/docs`.

### 2. Frontend Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Run the Vite development server:
   ```bash
   pnpm dev
   ```
   Open `http://localhost:5173` in your browser.
