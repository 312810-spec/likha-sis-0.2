"""SQLite fallback using repository SQL; does not execute Rust or SQLCipher."""
import json
import pathlib
import re
import sqlite3
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
revision = sys.argv[1] if len(sys.argv) > 1 else None

def source(path):
    if revision:
        return subprocess.check_output(["git", "show", f"{revision}:{path}"], cwd=root, text=True)
    return (root / path).read_text()

migrations = source("src-tauri/src/db/migrations.rs").split("#[cfg(test)]")[0]
repo = source("src-tauri/src/repository/learner_score.rs")
commands = source("src-tauri/src/commands/learner_score.rs")

def sql_starting(prefix):
    match = re.search(r'"(' + re.escape(prefix) + r'.*?)"', repo, re.S)
    assert match, prefix
    return re.sub(r'\\\n\s*', '', match.group(1))

live_sql = sql_starting("INSERT INTO learner_scores ")
history_sql = sql_starting("INSERT INTO learner_score_corrections ")
conn = sqlite3.connect(":memory:", isolation_level=None)
conn.execute("PRAGMA foreign_keys=ON")
migrations = re.sub(
    r'M::up\(include_str!\("([^"]+)"\)\)',
    lambda match: 'M::up(r#"' + source("src-tauri/src/db/" + match.group(1)) + '"#)',
    migrations,
)
blocks = re.findall(r'M::up\(\s*r#"(.*?)"#', migrations, re.S)
assert len(blocks) == len(re.findall(r"^\s*M::up\(", migrations, re.M)), "unhandled migration representation"
for block in blocks:
    conn.executescript(block)
conn.execute("INSERT INTO schools(id,name) VALUES('s','Synthetic school')")
for user in ["owner", "outsider"]:
    conn.execute("INSERT INTO users(id,username,password_hash,display_name) VALUES(?,?,?,?)", (user, user, "fixture-not-a-password", user))
    conn.execute("INSERT INTO user_school_memberships(user_id,school_id) VALUES(?,'s')", (user,))
conn.execute("INSERT INTO sections(id,school_id,school_year,grade_level,name) VALUES('sec','s','synthetic-year','10','Synthetic section')")
conn.execute("INSERT INTO subjects(id,school_id,name) VALUES('sub','s','Synthetic subject')")
period = conn.execute("SELECT id FROM grading_policy_periods LIMIT 1").fetchone()[0]
category = conn.execute("SELECT id FROM assessment_categories LIMIT 1").fetchone()[0]
conn.execute("INSERT INTO grading_periods(id,school_id,school_year,policy_period_id,starts_on,ends_on) VALUES('gp','s','synthetic-year',?,'2026-06-01','2026-08-31')", (period,))
conn.execute("INSERT INTO class_records(id,school_id,section_id,subject_id,grading_period_id) VALUES('cr','s','sec','sub','gp')")
conn.execute("INSERT INTO assessment_items(id,school_id,class_record_id,category_id,name,max_score) VALUES('item','s','cr',?,'Synthetic item',20)", (category,))
conn.execute("INSERT INTO learners(id,school_id,given_name,family_name) VALUES('learner','s','Synthetic','Learner')")
conn.execute("INSERT INTO teaching_assignments(id,school_id,teacher_user_id,section_id,subject_id) VALUES('assignment','s','owner','sec','sub')")
conn.execute(live_sql, ("stable-score", "s", "item", "learner", "scored", 18, "owner"))

# Faithful statement order and savepoint policy, extracted from current source.
atomic = 'SAVEPOINT record_learner_score_local' in repo
conn.execute("CREATE TEMP TRIGGER reject_update BEFORE UPDATE ON learner_scores BEGIN SELECT RAISE(ABORT,'synthetic interruption'); END")
if atomic:
    conn.execute("SAVEPOINT record_learner_score_local")
try:
    conn.execute(history_sql, ("history-failed", "s", "item", "learner", "scored", 18, "owner", "synthetic-prior-time", "scored", 19, "owner", "Synthetic correction", None))
    conn.execute(live_sql, ("unused-id", "s", "item", "learner", "scored", 19, "owner"))
    raise AssertionError("fault trigger did not fire")
except sqlite3.IntegrityError:
    if atomic:
        conn.execute("ROLLBACK TO record_learner_score_local")
        conn.execute("RELEASE record_learner_score_local")
history_count = conn.execute("SELECT count(*) FROM learner_score_corrections").fetchone()[0]
assert conn.execute("SELECT score FROM learner_scores").fetchone()[0] == 18

# Execute the exact existing assignment-ownership SQL used by the new command guard.
scope = source("src-tauri/src/auth/data_scope.rs")
query = re.search(r'EntityKind::AssessmentItem => "([^"]+)"', scope).group(1)
assert conn.execute(query, ("s", "owner", "item")).fetchone()[0] == 1
assert conn.execute(query, ("s", "outsider", "item")).fetchone()[0] == 0
conn.execute("UPDATE teaching_assignments SET teacher_user_id='outsider'")
assert conn.execute(query, ("s", "owner", "item")).fetchone()[0] == 0
assert conn.execute(query, ("s", "outsider", "item")).fetchone()[0] == 1
conn.execute("DROP TRIGGER reject_update")
conn.execute("DELETE FROM learner_score_corrections")
conn.execute("SAVEPOINT normal_correction")
conn.execute(history_sql, ("history-ok", "s", "item", "learner", "scored", 18, "owner", "synthetic-prior-time", "scored", 19, "outsider", "Synthetic reviewed correction", None))
conn.execute(live_sql, ("unused-id", "s", "item", "learner", "scored", 19, "outsider"))
conn.execute("RELEASE normal_correction")
assert conn.execute("SELECT id,score,recorded_by_user_id FROM learner_scores").fetchone() == ("stable-score", 19, "outsider")
assert conn.execute("SELECT previous_score,new_score,reason FROM learner_score_corrections").fetchone() == (18, 19, "Synthetic reviewed correction")
print(json.dumps({"revision": revision or "working-tree", "evidence": "SQLite source-SQL fallback, NOT Rust/SQLCipher execution", "literal_migrations_executed": len(blocks), "failed_correction_history_rows": history_count, "atomic_policy_present": atomic, "assignment_sql_owner_outsider_reassignment": "PASS", "normal_correction_identity_and_values": "PASS", "history_rollback": "PASS" if history_count == 0 else "FAIL"}, indent=2))
sys.exit(0 if history_count == 0 else 1)
