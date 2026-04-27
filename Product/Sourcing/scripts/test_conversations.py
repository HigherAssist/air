#!/usr/bin/env python3
"""
End-to-end conversation test script for the AIR sourcing chatbot.

All tests interact with the chatbot exclusively via /api/chat.
No direct DB or REST API calls — this is a pure chatbot end-to-end test.

The script first asks the chatbot to list jobs, extracts real IDs from the
reply, then runs multi-turn conversation suites using those IDs.

Usage:
    python scripts/test_conversations.py
    python scripts/test_conversations.py --url http://localhost:8000
    python scripts/test_conversations.py --url https://sourcing.dev.hireassist.net --verbose
    python scripts/test_conversations.py --suite context_followup
    python scripts/test_conversations.py --list-suites

Options:
    --url URL        Backend base URL (default: https://sourcing.dev.hireassist.net)
    --token TOKEN    User token prefix (default: test-conv)
    --verbose        Print full assistant replies instead of truncated previews
    --suite NAME     Run only the named suite
    --list-suites    List available suite names and exit
    --timeout SECS   Per-request timeout in seconds (default: 60)
"""
import argparse
import re
import sys
import time
from dataclasses import dataclass, field
from typing import Optional

import httpx

# ---------------------------------------------------------------------------
# Reply classification
# ---------------------------------------------------------------------------

# Hard failures — backend or LLM crashed
ERROR_PHRASES = [
    "something went wrong",
    "took too long",
    "too many steps",
    "traceback",
    "exception",
    "sqlalchemy",
    "500 internal server error",
    "wasn't able to find the information you requested",  # old duplicate-detection fallback
]

# Groq quota exhausted — skip, not fail
QUOTA_PHRASES = ["quota", "midnight utc", "temporarily rate"]

# Friendly rephrase prompt — soft failure (allow_fallback controls whether this passes)
FALLBACK_PHRASES = ["had trouble processing", "try rephrasing"]


def _is_error(reply: str) -> bool:
    low = reply.lower()
    return any(p in low for p in ERROR_PHRASES)


def _is_quota(reply: str) -> bool:
    low = reply.lower()
    return any(p in low for p in QUOTA_PHRASES)


def _is_fallback(reply: str) -> bool:
    low = reply.lower()
    return any(p in low for p in FALLBACK_PHRASES)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class Turn:
    """One message in a conversation with expected-content assertions."""
    message: str
    expect: list[str] = field(default_factory=list)       # at least one must appear
    expect_all: list[str] = field(default_factory=list)   # ALL must appear
    reject: list[str] = field(default_factory=list)       # none may appear
    label: str = ""
    allow_fallback: bool = False  # if True, BAD_REQUEST_REPLY is acceptable


@dataclass
class Suite:
    name: str
    description: str
    turns: list[Turn]


@dataclass
class TurnResult:
    turn: Turn
    reply: str
    passed: bool
    skipped: bool
    notes: list[str]
    elapsed: float


@dataclass
class SuiteResult:
    suite: Suite
    turn_results: list[TurnResult]

    @property
    def passed(self) -> int:
        return sum(1 for r in self.turn_results if r.passed and not r.skipped)

    @property
    def failed(self) -> int:
        return sum(1 for r in self.turn_results if not r.passed and not r.skipped)

    @property
    def skipped(self) -> int:
        return sum(1 for r in self.turn_results if r.skipped)


# ---------------------------------------------------------------------------
# Suite definitions
# IDs are filled in at runtime from the chatbot's own job-listing reply.
# ---------------------------------------------------------------------------

