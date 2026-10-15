SET LOC=d:/Projects/Python/Ai PDA QA chatbot
CD /D %LOC%
CALL .\venv\Scripts\python.exe -m uvicorn backend.main:app --port 8000