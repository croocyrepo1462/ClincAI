"""
Quick connectivity test for ClinAI API keys and optional services.
Usage: python scripts/test_keys.py
Reads from ClinAI/api/.env
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / "ClinAI" / "api" / ".env"


def load_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        print("FAIL  python-dotenv not installed. Run: pip install python-dotenv requests")
        sys.exit(1)
    if not ENV_PATH.exists():
        print(f"FAIL  No .env file at {ENV_PATH}")
        print("      Copy .env.example to ClinAI/api/.env and add your keys.")
        sys.exit(1)
    load_dotenv(ENV_PATH)


def ok(label: str, detail: str = "") -> None:
    suffix = f" — {detail}" if detail else ""
    print(f"OK    {label}{suffix}")


def fail(label: str, detail: str = "") -> None:
    suffix = f" — {detail}" if detail else ""
    print(f"FAIL  {label}{suffix}")


def test_gemini() -> bool:
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        fail("GEMINI_API_KEY", "not set")
        return False
    try:
        import google.generativeai as genai

        genai.configure(api_key=key)
        model = genai.GenerativeModel("models/gemini-2.0-flash")
        resp = model.generate_content("Reply with exactly: OK")
        text = (resp.text or "").strip()
        if text:
            ok("Gemini API", f"response: {text[:60]}")
            return True
        fail("Gemini API", "empty response")
        return False
    except ImportError:
        fail("Gemini API", "install: pip install google-generativeai")
        return False
    except Exception as exc:
        fail("Gemini API", str(exc)[:120])
        return False


def test_groq() -> bool:
    key = os.getenv("GROQ_API_KEY", "").strip()
    if not key:
        fail("GROQ_API_KEY", "not set")
        return False
    try:
        import requests

        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
                "max_tokens": 10,
            },
            timeout=30,
        )
        if resp.status_code == 200:
            text = resp.json()["choices"][0]["message"]["content"].strip()
            ok("Groq API", f"response: {text[:60]}")
            return True
        fail("Groq API", f"HTTP {resp.status_code}: {resp.text[:120]}")
        return False
    except ImportError:
        fail("Groq API", "install: pip install requests")
        return False
    except Exception as exc:
        fail("Groq API", str(exc)[:120])
        return False


def test_mongodb() -> bool:
    uri = os.getenv("ATLAS_URI", "").strip()
    if not uri:
        fail("MongoDB (ATLAS_URI)", "not set — optional if using SQLite + Chroma")
        return False
    try:
        from pymongo import MongoClient

        client = MongoClient(uri, serverSelectionTimeoutMS=8000)
        client.admin.command("ping")
        ok("MongoDB Atlas", "connection successful")
        client.close()
        return True
    except ImportError:
        fail("MongoDB", "install: pip install pymongo")
        return False
    except Exception as exc:
        fail("MongoDB Atlas", str(exc)[:120])
        return False


def test_chroma() -> bool:
    try:
        import chromadb

        client = chromadb.Client()
        col = client.get_or_create_collection("clinai_test")
        col.upsert(ids=["test-1"], documents=["hello world"], metadatas=[{"source": "test"}])
        result = col.query(query_texts=["hello"], n_results=1)
        if result["ids"] and result["ids"][0]:
            ok("Chroma (local)", "read/write works")
            return True
        fail("Chroma (local)", "query returned nothing")
        return False
    except ImportError:
        fail("Chroma (local)", "install: pip install chromadb")
        return False
    except Exception as exc:
        fail("Chroma (local)", str(exc)[:120])
        return False


def main() -> None:
    print(f"ClinAI key test\nEnv file: {ENV_PATH}\n")
    load_env()

    results = [
        test_gemini(),
        test_groq(),
        test_mongodb(),
        test_chroma(),
    ]
    print()
    passed = sum(results)
    print(f"Result: {passed}/{len(results)} checks passed")
    if not os.getenv("GEMINI_API_KEY") or not os.getenv("GROQ_API_KEY"):
        print("\nNext step: create ClinAI/api/.env with GEMINI_API_KEY and GROQ_API_KEY")


if __name__ == "__main__":
    main()
