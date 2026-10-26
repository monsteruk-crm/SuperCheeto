"""Contract fixture tests for protocol v2 and v3 (M01-T06, M3bis-T04).

Loads the shared fixtures under `contracts/v2/` and `contracts/v3/` and asserts
that the backend parser accepts the valid ones and rejects each invalid one with
the exact stable error code recorded in the fixture. The frontend harness runs
the same fixtures through `frontend/src/cockpit/protocol.ts`; the gate requires
both sides to agree.

Each contract directory keeps the rules for its own version. A recorded v2
payload is *not* reinterpreted as the v3 contract: a v2 payload offered to a v3
context is `incompatible_version` (see `invalid_v2_payload_at_v3.json`).
"""
from __future__ import annotations

import json
import unittest
from pathlib import Path

from app.cockpit_models import ErrorCode
from app.cockpit_protocol import (
    ContractContext,
    ContractError,
    parse_answer_accepted_event,
    parse_answer_event,
    parse_answer_state_event,
    parse_answer_timing_event,
    parse_command,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
CONTRACT_DIRS = (REPO_ROOT / "contracts" / "v2", REPO_ROOT / "contracts" / "v3", REPO_ROOT / "contracts" / "v4", REPO_ROOT / "contracts" / "v5", REPO_ROOT / "contracts" / "v6")


def _load_index(directory: Path) -> dict:
    with (directory / "index.json").open(encoding="utf-8") as handle:
        return json.load(handle)


def _load_fixture(directory: Path, name: str) -> dict:
    with (directory / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def _parser_for(fixture: dict, kind: str | None):
    """Select the parser for one fixture, honouring an explicit `kind` entry."""
    payload = fixture["payload"]
    kind = kind or ("answer_finished" if payload.get("type") == "answer_finished" else "command")
    if kind == "auto_state":
        from app.cockpit_protocol import parse_assistance_state
        return parse_assistance_state
    if kind == "question_event":
        from app.cockpit_protocol import parse_question_event
        return parse_question_event
    if kind == "command":
        return lambda payload, context: parse_command(payload, context)
    if kind == "answer_state":
        return lambda payload, context: parse_answer_state_event(payload, context)
    if kind == "answer_finished":
        return lambda payload, context: parse_answer_event(payload, context)
    if kind == "answer_accepted":
        return lambda payload, context: parse_answer_accepted_event(payload, context)
    if kind == "answer_timing":
        return lambda payload, context: parse_answer_timing_event(payload, context)
    raise AssertionError(f"unknown fixture kind: {kind}")


class CockpitContractFixtureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.cases = []
        for directory in CONTRACT_DIRS:
            index = _load_index(directory)
            context = ContractContext.from_mapping(index["context"])
            for entry in index["fixtures"]:
                fixture = _load_fixture(directory, entry["file"])
                self.cases.append((directory.name, entry, fixture, context))

    def test_fixture_files_exist(self) -> None:
        for directory in CONTRACT_DIRS:
            index = _load_index(directory)
            for entry in index["fixtures"]:
                self.assertTrue((directory / entry["file"]).is_file(), entry["file"])

    def test_all_fixtures_parse_with_expected_outcome(self) -> None:
        for contract, entry, fixture, context in self.cases:
            with self.subTest(contract=contract, fixture=entry["name"]):
                parse = _parser_for(fixture, entry.get("kind"))
                expected = entry["expectedCode"]
                if expected is None:
                    parse(fixture["payload"], context)
                else:
                    with self.assertRaises(ContractError) as caught:
                        parse(fixture["payload"], context)
                    self.assertEqual(
                        caught.exception.code.value,
                        expected,
                        f"{entry['name']}: expected {expected}, got {caught.exception.code.value}",
                    )

    def test_both_contract_directories_are_checked(self) -> None:
        contracts = {contract for contract, *_rest in self.cases}
        self.assertEqual(contracts, {"v2", "v3", "v4", "v5", "v6"})
        kinds = {entry.get("kind") for _c, entry, _f, _ctx in self.cases}
        self.assertIn("answer_accepted", kinds)
        self.assertIn("answer_timing", kinds)

    def test_valid_command_returns_payload(self) -> None:
        directory = CONTRACT_DIRS[0]
        context = ContractContext.from_mapping(_load_index(directory)["context"])
        payload = _load_fixture(directory, "valid_run_context_query.json")["payload"]
        result = parse_command(payload, context)
        self.assertEqual(result["type"], "run_context_query")
        self.assertEqual(result["commandId"], payload["commandId"])

    def test_offsets_are_half_open_and_ordered(self) -> None:
        directory = CONTRACT_DIRS[0]
        context = ContractContext.from_mapping(_load_index(directory)["context"])
        payload = _load_fixture(directory, "invalid_offsets.json")["payload"]
        with self.assertRaises(ContractError) as caught:
            parse_command(payload, context)
        self.assertEqual(caught.exception.code, ErrorCode.INVALID_SPAN)

    def test_stale_revision_is_reported(self) -> None:
        directory = CONTRACT_DIRS[0]
        context = ContractContext.from_mapping(_load_index(directory)["context"])
        payload = _load_fixture(directory, "stale_revision.json")["payload"]
        with self.assertRaises(ContractError) as caught:
            parse_command(payload, context)
        self.assertEqual(caught.exception.code, ErrorCode.STALE_REVISION)

    def test_v3_model_settings_and_timing_survive_parsing(self) -> None:
        directory = CONTRACT_DIRS[1]
        context = ContractContext.from_mapping(_load_index(directory)["context"])
        payload = _load_fixture(directory, "valid_answer_finished_v3.json")["payload"]
        answer = parse_answer_event(payload, context)
        self.assertIsNotNone(answer.model_settings)
        self.assertEqual(answer.model_settings.model, "google/gemini-3.8-flash")
        self.assertEqual(answer.model_settings.reasoning.effort, "low")
        self.assertTrue(answer.model_settings.reasoning.applied)
        self.assertIsNotNone(answer.timing)
        self.assertEqual(answer.timing.backend.completed_ms, 1210.9)
        self.assertEqual(answer.timing.backend.generation.first_delta_ms, 380.4)

    def test_v2_answer_event_has_no_v3_metadata(self) -> None:
        directory = CONTRACT_DIRS[0]
        context = ContractContext.from_mapping(_load_index(directory)["context"])
        payload = _load_fixture(directory, "valid_answer_finished.json")["payload"]
        answer = parse_answer_event(payload, context)
        self.assertIsNone(answer.model_settings)
        self.assertIsNone(answer.timing)


if __name__ == "__main__":
    unittest.main()
