# Invoice Tracker Dashboard for JOJO

A premium, full-stack monorepo application designed to manage, track, and parse invoices for JOJO. It features automated PDF data extraction (with OCR support), Google Gmail API integration for fetching and notifying invoices, role-based dashboards (Admin, Employee), and a MongoDB database for persistence.

---

## 🚀 Tech Stack

### Frontend
* **Framework:** [Next.js](https://nextjs.org/) (React, TypeScript, App Router)
* **Styling:** [Tailwind CSS](https://tailwindcss.com/) & [shadcn/ui](https://ui.shadcn.com/)
* **State & Data Fetching:** Redux Toolkit / RTK Query

### Backend
* **API Framework:** [FastAPI](https://fastapi.tiangolo.com/) (Python 3.10+)
* **Database:** [MongoDB](https://www.mongodb.com/) (Async integration via `motor`)
* **PDF Processing:** `pdfplumber`, `PyMuPDF`, `pytesseract` (for scanned PDF OCR)
* **Authentication:** JWT (JSON Web Tokens)
* **Job Scheduler:** `APScheduler` (for daily automated reports/reminders)
* **Integrations:** Google Gmail API OAuth 2.0 (for automated invoice notification retrieval)

---

## 📂 Project Structure

```
Invoice-Tracker-Dashboard-for-JOJO/
├── backend/                  # FastAPI Backend
│   ├── app/                  # Application Core
│   │   ├── auth/             # JWT & Authentication Middleware
│   │   ├── models/           # Pydantic schemas/models
│   │   ├── routers/          # API Route Controllers (Auth, Invoices, Upload, etc.)
│   │   └── services/         # Business Logic (Gmail OAuth, OCR PDF Parsing, email alerts)
│   ├── scripts/              # DB Seeding & Gmail OAuth setup scripts
│   ├── .env.example          # Template for backend environment variables
│   ├── requirements.txt      # Python dependencies
│   └── BACKEND_TEST_PLAN.md  # Backend testing plan and API details
├── frontend/                 # Next.js Frontend
│   ├── public/               # Static assets
│   ├── src/
│   │   ├── app/              # Next.js Page views (dashboard, upload, invoices, login, etc.)
│   │   ├── components/       # Custom React UI components (shadcn/ui base)
│   │   └── lib/              # Redux, Supabase client config, utilities, API hooks
│   ├── .env.local.example    # Template for frontend environment variables
│   └── package.json          # Node dependencies & scripts
├── scripts/                  # Powershell setup/start helpers
│   ├── free-port-8000.ps1    # Utility to free local ports
│   ├── start-backend.ps1     # Script to launch the backend local server
│   └── start-frontend.ps1    # Script to launch the frontend dev server
└── supabase/                 # Supabase configuration or schemas
```

---

## 🛠️ Prerequisites

Make sure you have the following installed on your machine:
* **Node.js** (v18 or higher)
* **Python** (v3.10 or higher)
* **MongoDB** (running locally on port `27017` or a remote Atlas connection string)
* **Tesseract OCR** (Required only if parsing image-based or scanned PDFs)
  * *Windows:* Install [Tesseract for Windows](https://github.com/UB-Mannheim/tesseract/wiki) and add it to your system PATH.

---

## 🚦 Getting Started

### 1. Set Up the Backend
1. Open a terminal in the `backend/` directory.
2. Create a virtual environment and activate it:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Copy `.env.example` to `.env` and fill in your local settings (e.g. MongoDB URIs, JWT Secret).
5. (Optional) Run the Gmail API setup script if using mail scraping:
   ```bash
   python -m scripts.gmail_oauth_setup
   ```

### 2. Set Up the Frontend
1. Open a terminal in the `frontend/` directory.
2. Install npm dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.local.example` to `.env.local` and add the backend API URL.

---

## 🏃 Running the Application

For a quick setup, you can use the Powershell helper scripts inside the `scripts/` directory:

### Run Backend
From the project root directory, run:
```powershell
.\scripts\start-backend.ps1
```
The API docs will be available at [http://localhost:8000/docs](http://localhost:8000/docs).

### Run Frontend
From the project root directory, run:
```powershell
.\scripts\start-frontend.ps1
```
Open [http://localhost:3000](http://localhost:3000) to view the client-side application.

---

## 🗃️ Seeding and Scripts
The backend contains several automation scripts that can be run from the `backend` folder:
* **Seed Database:** `python -m scripts.seed_mongo` (Populate initial Mock data for vendors and companies)
* **Reset Invoices:** `python -m app.scripts.reset_and_seed_invoices` (Clears current invoices and re-inserts sample data)
* **Gmail OAuth setup:** `python -m scripts.gmail_oauth_setup` (Configure OAuth redirect token workflow to fetch notifications from Gmail)