def build_suites(job1_id: int, job1_title: str, job2_id: int, job2_title: str,
                 candidate_name: str, candidate_id: int) -> list[Suite]:

    cand_first = candidate_name.split()[0] if candidate_name else "the candidate"

    return [

        # ------------------------------------------------------------------
        Suite(
            name="job_listing",
            description="List jobs then get a description — tests basic listing + description flow",
            turns=[
                Turn(
                    message="What active jobs do you have open right now?",
                    expect=["id=", "job", "active"],
                    label="list all jobs",
                ),
                Turn(
                    message=f"Give me the job description for {job1_title} | ID={job1_id}",
                    expect=["description", "location", job1_title[:12]],
                    reject=["score", "100 —"],
                    label="job description — must use get_job_detail, not get_top_matches",
                ),
                Turn(
                    message="What are the pay details for that job?",
                    expect=["pay", "rate", "salary", "compensation", "n/a"],
                    label="pay follow-up on same job — context must be maintained",
                ),
            ],
        ),

        # ------------------------------------------------------------------
        Suite(
            name="intent_routing",
            description="Description vs. candidate-matches intent routing",
            turns=[
                Turn(
                    message=f"Give me the job description for {job1_title} | ID={job1_id}",
                    expect=["description", "location", job1_title[:12]],
                    reject=["score", "100 —"],
                    label="posting → get_job_detail, NOT get_top_matches",
                ),
                Turn(
                    message="Who are the best candidates for that job?",
                    expect=["score", "candidate", "no pre-computed"],
                    reject=["pay rate", "internal notes"],
                    label="candidates → get_top_matches for same job, NOT get_job_detail",
                ),
                Turn(
                    message=f"Give me the job description for {job2_title} | ID={job2_id}",
                    expect=["description", "location", job2_title[:12]],
                    reject=["score", "100 —"],
                    label="switch to second job description — clean context switch",
                ),
            ],
        ),

        # ------------------------------------------------------------------
        Suite(
            name="context_followup",
            description="Multi-turn context: references to prior answers without repeating IDs",
            turns=[
                Turn(
                    message=f"Get me the top 5 matches for job ID {job1_id}.",
                    expect=["score", "candidate", "no pre-computed"],
                    label="fetch top matches — anchors candidate list in context",
                ),
                Turn(
                    message="Who is the highest scoring candidate from that list?",
                    expect=["score", "candidate", "no pre-computed", "not found"],
                    reject=["active jobs", "list of jobs", "which job"],
                    label="highest scorer — must use context, not call list_jobs",
                ),
                Turn(
                    message="Tell me more about that candidate — their background and skills.",
                    expect=["title", "location", "skill", "history", "status",
                            "not found", "resume", "experience"],
                    reject=["active jobs", "which job", "which candidate"],
                    label="candidate detail from context — no ID required from user",
                ),
            ],
        ),

        # ------------------------------------------------------------------
        Suite(
            name="candidate_lookup",
            description="Candidate lookup by name and by numeric ID",
            turns=[
                Turn(
                    message=f"Show me the full profile for {candidate_name}.",
                    expect=["title", "location", "status", cand_first],
                    label=f"name lookup for {candidate_name}",
                    allow_fallback=True,
                ),
                Turn(
                    message=f"Pull up candidate with ID {candidate_id}.",
                    expect=["title", "location", cand_first],
                    label="integer ID lookup — get_candidate_detail(candidate_id=INT)",
                ),
                Turn(
                    message="What is their current job title and where are they located?",
                    expect=["title", "location", cand_first, "n/a", "unknown"],
                    label="follow-up title/location — must use context, not re-lookup",
                ),
            ],
        ),

        # ------------------------------------------------------------------
        Suite(
            name="candidate_search",
            description="Semantic candidate search — natural language queries",
            turns=[
                Turn(
                    message="Find me candidates with cybersecurity or network security experience.",
                    expect=["id=", "title", "location", "candidate"],
                    label="semantic search via search_candidates",
                ),
                Turn(
                    message="Of those candidates, do any of them have experience in cloud security?",
                    expect=["cloud", "aws", "azure", "security", "yes", "no", "candidate",
                            "not specifically", "none", "found"],
                    label="refinement follow-up — answer from context or re-search",
                ),
                Turn(
                    message="Now search for project managers with agile experience.",
                    expect=["id=", "candidate", "project manager", "agile", "no candidate"],
                    label="new independent search in same session",
                ),
            ],
        ),

        # ------------------------------------------------------------------
        Suite(
            name="edge_cases",
            description="Ambiguous questions, non-existent IDs, graceful not-found handling",
            turns=[
                Turn(
                    message="Can you help me find some good candidates?",
                    expect=["job", "candidate", "search", "describe", "help", "tell me", "which"],
                    reject=["active jobs", "id="],
                    label="vague request — should ask clarifying question, not dump job list",
                ),
                Turn(
                    message=f"What are the top candidates for job {job2_id}?",
                    expect=["score", "candidate", "match", "no pre-computed"],
                    label="matches for second job using numeric ID inline",
                ),
                Turn(
                    message="What about for job ID 9999999?",
                    expect=["not found", "no", "9999999", "no pre-computed", "doesn't exist"],
                    reject=["traceback", "500 internal server error", "sqlalchemy"],
                    label="non-existent job — graceful not-found, not a crash",
                ),
            ],
        ),

        # ------------------------------------------------------------------
        Suite(
            name="no_hallucination",
            description="LLM must not fabricate data not present in tool results",
            turns=[
                Turn(
                    message=f"Does job ID {job1_id} require a government security clearance?",
                    expect=["clearance", "mention", "not mention", "doesn't", "no information",
                            "cannot confirm", "description", "doesn't appear", "not specified"],
                    label="answer based on job data only — no invention",
                ),
                Turn(
                    message="What is the exact salary range for that job?",
                    expect=["pay", "rate", "salary", "n/a", "not specified", "not listed",
                            "no salary", "no pay", "none"],
                    reject=["$100,000", "$80,000", "$60,000", "$120,000"],
                    label="salary from job data only — do not invent a number",
                ),
                Turn(
                    message=f"What is {candidate_name}'s current phone number?",
                    expect=["not available", "not on file", "n/a", "don't have",
                            "no phone", "no contact", "not found", "not in", "not listed"],
                    reject=["+1", "(555)", "555-"],
                    label="phone number — must say not available, not invent one",
                    allow_fallback=True,
                ),
            ],
        ),

    ]


