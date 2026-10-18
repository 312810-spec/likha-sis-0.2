"""Run the new score regressions against pinned pre-fix native production code.

Run candidate cargo tests first. This probe restores all source bytes in finally.
It needs cargo and Git source access; it does not change the acceptance contract.
"""
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
BASELINE = "ac4c3add56fb7a0677f1a0f745bf1de816ea55ee"
COMMAND = "src-tauri/src/commands/learner_score.rs"
REPOSITORY = "src-tauri/src/repository/learner_score.rs"
CASES = [
    "command_rejects_unassigned_same_school_teacher_without_writing",
    "command_local_correction_failure_rolls_back_history",
]


def baseline_source(path):
    return subprocess.check_output(
        ["git", "show", f"{BASELINE}:{path}"], cwd=ROOT, text=True
    )


def main():
    if subprocess.run(
        ["git", "cat-file", "-e", f"{BASELINE}^{{commit}}"], cwd=ROOT,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    ).returncode:
        subprocess.run(["git", "fetch", "--no-tags", "origin", BASELINE], cwd=ROOT, check=True)
    originals = {path: (ROOT / path).read_bytes() for path in [COMMAND, REPOSITORY]}
    command = originals[COMMAND].decode()
    # Keep the exact new tests and their authorized synthetic fixture. The helper
    # is retained solely so the revocation test compiles; the baseline write
    # command below does not call it. Production write/transaction code is pinned.
    tests = command[command.index("#[cfg(test)]"):]
    start = command.index("fn require_score_item_access(")
    helper = command[start:command.index("/// Shared logic", start)]
    baseline_command = baseline_source(COMMAND).split("#[cfg(test)]")[0]
    baseline_repository = baseline_source(REPOSITORY)
    results = []
    try:
        (ROOT / COMMAND).write_text(baseline_command + helper + tests)
        (ROOT / REPOSITORY).write_text(baseline_repository)
        for case in CASES:
            result = subprocess.run(
                ["cargo", "test", "--lib", case, "--", "--nocapture"],
                cwd=ROOT / "src-tauri", text=True,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=600,
            )
            print(result.stdout, flush=True)
            expected_failure = (
                result.returncode != 0
                and f"{case} ... FAILED" in result.stdout
                and "1 failed" in result.stdout
                and "test result: FAILED" in result.stdout
                and "error[E" not in result.stdout
            )
            results.append({"case": case, "baseline_failed_as_expected": expected_failure})
            if not expected_failure:
                raise RuntimeError(f"Baseline negative control did not fail in its test assertion: {case}")
    finally:
        for path, content in originals.items():
            (ROOT / path).write_bytes(content)
        for path, content in originals.items():
            assert (ROOT / path).read_bytes() == content, f"Restore failed: {path}"
    receipt = {"baseline": BASELINE, "evidence": "Native cargo regression execution against pinned pre-fix production code with candidate tests/fixture", "source_restored": True, "results": results}
    output = ROOT / ".cache/score-assurance/native-negative-controls.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n")
    print("SCORE_NATIVE_NEGATIVE_CONTROLS_JSON=" + json.dumps(receipt), flush=True)


if __name__ == "__main__":
    main()
