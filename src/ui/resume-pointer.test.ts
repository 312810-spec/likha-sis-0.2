import { describe, expect, it } from "vitest";
import {
  clearResumePointer,
  readResumePointer,
  writeAdvisoryResumePointer,
  writeClassResumePointer,
  type ResumePointerStorage,
} from "./resume-pointer";

function memoryStorage(initial?: string): ResumePointerStorage & { value: string | null } {
  const storage = {
    value: initial ?? null,
    getItem: () => storage.value,
    setItem: (_key: string, value: string) => {
      storage.value = value;
    },
    removeItem: () => {
      storage.value = null;
    },
  };
  return storage;
}

describe("resume pointer storage", () => {
  it("stores only the canonical class assignment pointer and user binding", () => {
    const storage = memoryStorage();
    writeClassResumePointer(
      "teacher-1",
      {
        teachingAssignmentId: "assignment-1",
        subjectName: "Synthetic Filipino",
        sectionName: "Synthetic Joy",
        room: "Room 1",
      },
      storage,
    );

    expect(readResumePointer(storage)).toEqual({
      version: 1,
      userId: "teacher-1",
      destination: "class",
      teachingAssignmentId: "assignment-1",
    });
    expect(storage.value).not.toContain("Synthetic Filipino");
    expect(storage.value).not.toContain("Synthetic Joy");
    expect(storage.value).not.toContain("Room 1");
  });

  it("stores only the advisory section pointer and user binding", () => {
    const storage = memoryStorage();
    writeAdvisoryResumePointer("teacher-1", { sectionId: "section-1" }, storage);

    expect(readResumePointer(storage)).toEqual({
      version: 1,
      userId: "teacher-1",
      destination: "advisory",
      advisorySectionId: "section-1",
    });
  });

  it("discards corrupt or structurally stale local state", () => {
    const storage = memoryStorage('{"version":99,"userId":"teacher-1","destination":"class"}');
    expect(readResumePointer(storage)).toBeNull();
    expect(storage.value).toBeNull();
  });

  it("can be cleared without touching any academic storage", () => {
    const storage = memoryStorage();
    writeAdvisoryResumePointer("teacher-1", { sectionId: "section-1" }, storage);
    clearResumePointer(storage);
    expect(readResumePointer(storage)).toBeNull();
  });
});
