//! CTOS M09 — Teacher Load Maker and versioned smart scheduling.
//!
//! The four steps of CTOS.md §M09's workflow live here, each in its own
//! module so the boundary between them stays visible:
//!
//! - [`constraints`] — Prepare and Lock: load every input that can change
//!   what a valid timetable is, and fingerprint it.
//! - [`generate`] — Generate: a pure function of those inputs, producing
//!   one of three states and never a fourth.
//! - [`check`] — Validate: an independent checker that shares no code and
//!   no cached state with the generator.
//! - [`pipeline`] — the Generate orchestration the commands call: load,
//!   fingerprint, stage a draft, run the generator, persist its
//!   placements.
//!
//! Publication is in [`crate::repository::schedule_plan`], next to the
//! plan ledger it commits to, because it is a database transaction rather
//! than a scheduling step.

pub mod check;
pub mod constraints;
pub mod generate;
pub mod pipeline;