# ---------------------------------------------------------------------------
# Chatbot client
# ---------------------------------------------------------------------------

def chat(client: httpx.Client, base_url: str, message: str,
         user_token: str, session_id: Optional[str], timeout: int) -> tuple[str, str]:
    """Send one message to the chatbot. Returns (reply, session_id)."""
    resp = client.post(
        f"{base_url}/api/chat",
        json={"message": message, "user_token": user_token, "session_id": session_id},
        timeout=float(timeout),
    )
    resp.raise_for_status()
    data = resp.json()
    return data["reply"], data["session_id"]


def discover_job_ids(client: httpx.Client, base_url: str,
                     user_token: str, timeout: int) -> tuple[int, str, int, str]:
    """Ask the chatbot to list jobs and extract the first two job IDs + titles from the reply.

    The chatbot formats jobs as:
      - **Job Title** | ID=XXXXX | Company | Location
    """
    print("  Asking chatbot to list jobs...", end=" ", flush=True)
    reply, _ = chat(client, base_url, "List all active jobs.", user_token, None, timeout)

    # Primary: **Title** | ID=XXXXX  (LLM markdown format per Rule 5)
    pairs = re.findall(r"\*\*([^*]+)\*\*[^|\n]*\|\s*ID=(\d{5,})", reply)
    if len(pairs) < 2:
        # Fallback: ID=XXXXX | Title  (raw tool format)
        raw = re.findall(r"ID=(\d{5,})\s*\|\s*([^|]+?)\s*\|", reply)
        pairs = [(t.strip(), i) for i, t in raw]
    if len(pairs) < 2:
        print(f"\nERROR: Could not parse 2 job IDs from chatbot reply:\n{reply[:600]}")
        sys.exit(1)

    job1_title, job1_id = pairs[0][0].strip(), int(pairs[0][1])
    job2_title, job2_id = pairs[1][0].strip(), int(pairs[1][1])
    print(f"done — {len(pairs)} jobs listed")
    print(f"    job1: {job1_title} (ID={job1_id})")
    print(f"    job2: {job2_title} (ID={job2_id})")
    return job1_id, job1_title, job2_id, job2_title


