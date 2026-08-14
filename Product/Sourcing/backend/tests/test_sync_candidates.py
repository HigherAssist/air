"""
Offline unit tests for the Loxo candidate sync logic.

These are hermetic — no network, no database, no deployed backend. They exercise
the incremental-sync decision path, the helper functions, and the abort-on-repeated-
failure guard added to ``sync_all_candidates``.

The ORM ``Candidate`` model is lazily imported inside the sync functions and pulls in
``pgvector`` (a runtime-only dep), so we inject a lightweight stub into ``sys.modules``
before those imports run. The sync orchestration only uses ``Candidate`` as the type
argument to ``db.get(Candidate, id)``, which our fake DB ignores.
"""
import sys
import types
from datetime import datetime, timezone, timedelta

import pytest

from data_sync.loxo import sync_candidates as sc


# --------------------------------------------------------------------------- #
# Fakes
# --------------------------------------------------------------------------- #

class FakeCandidate:
    """Stands in for an existing DB row in the incremental-skip decision."""
    def __init__(self, last_synced_at=None, embedding=None):
        self.last_synced_at = last_synced_at
        self.embedding = embedding


class FakeDB:
    def __init__(self, rows=None):
        self.rows = rows or {}          # person_id -> FakeCandidate
        self.rollbacks = 0
        self.commits = 0
        self.added = []

    def get(self, _model, pk):
        return self.rows.get(pk)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def add(self, obj):
        self.added.append(obj)


class FakeLoxo:
    """Yields the given people summaries; records get_person calls."""
    def __init__(self, summaries, persons=None):
        self._summaries = summaries
        self._persons = persons or {}
        self.get_person_calls = []

    def iter_people(self, status_id=None):
        for s in self._summaries:
            yield s

    def get_person(self, person_id):
        self.get_person_calls.append(person_id)
        # Minimal full profile; status not excluded.
        return self._persons.get(
            person_id,
            {"id": person_id, "name": "Test Person",
             "person_global_status": {"id": 30199}},
        )


class FakeEmbedder:
    def embed_candidate(self, candidate):
        return [0.0]


def _summary(person_id, status_id=30199, updated_at=None):
    s = {"id": person_id, "person_global_status": {"id": status_id}}
    if updated_at is not None:
        s["updated_at"] = updated_at
    return s


@pytest.fixture(autouse=True)
def stub_orm(monkeypatch):
    """Make ``from app.db.orm_models import Candidate`` resolve to a stub so the
    sync functions import without the real pgvector-backed ORM."""
    mod = types.ModuleType("app.db.orm_models")
    mod.Candidate = FakeCandidate
    monkeypatch.setitem(sys.modules, "app.db.orm_models", mod)


@pytest.fixture
def spy_upsert(monkeypatch):
    """Replace upsert_candidate with a recording spy (optionally raising)."""
    calls = []

    def _make(raise_always=False):
        def _fake(**kwargs):
            calls.append(kwargs["person_data"]["id"])
            if raise_always:
                raise RuntimeError("boom")
        monkeypatch.setattr(sc, "upsert_candidate", _fake)
        return calls
    return _make


# --------------------------------------------------------------------------- #
# _clean
# --------------------------------------------------------------------------- #

def test_clean_strips_nul_bytes():
    assert sc._clean("a\x00b\x00c") == "abc"


def test_clean_truncates_to_max_len():
    out = sc._clean("x" * 600, 500)
    assert len(out) == 500


def test_clean_no_maxlen_does_not_truncate():
    assert len(sc._clean("x" * 600)) == 600


def test_clean_truncates_after_stripping_nul():
    # NUL removal happens first, so a string of exactly max_len real chars survives.
    assert sc._clean("\x00" + "y" * 500, 500) == "y" * 500


def test_clean_passes_through_non_strings():
    assert sc._clean(None) is None
    assert sc._clean(12345, 3) == 12345


# --------------------------------------------------------------------------- #
# _parse_loxo_dt
# --------------------------------------------------------------------------- #

def test_parse_loxo_dt_valid_z_suffix():
    dt = sc._parse_loxo_dt("2026-08-11T17:36:50.000Z")
    assert dt == datetime(2026, 8, 11, 17, 36, 50, tzinfo=timezone.utc)
    assert dt.tzinfo is not None


@pytest.mark.parametrize("bad", [None, "", "not-a-date", 1234567890, "2026-13-99"])
def test_parse_loxo_dt_invalid_returns_none(bad):
    assert sc._parse_loxo_dt(bad) is None


# --------------------------------------------------------------------------- #
# sync_all_candidates — incremental decision
# --------------------------------------------------------------------------- #

def _synced(offset_hours=0, embedding=(0.1,)):
    """A FakeCandidate synced `offset_hours` from a fixed base, tz-aware."""
    base = datetime(2026, 8, 11, 18, 0, 0, tzinfo=timezone.utc)
    return FakeCandidate(last_synced_at=base + timedelta(hours=offset_hours),
                         embedding=embedding)


