use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchoolPlanningInput {
    pub kind: String,
    pub title: String,
    pub details: String,
    pub source_reference: String,
    pub effective_on: String,
    #[serde(default = "no_change")]
    pub calendar_decision: String,
    #[serde(default)]
    pub affected_area: String,
    pub coordinator_user_id: Option<String>,
    pub status: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchoolPlanningItem {
    pub id: String,
    pub revision: u32,
    pub input: SchoolPlanningInput,
    pub updated_at: String,
}
fn no_change() -> String {
    "noChange".into()
}
fn invalid() -> AppError {
    AppError::Import(
        "School planning information is incomplete or stale. Reload and review your entries."
            .into(),
    )
}
fn read(row: &rusqlite::Row<'_>) -> rusqlite::Result<SchoolPlanningItem> {
    Ok(SchoolPlanningItem {
        id: row.get(0)?,
        revision: row.get(1)?,
        input: SchoolPlanningInput {
            kind: row.get(2)?,
            title: row.get(3)?,
            details: row.get(4)?,
            source_reference: row.get(5)?,
            effective_on: row.get(6)?,
            coordinator_user_id: row.get(7)?,
            status: row.get(8)?,
            calendar_decision: row.get(10)?,
            affected_area: row.get(11)?,
        },
        updated_at: row.get(9)?,
    })
}
pub fn list(conn: &Connection, school_id: &str) -> AppResult<Vec<SchoolPlanningItem>> {
    let mut stmt = conn.prepare("SELECT id,revision,kind,title,details,source_reference,effective_on,coordinator_user_id,status,updated_at,calendar_decision,affected_area FROM school_planning_items WHERE school_id=?1 ORDER BY updated_at DESC,id")?;
    let rows = stmt.query_map([school_id], read)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}
fn validate_input(
    conn: &Connection,
    school_id: &str,
    input: &SchoolPlanningInput,
) -> AppResult<()> {
    if !matches!(
        input.calendar_decision.as_str(),
        "noChange" | "instructional" | "nonInstructional"
    ) || input.affected_area.len() > 500
    {
        return Err(invalid());
    }
    if input.calendar_decision != "noChange"
        && (input.kind != "notice" || input.affected_area.trim().is_empty())
    {
        return Err(invalid());
    }
    let allowed = matches!(
        (input.kind.as_str(), input.status.as_str()),
        ("notice", "draft" | "confirmed") | ("program", "inactive" | "active")
    );
    if !allowed
        || input.title.trim().is_empty()
        || input.title.len() > 200
        || input.details.len() > 12000
        || input.source_reference.len() > 2000
    {
        return Err(invalid());
    }
    if input.kind == "notice"
        && input.status == "confirmed"
        && (input.source_reference.trim().is_empty() || input.effective_on.is_empty())
    {
        return Err(invalid());
    }
    if !input.effective_on.is_empty() && !crate::scheduling::valid_date(&input.effective_on) {
        return Err(invalid());
    }
    if input.kind == "program"
        && input.status == "active"
        && (input.source_reference.trim().is_empty()
            || input.details.trim().is_empty()
            || input.coordinator_user_id.is_none())
    {
        return Err(invalid());
    }
    if let Some(coordinator) = &input.coordinator_user_id {
        if !crate::repository::user::is_member_of_school(conn, coordinator, school_id)? {
            return Err(AppError::Unauthorized);
        }
    }
    Ok(())
}
pub fn save(
    conn: &Connection,
    school_id: &str,
    actor_id: &str,
    input: &SchoolPlanningInput,
    id: Option<&str>,
    expected_revision: Option<u32>,
) -> AppResult<SchoolPlanningItem> {
    validate_input(conn, school_id, input)?;
    let item_id = id
        .map(str::to_owned)
        .unwrap_or_else(|| Uuid::now_v7().to_string());
    conn.execute_batch("SAVEPOINT school_planning_save")?;
    let outcome = (|| -> AppResult<SchoolPlanningItem> {
        let revision = if id.is_some() {
            let expected = expected_revision.ok_or_else(invalid)?;
            let changed = conn.execute("UPDATE school_planning_items SET title=?1,details=?2,source_reference=?3,effective_on=?4,coordinator_user_id=?5,status=?6,calendar_decision=?12,affected_area=?13,revision=revision+1,updated_by=?7,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?8 AND school_id=?9 AND revision=?10 AND kind=?11", params![input.title.trim(),input.details,input.source_reference.trim(),input.effective_on,input.coordinator_user_id,input.status,actor_id,item_id,school_id,expected,input.kind,input.calendar_decision,input.affected_area.trim()])?;
            if changed != 1 {
                return Err(invalid());
            }
            expected + 1
        } else {
            if expected_revision.is_some() {
                return Err(invalid());
            }
            conn.execute("INSERT INTO school_planning_items(id,school_id,kind,title,details,source_reference,effective_on,coordinator_user_id,status,revision,updated_by,calendar_decision,affected_area) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,1,?10,?11,?12)", params![item_id,school_id,input.kind,input.title.trim(),input.details,input.source_reference.trim(),input.effective_on,input.coordinator_user_id,input.status,actor_id,input.calendar_decision,input.affected_area.trim()])?;
            1
        };
        let item = list(conn, school_id)?
            .into_iter()
            .find(|i| i.id == item_id)
            .ok_or_else(invalid)?;
        let snapshot = serde_json::to_string(&item).map_err(|_| invalid())?;
        conn.execute("INSERT INTO school_planning_history(item_id,revision,school_id,snapshot_json,changed_by) VALUES(?1,?2,?3,?4,?5)",params![item_id,revision,school_id,snapshot,actor_id])?;
        Ok(item)
    })();
    match outcome {
        Ok(item) => {
            conn.execute_batch("RELEASE school_planning_save")?;
            Ok(item)
        }
        Err(error) => {
            let _ = conn
                .execute_batch("ROLLBACK TO school_planning_save; RELEASE school_planning_save");
            Err(error)
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlanningHistoryPublication {
    pub snapshot: SchoolPlanningItem,
    pub changed_by: String,
    pub changed_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SchoolPlanningPublication {
    pub school_id: String,
    pub item: SchoolPlanningItem,
    pub history: Vec<PlanningHistoryPublication>,
}
pub fn publication(
    conn: &Connection,
    school_id: &str,
    item: SchoolPlanningItem,
) -> AppResult<SchoolPlanningPublication> {
    let mut stmt=conn.prepare("SELECT snapshot_json,changed_by,changed_at FROM school_planning_history WHERE item_id=?1 AND school_id=?2 ORDER BY revision")?;
    let rows = stmt.query_map(params![item.id, school_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    let mut history = Vec::new();
    for row in rows {
        let (snapshot, changed_by, changed_at) = row?;
        history.push(PlanningHistoryPublication {
            snapshot: serde_json::from_str(&snapshot).map_err(|_| invalid())?,
            changed_by,
            changed_at,
        });
    }
    Ok(SchoolPlanningPublication {
        school_id: school_id.into(),
        item,
        history,
    })
}
pub fn receive_publication(
    conn: &Connection,
    school_id: &str,
    actor_id: &str,
    entity_id: &str,
    incoming: &SchoolPlanningPublication,
) -> AppResult<()> {
    use rusqlite::OptionalExtension;
    if incoming.school_id != school_id
        || incoming.item.id != entity_id
        || incoming.item.revision == 0
        || incoming.history.len() != incoming.item.revision as usize
    {
        return Err(invalid());
    }
    if !crate::repository::role::list_roles(conn, actor_id, school_id)?
        .iter()
        .any(|r| r == "school_head")
    {
        return Err(AppError::Unauthorized);
    }
    for (index, entry) in incoming.history.iter().enumerate() {
        if entry.snapshot.id != entity_id
            || entry.snapshot.revision as usize != index + 1
            || entry.snapshot.input.kind != incoming.item.input.kind
            || !crate::repository::user::is_member_of_school(conn, &entry.changed_by, school_id)?
        {
            return Err(invalid());
        }
        validate_input(conn, school_id, &entry.snapshot.input)?;
    }
    let last = incoming.history.last().ok_or_else(invalid)?;
    if last.changed_by != actor_id
        || serde_json::to_value(&last.snapshot).map_err(|_| invalid())?
            != serde_json::to_value(&incoming.item).map_err(|_| invalid())?
    {
        return Err(invalid());
    }
    if crate::repository::sync_outbox::has_pending_for_entity(
        conn,
        school_id,
        crate::sync::EntityKind::SchoolPlanning,
        entity_id,
    )? {
        return Err(invalid());
    }
    let existing = conn
        .query_row(
            "SELECT school_id,revision FROM school_planning_items WHERE id=?1",
            [entity_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, u32>(1)?)),
        )
        .optional()?;
    if let Some((school, revision)) = &existing {
        if school != school_id || *revision > incoming.item.revision {
            return Err(invalid());
        }
    }
    conn.execute_batch("SAVEPOINT receive_school_planning")?;
    let result = (|| -> AppResult<()> {
        for entry in &incoming.history {
            let local:Option<String>=conn.query_row("SELECT snapshot_json FROM school_planning_history WHERE item_id=?1 AND revision=?2 AND school_id=?3",params![entity_id,entry.snapshot.revision,school_id],|r|r.get(0)).optional()?;
            if let Some(local) = local {
                if serde_json::from_str::<serde_json::Value>(&local).map_err(|_| invalid())?
                    != serde_json::to_value(&entry.snapshot).map_err(|_| invalid())?
                {
                    return Err(invalid());
                }
            }
        }
        let i = &incoming.item.input;
        conn.execute("INSERT INTO school_planning_items(id,school_id,kind,title,details,source_reference,effective_on,coordinator_user_id,status,revision,updated_by,updated_at,calendar_decision,affected_area) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14) ON CONFLICT(id) DO UPDATE SET title=excluded.title,details=excluded.details,source_reference=excluded.source_reference,effective_on=excluded.effective_on,coordinator_user_id=excluded.coordinator_user_id,status=excluded.status,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at,calendar_decision=excluded.calendar_decision,affected_area=excluded.affected_area",params![entity_id,school_id,i.kind,i.title,i.details,i.source_reference,i.effective_on,i.coordinator_user_id,i.status,incoming.item.revision,actor_id,incoming.item.updated_at,i.calendar_decision,i.affected_area])?;
        for entry in &incoming.history {
            conn.execute("INSERT OR IGNORE INTO school_planning_history(item_id,revision,school_id,snapshot_json,changed_by,changed_at) VALUES(?1,?2,?3,?4,?5,?6)",params![entity_id,entry.snapshot.revision,school_id,serde_json::to_string(&entry.snapshot).map_err(|_|invalid())?,entry.changed_by,entry.changed_at])?;
        }
        Ok(())
    })();
    match result {
        Ok(()) => {
            conn.execute_batch("RELEASE receive_school_planning")?;
            Ok(())
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO receive_school_planning; RELEASE receive_school_planning",
            );
            Err(error)
        }
    }
}
/// Only a confirmed whole-school decision can alter automatic daily planning.
/// Conflicting active notices intentionally return no decision for administrator review.
pub fn confirmed_day_decision(
    conn: &Connection,
    school_id: &str,
    date: &str,
) -> AppResult<Option<bool>> {
    let items = list(conn, school_id)?;
    let decisions: Vec<bool> = items
        .iter()
        .filter(|item| {
            item.input.kind == "notice"
                && item.input.status == "confirmed"
                && item.input.effective_on == date
                && item.input.affected_area == "wholeSchool"
                && item.input.calendar_decision != "noChange"
        })
        .map(|item| item.input.calendar_decision == "instructional")
        .collect();
    Ok(decisions
        .first()
        .copied()
        .filter(|first| decisions.iter().all(|value| value == first)))
}
#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (Connection, String, String) {
        let conn = crate::db::open(
            std::path::Path::new(":memory:"),
            &crate::crypto::generate_key(),
        )
        .unwrap();
        // Supports isolated testing before root adds migration 46.
        let exists: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE name='school_planning_items'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        if exists == 0 {
            conn.execute_batch(include_str!("../db/046_school_planning.sql"))
                .unwrap();
        }
        let school = crate::repository::school::create(&conn, "School").unwrap();
        let user = crate::repository::user::create_user(&conn, "head", "secret", "Head").unwrap();
        (conn, school.id, user.id)
    }
    fn input() -> SchoolPlanningInput {
        SchoolPlanningInput {
            kind: "notice".into(),
            title: "Weather advisory".into(),
            details: "Await administrator decision".into(),
            source_reference: "".into(),
            effective_on: "".into(),
            calendar_decision: "noChange".into(),
            affected_area: "".into(),
            coordinator_user_id: None,
            status: "draft".into(),
        }
    }
    #[test]
    fn notice_stays_draft_without_authority_and_stale_update_preserves_history() {
        let (conn, school, user) = fixture();
        let mut i = input();
        let first = save(&conn, &school, &user, &i, None, None).unwrap();
        i.status = "confirmed".into();
        assert!(save(&conn, &school, &user, &i, Some(&first.id), Some(1)).is_err());
        assert_eq!(list(&conn, &school).unwrap()[0].input.status, "draft");
        i.source_reference = "School head confirmation".into();
        i.effective_on = "2026-10-05".into();
        assert_eq!(
            save(&conn, &school, &user, &i, Some(&first.id), Some(1))
                .unwrap()
                .revision,
            2
        );
        assert!(save(&conn, &school, &user, &i, Some(&first.id), Some(1)).is_err());
        assert_eq!(
            conn.query_row("SELECT count(*) FROM school_planning_history", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            2
        );
        assert!(list(&conn, "another-school").unwrap().is_empty());
    }
    #[test]
    fn only_confirmed_whole_school_decision_changes_the_day() {
        let (conn, school, user) = fixture();
        let mut i = input();
        i.effective_on = "2026-10-05".into();
        i.calendar_decision = "nonInstructional".into();
        i.affected_area = "wholeSchool".into();
        let first = save(&conn, &school, &user, &i, None, None).unwrap();
        assert_eq!(
            confirmed_day_decision(&conn, &school, "2026-10-05").unwrap(),
            None
        );
        i.source_reference = "School head instruction".into();
        i.status = "confirmed".into();
        save(&conn, &school, &user, &i, Some(&first.id), Some(1)).unwrap();
        assert_eq!(
            confirmed_day_decision(&conn, &school, "2026-10-05").unwrap(),
            Some(false)
        );
        assert_eq!(
            confirmed_day_decision(&conn, &school, "2026-10-06").unwrap(),
            None
        );
        i.calendar_decision = "instructional".into();
        save(&conn, &school, &user, &i, None, None).unwrap();
        assert_eq!(
            confirmed_day_decision(&conn, &school, "2026-10-05").unwrap(),
            None
        );
    }
    #[test]
    fn named_program_cannot_activate_without_instructions_and_local_coordinator() {
        let (conn, school, user) = fixture();
        let mut i = input();
        i.kind = "program".into();
        i.title = "ARAL".into();
        i.status = "inactive".into();
        let first = save(&conn, &school, &user, &i, None, None).unwrap();
        i.status = "active".into();
        assert!(save(&conn, &school, &user, &i, Some(&first.id), Some(1)).is_err());
        i.source_reference = "School instructions".into();
        i.coordinator_user_id = Some("foreign-user".into());
        assert!(save(&conn, &school, &user, &i, Some(&first.id), Some(1)).is_err());
        assert_eq!(list(&conn, &school).unwrap()[0].input.status, "inactive");
    }
}