def discover_candidate(client: httpx.Client, base_url: str, job_id: int,
                        user_token: str, timeout: int) -> tuple[str, int]:
    """Ask the chatbot for top matches and extract the top candidate name + ID.

    The LLM may format as:
      - **Score: 85/100 — Jane Doe** | Title | Location
    or include (ID=XXXXX) from the raw tool output.
    """
    print(f"  Asking chatbot for top match on job {job_id}...", end=" ", flush=True)
    reply, _ = chat(client, base_url,
                    f"Show me the top 3 candidates for job ID {job_id}.",
                    user_token, None, timeout)

    # Try to find candidate name + ID in various formats
    # Format A: "Score: 85/100 — Jane Doe (ID=12345)"
    m = re.search(r"(?:Score[:\s]+\d+[/\s]\d+\s*[—\-–]+\s*)([\w][\w\s,\.]+?)\s*\(ID=(\d+)\)", reply)
    if m:
        cname, cid = m.group(1).strip().rstrip(","), int(m.group(2))
        print(f"done — {cname} (ID={cid})")
        return cname, cid

    # Format B: "(ID=12345)" appears anywhere near a name
    m = re.search(r"[—\-–]\s*([\w][\w\s,\.]{3,40}?)\s*\(ID=(\d+)\)", reply)
    if m:
        cname, cid = m.group(1).strip().rstrip(","), int(m.group(2))
        print(f"done — {cname} (ID={cid})")
        return cname, cid

    # Format C: bare ID=XXXXX anywhere — take the first one and note no name
    id_match = re.search(r"ID=(\d{5,})", reply)
    if id_match:
        cid = int(id_match.group(1))
        print(f"done — ID={cid} (name not parsed)")
        return "Justin White", cid  # use fallback name but real ID

    print("could not parse — using fallback Justin White")
    return "Justin White", 0


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

def evaluate_turn(reply: str, turn: Turn) -> TurnResult:
    notes = []
    passed = True

    if _is_quota(reply):
        return TurnResult(turn=turn, reply=reply, passed=True, skipped=True,
                          notes=["SKIPPED — Groq quota exhausted"], elapsed=0.0)

    if _is_error(reply):
        return TurnResult(turn=turn, reply=reply, passed=False, skipped=False,
                          notes=["FAIL — error phrase in reply"], elapsed=0.0)

    if _is_fallback(reply):
        if turn.allow_fallback:
            return TurnResult(turn=turn, reply=reply, passed=True, skipped=False,
                              notes=["NOTE — fallback reply (allowed for this turn)"], elapsed=0.0)
        notes.append("FAIL — unexpected fallback/rephrase reply")
        passed = False

    if turn.expect:
        matched = [k for k in turn.expect if k.lower() in reply.lower()]
        if not matched:
            notes.append(f"FAIL — none of expected {turn.expect!r} found")
            passed = False
        else:
            notes.append(f"ok — matched: {matched}")

    for kw in turn.expect_all:
        if kw.lower() not in reply.lower():
            notes.append(f"FAIL — required keyword missing: {kw!r}")
            passed = False

    for kw in turn.reject:
        if kw.lower() in reply.lower():
            notes.append(f"FAIL — rejected keyword present: {kw!r}")
            passed = False

    return TurnResult(turn=turn, reply=reply, passed=passed, skipped=False,
                      notes=notes, elapsed=0.0)


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