def test_skips_unchanged_embedded_candidate(spy_upsert):
    calls = spy_upsert()
    loxo = FakeLoxo([_summary(1, updated_at="2026-08-11T17:00:00.000Z")])  # before last sync
    db = FakeDB({1: _synced()})  # last_synced 18:00Z, embedded
    total = sc.sync_all_candidates(loxo, db, FakeEmbedder())
    assert total == 0
    assert loxo.get_person_calls == []   # expensive fetch avoided
    assert calls == []


def test_refetches_when_loxo_updated_after_last_sync(spy_upsert):
    calls = spy_upsert()
    loxo = FakeLoxo([_summary(1, updated_at="2026-08-11T19:00:00.000Z")])  # after last sync
    db = FakeDB({1: _synced()})
    total = sc.sync_all_candidates(loxo, db, FakeEmbedder())
    assert total == 1
    assert loxo.get_person_calls == [1]
    assert calls == [1]


def test_refetches_when_missing_embedding(spy_upsert):
    calls = spy_upsert()
    loxo = FakeLoxo([_summary(1, updated_at="2026-08-11T17:00:00.000Z")])  # unchanged
    db = FakeDB({1: _synced(embedding=None)})  # but never embedded
    total = sc.sync_all_candidates(loxo, db, FakeEmbedder())
    assert total == 1
    assert loxo.get_person_calls == [1]


def test_refetches_when_last_synced_is_tz_naive(spy_upsert):
    calls = spy_upsert()
    naive = FakeCandidate(last_synced_at=datetime(2026, 8, 11, 18, 0, 0), embedding=(0.1,))
    loxo = FakeLoxo([_summary(1, updated_at="2026-08-11T17:00:00.000Z")])
    db = FakeDB({1: naive})
    total = sc.sync_all_candidates(loxo, db, FakeEmbedder())
    assert total == 1  # can't compare naive safely -> re-fetch
    assert loxo.get_person_calls == [1]


def test_refetches_new_candidate(spy_upsert):
    calls = spy_upsert()
    loxo = FakeLoxo([_summary(1, updated_at="2026-08-11T17:00:00.000Z")])
    db = FakeDB({})  # not in DB yet
    total = sc.sync_all_candidates(loxo, db, FakeEmbedder())
    assert total == 1
    assert loxo.get_person_calls == [1]


def test_refetches_when_summary_has_no_updated_at(spy_upsert):
    calls = spy_upsert()
    loxo = FakeLoxo([_summary(1, updated_at=None)])  # no updated_at -> can't prove unchanged
    db = FakeDB({1: _synced()})
    total = sc.sync_all_candidates(loxo, db, FakeEmbedder())
    assert total == 1
    assert loxo.get_person_calls == [1]


def test_full_resync_bypasses_incremental_skip(spy_upsert):
    calls = spy_upsert()
    loxo = FakeLoxo([_summary(1, updated_at="2026-08-11T17:00:00.000Z")])  # would normally skip
    db = FakeDB({1: _synced()})
    total = sc.sync_all_candidates(loxo, db, FakeEmbedder(), full_resync=True)
    assert total == 1
    assert loxo.get_person_calls == [1]


def test_excluded_status_skipped_before_fetch(spy_upsert):
    calls = spy_upsert()
    loxo = FakeLoxo([_summary(1, status_id=30205),   # do_not_contact
                     _summary(2, status_id=30206)])  # bad_data
    db = FakeDB({})
    total = sc.sync_all_candidates(loxo, db, FakeEmbedder())
    assert total == 0
    assert loxo.get_person_calls == []   # never fetched excluded people
    assert calls == []


# --------------------------------------------------------------------------- #
# sync_all_candidates — abort guard
# --------------------------------------------------------------------------- #

def test_aborts_after_max_consecutive_errors(spy_upsert):
    spy_upsert(raise_always=True)
    people = [_summary(i) for i in range(sc.MAX_CONSECUTIVE_ERRORS + 5)]
    loxo = FakeLoxo(people)
    db = FakeDB({})
    with pytest.raises(RuntimeError, match="SYNC ABORTED"):
        sc.sync_all_candidates(loxo, db, FakeEmbedder())
    # Each failure should roll the session back.
    assert db.rollbacks == sc.MAX_CONSECUTIVE_ERRORS


def test_consecutive_error_counter_resets_on_success(monkeypatch):
    # Pattern: (MAX-1) failures, one success, then (MAX-1) failures again.
    # The success resets the counter, so we never hit MAX in a row -> no abort.
    n = sc.MAX_CONSECUTIVE_ERRORS
    fail_ids = set(range(n - 1)) | set(range(n, 2 * n - 1))  # id (n-1) succeeds
    calls = []

    def _fake(**kwargs):
        pid = kwargs["person_data"]["id"]
        calls.append(pid)
        if pid in fail_ids:
            raise RuntimeError("boom")
    monkeypatch.setattr(sc, "upsert_candidate", _fake)

    people = [_summary(i) for i in range(2 * n - 1)]
    loxo = FakeLoxo(people)
    db = FakeDB({})
    total = sc.sync_all_candidates(loxo, db, FakeEmbedder())  # must not raise
    assert total == 1  # only the single non-failing person counted
