#!/usr/bin/env python3
"""
Interactive chatbot REPL for testing conversation flow from the command line.

Maintains a single session across all questions so context carries over
exactly as it does in the browser UI.

Usage:
    python scripts/chat.py
    python scripts/chat.py --url http://localhost:8000

Commands during the session:
    /new      Start a fresh session (clears context)
    /id       Print the current session ID
    /quit     Exit  (also: Ctrl+C or Ctrl+D)
"""
import argparse
import httpx

DEFAULT_URL = "https://sourcing.dev.hireassist.net"
DEFAULT_TOKEN = "cli-chat"


def send(client, base_url, message, token, session_id):
    resp = client.post(
        f"{base_url}/api/chat",
        json={"message": message, "user_token": token, "session_id": session_id},
        timeout=90.0,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["reply"], data["session_id"]


def main():
    parser = argparse.ArgumentParser(description="AIR chatbot interactive REPL")
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--token", default=DEFAULT_TOKEN)
    args = parser.parse_args()

    session_id = None

    print(f"\nAIR Sourcing Chatbot  —  {args.url}")
    print("Commands: /new (fresh session)  /id (show session)  /quit")
    print("-" * 60)

    with httpx.Client(timeout=90.0) as client:
        while True:
            try:
                line = input("\nYou: ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\nBye.")
                break

            if not line:
                continue
            if line == "/quit":
                print("Bye.")
                break
            elif line == "/new":
                session_id = None
                print("  [new session]")
                continue
            elif line == "/id":
                print(f"  session: {session_id or '(none yet)'}")
                continue

            try:
                reply, session_id = send(client, args.url, line, args.token, session_id)
                print(f"\nAIR: {reply}")
            except httpx.HTTPStatusError as e:
                print(f"\n[HTTP {e.response.status_code}] {e.response.text[:200]}")
            except Exception as e:
                print(f"\n[Error] {e}")


if __name__ == "__main__":
    main()
