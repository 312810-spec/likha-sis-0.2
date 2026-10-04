import { emptySchedulePlan } from "./schedule-plan-draft";
import { useEffect, useState, type ReactNode } from "react";
import type { SchedulePlanApplicationService } from "../application/schedule-plan-service";
import type { SchedulePlan, SchedulePlanInput } from "../domain/schedule-plan";
import type { SchoolMember } from "../domain/school-member";
import type { Section } from "../domain/section";
import type { Subject } from "../domain/subject";
import { Page } from "./components/Page";
import { Alert } from "./components/Alert";
import "./schedule-planner.css";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      {label}
      {children}
    </label>
  );
}
function Day({ value, change }: { value: number; change: (value: number) => void }) {
  return (
    <select value={value} onChange={(e) => change(Number(e.target.value))}>
      {DAYS.map((day, i) => (
        <option key={day} value={i}>
          {day}
        </option>
      ))}
    </select>
  );
}
function Choices({
  label,
  values,
  options,
  change,
}: {
  label: string;
  values: string[];
  options: { id: string; name: string }[];
  change: (values: string[]) => void;
}) {
  return (
    <fieldset className="schedule-choices">
      <legend>{label}</legend>
      {options.length ? (
        options.map((option) => (
          <label key={option.id}>
            <input
              type="checkbox"
              checked={values.includes(option.id)}
              onChange={(e) =>
                change(
                  e.target.checked ? [...values, option.id] : values.filter((v) => v !== option.id),
                )
              }
            />
            {option.name}
          </label>
        ))
      ) : (
        <p>Add the available choices first.</p>
      )}
    </fieldset>
  );
}
export function SchedulePlannerScreen({
  service,
  members,
  sections,
  subjects,
}: {
  service: SchedulePlanApplicationService;
  members: SchoolMember[];
  sections: Section[];
  subjects: Subject[];
}) {
  const [plans, setPlans] = useState<SchedulePlan[]>([]);
  const [selected, setSelected] = useState<SchedulePlan | null>(null);
  const [input, setInput] = useState<SchedulePlanInput>(emptySchedulePlan);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    service
      .list()
      .then((rows) => {
        if (active) setPlans(rows);
      })
      .catch(() => {
        if (active) setError("Could not load saved plans. Retry by reopening this page.");
      });
    return () => {
      active = false;
    };
  }, [service]);
  const edit = (next: SchedulePlanInput) => {
    setInput({ ...next, dataConfirmed: false });
    setDirty(true);
    setMessage("");
  };
  const patch = (next: Partial<SchedulePlanInput>) => edit({ ...input, ...next });
  const choose = (plan: SchedulePlan | null) => {
    setSelected(plan);
    setInput(plan ? structuredClone(plan.input) : emptySchedulePlan());
    setDirty(false);
    setMessage("");
    setError("");
  };
  async function act(action: "save" | "generate" | "publish" | "copy") {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let saved: SchedulePlan;
      if (action === "save") saved = await service.save(input, selected?.id, selected?.revision);
      else if (!selected) throw new Error("Save this draft first.");
      else if (action === "copy")
        saved = await service.save({
          ...selected.input,
          label: `${selected.input.label} — new draft`,
          dataConfirmed: false,
        });
      else if (action === "generate")
        saved = await service.generate(selected.id, selected.revision);
      else saved = await service.publish(selected.id, selected.revision);
      setSelected(saved);
      setInput(structuredClone(saved.input));
      setDirty(false);
      setPlans((current) => [saved, ...current.filter((p) => p.id !== saved.id)]);
      setMessage(
        action === "publish"
          ? "Published. Teachers can use this version after transfer to their devices."
          : action === "generate"
            ? "Suggestion ready for review. Check its outcome below."
            : "Saved on this device.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "This action could not be completed. Your draft is still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  const readonly = selected?.status === "published";
  const teachers = members.filter((m) => m.roles.includes("teacher"));
  const result = dirty ? null : selected?.result;
  return (
    <Page
      title="Teacher load and class schedule"
      actions={
        selected?.status === "published" ? (
          <button type="button" onClick={() => window.print()}>
            Print published version {selected.revision}
          </button>
        ) : undefined
      }
      hint={
        <p>
          Build a draft from confirmed school information. Suggestions need your review before
          teachers receive a published schedule.
        </p>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}
      <div className="form-row">
        <Field label="Saved plan">
          <select
            value={selected?.id ?? ""}
            disabled={busy}
            onChange={(e) => choose(plans.find((p) => p.id === e.target.value) ?? null)}
          >
            <option value="">New empty draft</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.input.label} · {p.status} · version {p.revision}
              </option>
            ))}
          </select>
        </Field>
        {readonly && (
          <button type="button" disabled={busy} onClick={() => act("copy")}>
            Copy published version to a new draft
          </button>
        )}
      </div>
      <fieldset disabled={busy || readonly} className="schedule-editor">
        <legend>School plan</legend>
        <div className="form-row">
          <Field label="Plan name">
            <input value={input.label} onChange={(e) => patch({ label: e.target.value })} />
          </Field>
          <Field label="School year">
            <input
              value={input.schoolYear}
              onChange={(e) => patch({ schoolYear: e.target.value })}
              placeholder="Use the section's school year"
            />
          </Field>
          <Field label="Term">
            <input value={input.termLabel} onChange={(e) => patch({ termLabel: e.target.value })} />
          </Field>
          <Field label="Starts on">
            <input
              type="date"
              value={input.effectiveFrom}
              onChange={(e) => patch({ effectiveFrom: e.target.value })}
            />
          </Field>
          <Field label="Ends on">
            <input
              type="date"
              value={input.effectiveUntil}
              onChange={(e) => patch({ effectiveUntil: e.target.value })}
            />
          </Field>
        </div>
        <h3>Teachers and daily limits</h3>
        <p>
          Enter the daily teaching limit confirmed for each teacher. A weekly average cannot replace
          the daily limit.
        </p>
        {input.teachers.map((t, i) => (
          <fieldset key={t.id || i}>
            <legend>Teacher {i + 1}</legend>
            <div className="form-row">
              <Field label="Teacher">
                <select
                  value={t.id}
                  onChange={(e) =>
                    patch({
                      teachers: input.teachers.map((v, n) =>
                        n === i ? { ...v, id: e.target.value } : v,
                      ),
                    })
                  }
                >
                  <option value="">Choose a teacher</option>
                  {teachers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Daily limit in minutes">
                <input
                  type="number"
                  min="1"
                  value={t.dailyLimitMinutes || ""}
                  onChange={(e) =>
                    patch({
                      teachers: input.teachers.map((v, n) =>
                        n === i ? { ...v, dailyLimitMinutes: Number(e.target.value) } : v,
                      ),
                    })
                  }
                />
              </Field>
              <button
                type="button"
                onClick={() => patch({ teachers: input.teachers.filter((_, n) => n !== i) })}
              >
                Remove teacher {i + 1}
              </button>
            </div>
            {t.unavailable.map((w, j) => (
              <div className="form-row" key={j}>
                <Field label={`Teacher ${i + 1} unavailable day ${j + 1}`}>
                  <Day
                    value={w.weekday}
                    change={(weekday) =>
                      patch({
                        teachers: input.teachers.map((v, n) =>
                          n === i
                            ? {
                                ...v,
                                unavailable: v.unavailable.map((x, k) =>
                                  k === j ? { ...x, weekday } : x,
                                ),
                              }
                            : v,
                        ),
                      })
                    }
                  />
                </Field>
                {(["startsAt", "endsAt"] as const).map((key) => (
                  <Field
                    key={key}
                    label={`${key === "startsAt" ? "From" : "Until"} · teacher ${i + 1} · block ${j + 1}`}
                  >
                    <input
                      type="time"
                      value={w[key]}
                      onChange={(e) =>
                        patch({
                          teachers: input.teachers.map((v, n) =>
                            n === i
                              ? {
                                  ...v,
                                  unavailable: v.unavailable.map((x, k) =>
                                    k === j ? { ...x, [key]: e.target.value } : x,
                                  ),
                                }
                              : v,
                          ),
                        })
                      }
                    />
                  </Field>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      teachers: input.teachers.map((v, n) =>
                        n === i
                          ? { ...v, unavailable: v.unavailable.filter((_, k) => k !== j) }
                          : v,
                      ),
                    })
                  }
                >
                  Remove unavailable block
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                patch({
                  teachers: input.teachers.map((v, n) =>
                    n === i
                      ? {
                          ...v,
                          unavailable: [...v.unavailable, { weekday: 1, startsAt: "", endsAt: "" }],
                        }
                      : v,
                  ),
                })
              }
            >
              Add unavailable time for teacher {i + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          onClick={() =>
            patch({
              teachers: [...input.teachers, { id: "", dailyLimitMinutes: 0, unavailable: [] }],
            })
          }
        >
          Add teacher
        </button>
        <h3>Rooms</h3>
        {input.rooms.map((room, i) => (
          <fieldset key={room.id}>
            <legend>Room {i + 1}</legend>
            <div className="form-row">
              <Field label={`Room ${i + 1} name`}>
                <input
                  value={room.name}
                  onChange={(e) =>
                    patch({
                      rooms: input.rooms.map((v, n) =>
                        n === i ? { ...v, name: e.target.value } : v,
                      ),
                    })
                  }
                />
              </Field>
              <Field label={`Room ${i + 1} capacity`}>
                <input
                  type="number"
                  min="1"
                  value={room.capacity || ""}
                  onChange={(e) =>
                    patch({
                      rooms: input.rooms.map((v, n) =>
                        n === i ? { ...v, capacity: Number(e.target.value) } : v,
                      ),
                    })
                  }
                />
              </Field>
              <Field label={`Room ${i + 1} type`}>
                <input
                  value={room.kind}
                  onChange={(e) =>
                    patch({
                      rooms: input.rooms.map((v, n) =>
                        n === i ? { ...v, kind: e.target.value } : v,
                      ),
                    })
                  }
                  placeholder="Classroom, lab…"
                />
              </Field>
              <button
                type="button"
                onClick={() => patch({ rooms: input.rooms.filter((_, n) => n !== i) })}
              >
                Remove room {i + 1}
              </button>
            </div>
            {room.unavailable.map((block, j) => (
              <div className="form-row" key={j}>
                <Field label={`Room ${i + 1} unavailable day ${j + 1}`}>
                  <Day
                    value={block.weekday}
                    change={(weekday) =>
                      patch({
                        rooms: input.rooms.map((r, n) =>
                          n === i
                            ? {
                                ...r,
                                unavailable: r.unavailable.map((b, k) =>
                                  k === j ? { ...b, weekday } : b,
                                ),
                              }
                            : r,
                        ),
                      })
                    }
                  />
                </Field>
                {(["startsAt", "endsAt"] as const).map((key) => (
                  <Field
                    key={key}
                    label={`Room ${i + 1} block ${j + 1} ${key === "startsAt" ? "start" : "end"}`}
                  >
                    <input
                      type="time"
                      value={block[key]}
                      onChange={(e) =>
                        patch({
                          rooms: input.rooms.map((r, n) =>
                            n === i
                              ? {
                                  ...r,
                                  unavailable: r.unavailable.map((b, k) =>
                                    k === j ? { ...b, [key]: e.target.value } : b,
                                  ),
                                }
                              : r,
                          ),
                        })
                      }
                    />
                  </Field>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      rooms: input.rooms.map((r, n) =>
                        n === i
                          ? { ...r, unavailable: r.unavailable.filter((_, k) => k !== j) }
                          : r,
                      ),
                    })
                  }
                >
                  Remove room unavailable block {j + 1}
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                patch({
                  rooms: input.rooms.map((r, n) =>
                    n === i
                      ? {
                          ...r,
                          unavailable: [...r.unavailable, { weekday: 1, startsAt: "", endsAt: "" }],
                        }
                      : r,
                  ),
                })
              }
            >
              Add unavailable time for room {i + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          onClick={() =>
            patch({
              rooms: [
                ...input.rooms,
                { id: crypto.randomUUID(), name: "", capacity: 0, kind: "", unavailable: [] },
              ],
            })
          }
        >
          Add room
        </button>
        <h3>Available class windows</h3>
        <p>A window can contain several meetings. Breaks should be excluded from these windows.</p>
        {input.slots.map((slot, i) => (
          <div className="form-row" key={i}>
            <Field label={`Window ${i + 1} day`}>
              <Day
                value={slot.weekday}
                change={(weekday) =>
                  patch({ slots: input.slots.map((v, n) => (n === i ? { ...v, weekday } : v)) })
                }
              />
            </Field>
            {(["startsAt", "endsAt"] as const).map((key) => (
              <Field key={key} label={`Window ${i + 1} ${key === "startsAt" ? "start" : "end"}`}>
                <input
                  type="time"
                  value={slot[key]}
                  onChange={(e) =>
                    patch({
                      slots: input.slots.map((v, n) =>
                        n === i ? { ...v, [key]: e.target.value } : v,
                      ),
                    })
                  }
                />
              </Field>
            ))}
            <button
              type="button"
              onClick={() => patch({ slots: input.slots.filter((_, n) => n !== i) })}
            >
              Remove window {i + 1}
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            patch({ slots: [...input.slots, { weekday: 1, startsAt: "", endsAt: "" }] })
          }
        >
          Add class window
        </button>
        <h3>Classes to schedule</h3>
        {input.courses.map((course, i) => (
          <fieldset key={course.id}>
            <legend>Class {i + 1}</legend>
            <div className="form-row">
              <Field label={`Class ${i + 1} section`}>
                <select
                  value={course.sectionId}
                  onChange={(e) =>
                    patch({
                      courses: input.courses.map((v, n) =>
                        n === i ? { ...v, sectionId: e.target.value } : v,
                      ),
                    })
                  }
                >
                  <option value="">Choose a section</option>
                  {sections
                    .filter((s) => !input.schoolYear || s.schoolYear === input.schoolYear)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {s.gradeLevel}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label={`Class ${i + 1} subject`}>
                <select
                  value={course.subjectId}
                  onChange={(e) =>
                    patch({
                      courses: input.courses.map((v, n) =>
                        n === i ? { ...v, subjectId: e.target.value } : v,
                      ),
                    })
                  }
                >
                  <option value="">Choose a subject</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              {(
                ["learnerCount", "meetingsPerWeek", "durationMinutes", "maxMeetingsPerDay"] as const
              ).map((key) => (
                <Field
                  key={key}
                  label={`Class ${i + 1} ${{ learnerCount: "learners", meetingsPerWeek: "weekly meetings", durationMinutes: "minutes per meeting", maxMeetingsPerDay: "maximum meetings per day" }[key]}`}
                >
                  <input
                    type="number"
                    min="1"
                    value={course[key] || ""}
                    onChange={(e) =>
                      patch({
                        courses: input.courses.map((v, n) =>
                          n === i ? { ...v, [key]: Number(e.target.value) } : v,
                        ),
                      })
                    }
                  />
                </Field>
              ))}
            </div>
            <Choices
              label="Eligible teachers"
              values={course.eligibleTeacherIds}
              options={input.teachers.map((t) => ({
                id: t.id,
                name: members.find((m) => m.id === t.id)?.displayName ?? "Choose the teacher first",
              }))}
              change={(eligibleTeacherIds) =>
                patch({
                  courses: input.courses.map((v, n) =>
                    n === i ? { ...v, eligibleTeacherIds } : v,
                  ),
                })
              }
            />
            <Choices
              label="Suitable rooms"
              values={course.roomIds}
              options={input.rooms.map((r) => ({
                id: r.id,
                name: r.name || "Name the room first",
              }))}
              change={(roomIds) =>
                patch({ courses: input.courses.map((v, n) => (n === i ? { ...v, roomIds } : v)) })
              }
            />
            <button
              type="button"
              onClick={() =>
                patch({
                  courses: input.courses.filter((_, n) => n !== i),
                  locks: input.locks.filter((l) => l.courseId !== course.id),
                })
              }
            >
              Remove class {i + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          onClick={() =>
            patch({
              courses: [
                ...input.courses,
                {
                  id: crypto.randomUUID(),
                  sectionId: "",
                  subjectId: "",
                  eligibleTeacherIds: [],
                  roomIds: [],
                  learnerCount: 0,
                  meetingsPerWeek: 0,
                  durationMinutes: 0,
                  maxMeetingsPerDay: 0,
                },
              ],
            })
          }
        >
          Add class
        </button>
        <label className="schedule-confirm">
          <input
            type="checkbox"
            checked={input.dataConfirmed}
            onChange={(e) => {
              setInput({ ...input, dataConfirmed: e.target.checked });
              setDirty(true);
            }}
          />
          I have checked the school's dates, teacher limits, room suitability and class
          requirements.
        </label>
      </fieldset>
      <div className="page-actions">
        <button type="button" disabled={busy || readonly} onClick={() => act("save")}>
          Save draft
        </button>
        <button
          type="button"
          disabled={busy || readonly || dirty || !selected}
          onClick={() => act("generate")}
        >
          Suggest schedule
        </button>
        <button
          type="button"
          disabled={
            busy || readonly || dirty || !input.dataConfirmed || result?.status !== "feasible"
          }
          onClick={() => act("publish")}
        >
          Publish reviewed schedule
        </button>
      </div>
      {dirty && (
        <p role="status">
          Changes are unsaved. Save before generating or publishing; the previous suggestion no
          longer applies.
        </p>
      )}
      {result && (
        <section aria-label="Schedule review">
          <h3>Schedule review</h3>
          <Alert tone={result.status === "feasible" ? "info" : "warning"}>
            {result.status === "feasible"
              ? "A valid suggestion was found. Review the daily loads and meetings before publishing."
              : result.status === "unknown"
                ? "The search stopped before finding an answer. This does not mean the schedule is impossible. Adjust constraints or try again."
                : "No schedule fits the current requirements. Review the issues and relax only constraints the school allows."}
          </Alert>
          {result.issues.length > 0 && (
            <ul>
              {result.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}
          <div className="schedule-table-wrap">
            <table>
              <caption>Suggested meetings</caption>
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col">Teacher</th>
                  <th scope="col">Day</th>
                  <th scope="col">Time</th>
                  <th scope="col">Room</th>
                  <th scope="col">Keep this meeting</th>
                </tr>
              </thead>
              <tbody>
                {result.meetings.map((m) => (
                  <tr key={`${m.courseId}-${m.meetingIndex}`}>
                    <td>
                      {
                        subjects.find(
                          (s) => s.id === input.courses.find((c) => c.id === m.courseId)?.subjectId,
                        )?.name
                      }{" "}
                      ·{" "}
                      {
                        sections.find(
                          (s) => s.id === input.courses.find((c) => c.id === m.courseId)?.sectionId,
                        )?.name
                      }
                    </td>
                    <td>{members.find((t) => t.id === m.teacherId)?.displayName}</td>
                    <td>{DAYS[m.weekday]}</td>
                    <td>
                      {m.startsAt}–{m.endsAt}
                    </td>
                    <td>{input.rooms.find((r) => r.id === m.roomId)?.name}</td>
                    <td>
                      <button
                        type="button"
                        disabled={readonly || busy}
                        onClick={() =>
                          patch({
                            locks: [
                              ...input.locks.filter(
                                (l) =>
                                  !(l.courseId === m.courseId && l.meetingIndex === m.meetingIndex),
                              ),
                              {
                                courseId: m.courseId,
                                meetingIndex: m.meetingIndex,
                                teacherId: m.teacherId,
                                weekday: m.weekday,
                                startsAt: m.startsAt,
                                roomId: m.roomId,
                              },
                            ],
                          })
                        }
                      >
                        Lock meeting {m.meetingIndex + 1}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4>Daily teaching minutes</h4>
          <p>
            Compare each day and teacher. The first suggestion is a feasible arrangement; it is not
            a claim of the fairest possible arrangement.
          </p>
          <ul>
            {input.teachers.map((t) => (
              <li key={t.id}>
                {members.find((m) => m.id === t.id)?.displayName}:{" "}
                {DAYS.map((day, weekday) => {
                  const minutes = result.meetings
                    .filter((m) => m.teacherId === t.id && m.weekday === weekday)
                    .reduce((sum, m) => {
                      const start = m.startsAt.split(":").map(Number);
                      const end = m.endsAt.split(":").map(Number);
                      return (
                        sum +
                        (end[0] ?? 0) * 60 +
                        (end[1] ?? 0) -
                        (start[0] ?? 0) * 60 -
                        (start[1] ?? 0)
                      );
                    }, 0);
                  return minutes ? `${day} ${minutes}/${t.dailyLimitMinutes} min` : "";
                })
                  .filter(Boolean)
                  .join("; ") || "No meetings"}
              </li>
            ))}
          </ul>
        </section>
      )}
      <fieldset disabled={readonly || busy}>
        <legend>Manual fixed meetings</legend>
        <p>
          Choose a class meeting, teacher, day, time and room. Save and generate again to check the
          complete arrangement.
        </p>
        {input.locks.map((lock, i) => (
          <div className="form-row" key={i}>
            <Field label={`Fixed meeting ${i + 1} class`}>
              <select
                value={lock.courseId}
                onChange={(e) =>
                  patch({
                    locks: input.locks.map((l, n) =>
                      n === i ? { ...l, courseId: e.target.value } : l,
                    ),
                  })
                }
              >
                <option value="">Choose a class</option>
                {input.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {subjects.find((s) => s.id === c.subjectId)?.name} ·{" "}
                    {sections.find((s) => s.id === c.sectionId)?.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Fixed meeting ${i + 1} number`}>
              <input
                type="number"
                min="1"
                value={lock.meetingIndex + 1}
                onChange={(e) =>
                  patch({
                    locks: input.locks.map((l, n) =>
                      n === i ? { ...l, meetingIndex: Number(e.target.value) - 1 } : l,
                    ),
                  })
                }
              />
            </Field>
            <Field label={`Fixed meeting ${i + 1} teacher`}>
              <select
                value={lock.teacherId}
                onChange={(e) =>
                  patch({
                    locks: input.locks.map((l, n) =>
                      n === i ? { ...l, teacherId: e.target.value } : l,
                    ),
                  })
                }
              >
                <option value="">Choose a teacher</option>
                {input.teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {members.find((m) => m.id === t.id)?.displayName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Fixed meeting ${i + 1} day`}>
              <Day
                value={lock.weekday}
                change={(weekday) =>
                  patch({ locks: input.locks.map((l, n) => (n === i ? { ...l, weekday } : l)) })
                }
              />
            </Field>
            <Field label={`Fixed meeting ${i + 1} start`}>
              <input
                type="time"
                value={lock.startsAt}
                onChange={(e) =>
                  patch({
                    locks: input.locks.map((l, n) =>
                      n === i ? { ...l, startsAt: e.target.value } : l,
                    ),
                  })
                }
              />
            </Field>
            <Field label={`Fixed meeting ${i + 1} room`}>
              <select
                value={lock.roomId}
                onChange={(e) =>
                  patch({
                    locks: input.locks.map((l, n) =>
                      n === i ? { ...l, roomId: e.target.value } : l,
                    ),
                  })
                }
              >
                <option value="">Choose a room</option>
                {input.rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            patch({
              locks: [
                ...input.locks,
                {
                  courseId: "",
                  meetingIndex: 0,
                  teacherId: "",
                  weekday: 1,
                  startsAt: "",
                  roomId: "",
                },
              ],
            })
          }
        >
          Add fixed meeting
        </button>
      </fieldset>
      {input.locks.length > 0 && (
        <section aria-label="Fixed meetings">
          <h3>Fixed meetings</h3>
          <p>
            Saved locks constrain the next suggestion. Remove a lock to allow another arrangement.
          </p>
          <ul>
            {input.locks.map((l, i) => (
              <li key={i}>
                {DAYS[l.weekday]} {l.startsAt} · meeting {l.meetingIndex + 1}
                <button
                  type="button"
                  disabled={readonly || busy}
                  onClick={() => patch({ locks: input.locks.filter((_, n) => n !== i) })}
                >
                  Unlock meeting {i + 1}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}