def run_suite(suite: Suite, client: httpx.Client, base_url: str,
              token_prefix: str, verbose: bool, timeout: int) -> SuiteResult:
    user_token = f"{token_prefix}-{suite.name}"
    session_id: Optional[str] = None
    results = []

    print(f"\n{'='*70}")
    print(f"SUITE: {suite.name}")
    print(f"  {suite.description}")
    print(f"{'='*70}")

    for i, turn in enumerate(suite.turns, 1):
        print(f"\n  [{i}] {turn.label or turn.message[:60]}")
        print(f"  Q: {turn.message}")

        t0 = time.monotonic()
        try:
            reply, session_id = chat(client, base_url, turn.message, user_token, session_id, timeout)
            elapsed = time.monotonic() - t0
        except Exception as e:
            elapsed = time.monotonic() - t0
            reply = f"[HTTP ERROR: {e}]"
            result = TurnResult(turn=turn, reply=reply, passed=False, skipped=False,
                                notes=[f"FAIL — HTTP error: {e}"], elapsed=elapsed)
            results.append(result)
            _print_result(result, verbose)
            continue

        result = evaluate_turn(reply, turn)
        result.elapsed = elapsed
        results.append(result)
        _print_result(result, verbose)

    return SuiteResult(suite=suite, turn_results=results)


def _print_result(result: TurnResult, verbose: bool):
    preview = result.reply if verbose else result.reply[:350].replace("\n", " ")
    if result.skipped:
        badge, color = "SKIP", "\033[33m"
    elif result.passed:
        badge, color = "PASS", "\033[32m"
    else:
        badge, color = "FAIL", "\033[31m"
    reset = "\033[0m"

    print(f"  A: {preview}")
    print(f"  {color}{badge}{reset} ({result.elapsed:.1f}s)", end="")
    for note in result.notes:
        print(f" | {note}", end="")
    print()


def print_summary(suite_results: list[SuiteResult]) -> bool:
    print(f"\n{'='*70}")
    print("SUMMARY")
    print(f"{'='*70}")
    total_p = total_f = total_s = 0
    for sr in suite_results:
        p, f, s = sr.passed, sr.failed, sr.skipped
        total_p += p; total_f += f; total_s += s
        badge = "OK  " if f == 0 else "FAIL"
        color = "\033[32m" if f == 0 else "\033[31m"
        reset = "\033[0m"
        print(f"  {color}{badge}{reset}  {sr.suite.name:<25} pass={p} fail={f} skip={s}")
    print(f"\n  Total: {total_p} passed, {total_f} failed, {total_s} skipped")
    return total_f == 0


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="AIR chatbot conversation tests")
    parser.add_argument("--url", default="https://sourcing.dev.hireassist.net")
    parser.add_argument("--token", default="test-conv")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--suite", default=None)
    parser.add_argument("--list-suites", action="store_true")
    parser.add_argument("--timeout", type=int, default=60)
    args = parser.parse_args()

    print(f"AIR Chatbot Conversation Tests")
    print(f"  Backend: {args.url}")

    with httpx.Client(timeout=args.timeout) as client:
        # Discovery: ask the chatbot itself for job IDs and a candidate
        disc_token = f"{args.token}-discovery"
        job1_id, job1_title, job2_id, job2_title = discover_job_ids(
            client, args.url, disc_token, args.timeout)
        candidate_name, candidate_id = discover_candidate(
            client, args.url, job1_id, f"{disc_token}-match", args.timeout)

        suites = build_suites(job1_id, job1_title, job2_id, job2_title,
                              candidate_name, candidate_id)

        if args.list_suites:
            print("\nAvailable suites:")
            for s in suites:
                print(f"  {s.name:<25} — {s.description}")
            return

        if args.suite:
            suites = [s for s in suites if s.name == args.suite]
            if not suites:
                print(f"ERROR: Suite '{args.suite}' not found. Use --list-suites.")
                sys.exit(1)

        suite_results = []
        for suite in suites:
            result = run_suite(suite, client, args.url, args.token, args.verbose, args.timeout)
            suite_results.append(result)

        ok = print_summary(suite_results)
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
