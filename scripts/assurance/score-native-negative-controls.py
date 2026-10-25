"""Run native score regressions against pinned pre-fix production code.

Candidate cargo tests run first. Every modified source byte is restored in finally.
Write baselines and grade-read baselines are separate, explicit negative controls.
"""
import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
BASELINE = "ac4c3add56fb7a0677f1a0f745bf1de816ea55ee"
GRADE_BASELINE = "de3c691dcce810fda88204cc0101a242c5fd30a5"
GRADE_SEAM_BASELINE = "6f580f056cc5286d1a0174f4f5a4d1a80334bf61"
COMMAND = "src-tauri/src/commands/learner_score.rs"
REPOSITORY = "src-tauri/src/repository/learner_score.rs"
CASES = [
    "command_rejects_unassigned_same_school_teacher_without_writing",
    "command_local_correction_failure_rolls_back_history",
]
GRADE_CASES = [
    "grade_read_rejects_unassigned_same_school_teacher",
    "grade_read_rechecks_assignment_replacement_for_existing_session",
    "grade_read_rechecks_school_head_role_revocation",
]


def baseline_source(path, revision=BASELINE):
    return subprocess.check_output(
        ["git", "show", f"{revision}:{path}"], cwd=ROOT, text=True
    )


def helper_block(source, name):
    start = source.index(f"fn {name}(")
    end = source.index("\n}", start) + 2
    return start, end, source[start:end]


def run_case(case, kind):
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
    if kind == "grade":
        expected_failure = expected_failure and (
            "unexpected grade read: Ok(Some(ComputedTermGrade" in result.stdout
            if case == GRADE_CASES[0]
            else "assertion failed: matches!" in result.stdout
        )
    if not expected_failure:
        raise RuntimeError(f"Baseline did not fail in its expected assertion: {case}")
    return {"case": case, "kind": kind, "baseline_failed_as_expected": True}


def main():
    for revision in (BASELINE, GRADE_BASELINE, GRADE_SEAM_BASELINE):
        if subprocess.run(
            ["git", "cat-file", "-e", f"{revision}^{{commit}}"], cwd=ROOT,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        ).returncode:
            subprocess.run(
                ["git", "fetch", "--no-tags", "origin", revision], cwd=ROOT, check=True
            )
    originals = {path: (ROOT / path).read_bytes() for path in [COMMAND, REPOSITORY]}
    command = originals[COMMAND].decode()
    tests = command[command.index("#[cfg(test)]"):]
    _, _, item_helper = helper_block(command, "require_score_item_access")
    grade_start, grade_end, grade_helper = helper_block(command, "compute_term_grade_for_session")
    baseline_command = baseline_source(COMMAND).split("#[cfg(test)]")[0]
    baseline_repository = baseline_source(REPOSITORY)
    original_grade = baseline_source(COMMAND, GRADE_BASELINE)
    start = original_grade.index("pub fn compute_learner_term_grade(")
    start = original_grade.index("{", start)
    end = original_grade.index("\n}", start)
    original_body = original_grade[start + 1:end]
    expected_body = """
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    grading_computation::compute_term_grade(&conn, &school_id, &class_record_id, &learner_id)"""
    assert original_body == expected_body, "Pinned baseline command body drifted"
    # The command's locked Connection is supplied by the unchanged test seam.
    # Only borrow adaptation is needed; the pinned session/read body is intact.
    grade_body = original_body.replace("\n    let conn = lock_db(&db);", "")
    grade_body = grade_body.replace("require_active_school_scope(&conn)", "require_active_school_scope(conn)")
    grade_body = grade_body.replace(
        "compute_term_grade(&conn, &school_id, &class_record_id, &learner_id)",
        "compute_term_grade(conn, &school_id, class_record_id, learner_id)",
    )
    signature = grade_helper[:grade_helper.index("{") + 1]
    reconstructed_helper = signature + grade_body + "\n}"
    assert reconstructed_helper == helper_block(
        baseline_source(COMMAND, GRADE_SEAM_BASELINE), "compute_term_grade_for_session"
    )[2], "Reconstruction must match the executed pre-guard command seam exactly"
    grade_baseline_command = command[:grade_start] + reconstructed_helper + command[grade_end:]
    results = []
    try:
        # Retain helpers solely to compile all candidate tests. The pinned old
        # write command calls neither helper, so its authority/transaction path
        # remains unchanged for the two existing write negative controls.
        (ROOT / COMMAND).write_text(
            baseline_command + item_helper + "\n\n" + grade_helper + "\n\n" + tests
        )
        (ROOT / REPOSITORY).write_text(baseline_repository)
        for case in CASES:
            results.append(run_case(case, "write"))
        (ROOT / REPOSITORY).write_bytes(originals[REPOSITORY])
        (ROOT / COMMAND).write_text(grade_baseline_command)
        for case in GRADE_CASES:
            results.append(run_case(case, "grade"))
    finally:
        for path, content in originals.items():
            (ROOT / path).write_bytes(content)
        for path, content in originals.items():
            assert (ROOT / path).read_bytes() == content, f"Restore failed: {path}"
    receipt = {
        "baseline": BASELINE,
        "grade_baseline": GRADE_BASELINE,
        "grade_seam_baseline": GRADE_SEAM_BASELINE,
        "grade_baseline_command_body_sha256": hashlib.sha256(original_body.encode()).hexdigest(),
        "evidence": "Native cargo assertions against pinned pre-fix production bodies with candidate tests/fixtures",
        "source_restored": True,
        "candidate_sources": {path: hashlib.sha256(content).hexdigest() for path, content in originals.items()},
        "results": results,
    }
    output = ROOT / ".cache/score-assurance/native-negative-controls.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n")
    print("SCORE_NATIVE_NEGATIVE_CONTROLS_JSON=" + json.dumps(receipt), flush=True)


if __name__ == "__main__":
    main()
