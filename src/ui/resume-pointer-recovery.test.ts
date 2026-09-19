import { describe, expect, it, vi } from "vitest";
import { recoverResumePointer, type ResumePointerAuthority } from "./resume-pointer-recovery";
import {
  writeAdvisoryResumePointer,
  writeClassResumePointer,
  type ResumePointerStorage,
} from "./resume-pointer";

function memoryStorage(): ResumePointerStorage & { value: string | null } {
  const storage = {
    value: null as string | null,
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

function authority(overrides: Partial<ResumePointerAuthority> = {}): ResumePointerAuthority {
  return {
    findAuthorizedClass: vi.fn().mockResolvedValue(null),
    isAuthorizedAdvisorySection: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

describe("resume pointer recovery", () => {
  it("rebuilds friendly class context only from current authorized scope", async () => {
    const storage = memoryStorage();
    writeClassResumePointer(
      "teacher-1",
      {
        teachingAssignmentId: "assignment-1",
        subjectName: "Old label",
        sectionName: "Old label",
      },
      storage,
    );
    const current = {
      teachingAssignmentId: "assignment-1",
      subjectName: "Current synthetic subject",
      sectionName: "Current synthetic section",
    };
    const auth = authority({ findAuthorizedClass: vi.fn().mockResolvedValue(current) });

    await expect(recoverResumePointer("teacher-1", auth, storage)).resolves.toEqual({
      destination: "class",
      context: current,
    });
  });

  it("discards a pointer belonging to another signed-in user before authorization lookup", async () => {
    const storage = memoryStorage();
    writeAdvisoryResumePointer("teacher-1", { sectionId: "section-1" }, storage);
    const auth = authority();

    await expect(recoverResumePointer("teacher-2", auth, storage)).resolves.toBeNull();
    expect(auth.isAuthorizedAdvisorySection).not.toHaveBeenCalled();
    expect(storage.value).toBeNull();
  });

  it("discards a class pointer when the assignment is no longer authorized", async () => {
    const storage = memoryStorage();
    writeClassResumePointer(
      "teacher-1",
      {
        teachingAssignmentId: "assignment-1",
        subjectName: "Synthetic",
        sectionName: "Synthetic",
      },
      storage,
    );

    await expect(recoverResumePointer("teacher-1", authority(), storage)).resolves.toBeNull();
    expect(storage.value).toBeNull();
  });

  it("restores advisory navigation only after current adviser authorization succeeds", async () => {
    const storage = memoryStorage();
    writeAdvisoryResumePointer("teacher-1", { sectionId: "section-1" }, storage);
    const auth = authority({ isAuthorizedAdvisorySection: vi.fn().mockResolvedValue(true) });

    await expect(recoverResumePointer("teacher-1", auth, storage)).resolves.toEqual({
      destination: "advisory",
      context: { sectionId: "section-1" },
    });
  });

  it("fails closed and clears the pointer when revalidation cannot complete", async () => {
    const storage = memoryStorage();
    writeAdvisoryResumePointer("teacher-1", { sectionId: "section-1" }, storage);
    const auth = authority({
      isAuthorizedAdvisorySection: vi
        .fn()
        .mockRejectedValue(new Error("offline boundary unavailable")),
    });

    await expect(recoverResumePointer("teacher-1", auth, storage)).resolves.toBeNull();
    expect(storage.value).toBeNull();
  });
});
