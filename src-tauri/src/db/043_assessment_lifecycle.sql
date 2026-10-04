CREATE TABLE assessment_lifecycle (
 assessment_item_id TEXT PRIMARY KEY REFERENCES assessment_items(id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK(state IN ('planned','closed')),
 event_starts_on TEXT,
 event_ends_on TEXT,
 due_on TEXT,
 CHECK ((event_starts_on IS NULL AND event_ends_on IS NULL) OR
        (event_starts_on IS NOT NULL AND event_ends_on IS NOT NULL AND event_starts_on <= event_ends_on))
);
