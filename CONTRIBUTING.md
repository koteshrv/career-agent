# Contributing to Job Tracker Pro

First off, thank you for considering contributing to Job Tracker Pro! It's people like you that make open source such a fantastic community.

## Where to Start

- **Bug Reports:** If you find a bug, please open an issue and include as much detail as possible (steps to reproduce, environment, and error logs).
- **Feature Requests:** Have a great idea for a new feature? Open an issue tagged as `enhancement` and describe what you'd like to see!
- **Pull Requests:** If you want to contribute code, we recommend opening an issue first to discuss the changes you plan to make. 

## Development Setup

The project is split into a **FastAPI backend** and a **Vite + React frontend**.

### Running the Backend
1. `cd` into the project root.
2. Create a virtual environment: `python -m venv venv`
3. Activate it: `source venv/bin/activate`
4. Install dependencies: `pip install -r requirements.txt`
5. Start the server: `python -m uvicorn backend.main:app --reload`

### Running the Frontend
1. `cd frontend`
2. Install dependencies: `npm install`
3. Start the dev server: `npm run dev`

Alternatively, you can just run `./start.sh` from the root directory to spin up both!

## Pull Request Process
1. Fork the repo and create your branch from `main`.
2. Make sure your code lints and builds successfully.
3. If you've changed any APIs, please update the relevant documentation.
4. Issue that pull request!

## Code of Conduct
Please be respectful and constructive when interacting with the community. Harassment or abusive behavior will not be tolerated.
