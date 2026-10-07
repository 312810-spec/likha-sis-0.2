import type { SchedulePlanRepository } from "../domain/ports/schedule-plan-repository";
import type { SchedulePlan, SchedulePlanInput } from "../domain/schedule-plan";
import type { SchoolPlanningRepository } from "../domain/ports/school-planning-repository";
import type { SchoolPlanningItem } from "../domain/school-planning";
import type { SchoolResourcesRepository } from "../domain/ports/school-resources-repository";
import type {
  Attachment,
  ResourceIssue,
  SupportPlan,
  SupportSession,
} from "../domain/school-resources";
/** Synthetic browser storage only: deliberately no Tauri, database or authentication. */
export function previewScheduleRepository(): SchedulePlanRepository {
  const plans: SchedulePlan[] = [];
  const find = (id: string, revision?: number) => {
    const p = plans.find((p) => p.id === id);
    if (!p || (revision !== undefined && p.revision !== revision))
      throw new Error("This version changed. Reload your draft.");
    return p;
  };
  const create = (input: SchedulePlanInput) => {
    const p: SchedulePlan = {
      id: crypto.randomUUID(),
      revision: 1,
      status: "draft",
      input: structuredClone(input),
      result: null,
      publishedAt: null,
    };
    plans.push(p);
    return structuredClone(p);
  };
  return {
    list: async () => structuredClone(plans),
    save: async (input, id, revision) => {
      if (!id) return create(input);
      const p = find(id, revision);
      if (p.status === "published") throw new Error("Copy the published plan first.");
      p.input = structuredClone(input);
      p.result = null;
      p.revision++;
      return structuredClone(p);
    },
    copy: async (id) => create({ ...find(id).input, dataConfirmed: false }),
    generate: async (id, revision) => {
      const p = find(id, revision);
      p.result = {
        status: "unknown",
        meetings: [],
        issues: [
          "Browser preview does not run the native scheduling engine. Use the installed app to generate and validate a proposal.",
        ],
        exploredNodes: 0,
      };
      p.revision++;
      return structuredClone(p);
    },
    publish: async () => {
      throw new Error("Browser fixtures cannot publish school schedules.");
    },
    listMine: async () => [],
  };
}
export function previewPlanningRepository(): SchoolPlanningRepository {
  const items: SchoolPlanningItem[] = [];
  return {
    list: async () => structuredClone(items),
    save: async (input, id, revision) => {
      let item = items.find((i) => i.id === id);
      if (id && (!item || item.revision !== revision))
        throw new Error("This item changed. Reload before saving.");
      if (item) {
        item.input = structuredClone(input);
        item.revision++;
        item.updatedAt = new Date().toISOString();
      } else {
        item = {
          id: crypto.randomUUID(),
          revision: 1,
          input: structuredClone(input),
          updatedAt: new Date().toISOString(),
        };
        items.push(item);
      }
      return structuredClone(item);
    },
  };
}
export function previewResourcesRepository(): SchoolResourcesRepository {
  const attachments: Attachment[] = [];
  const bytes = new Map<string, number[]>();
  const issues: ResourceIssue[] = [];
  const plans: SupportPlan[] = [];
  const sessions = new Map<string, SupportSession[]>();
  return {
    listAttachments: async () => structuredClone(attachments),
    saveAttachment: async (input) => {
      const id = crypto.randomUUID();
      const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(input.bytes));
      attachments.push({
        id,
        filename: input.filename,
        mimeType: input.mimeType,
        sha256: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(""),
        previousId: input.previousId,
        linkKind: input.linkKind,
        linkId: input.linkId,
        createdAt: new Date().toISOString(),
      });
      bytes.set(id, [...input.bytes]);
      return id;
    },
    readAttachment: async (id) => {
      const value = bytes.get(id);
      if (!value) throw new Error("Synthetic file is missing.");
      return [...value];
    },
    listIssues: async () => structuredClone(issues),
    issue: async (learnerId, resourceName, quantity, issuedOn) => {
      const id = crypto.randomUUID();
      issues.push({
        id,
        learnerId,
        resourceName,
        issuedQuantity: quantity,
        returnedQuantity: 0,
        issuedOn,
      });
      return id;
    },
    returnResource: async (id, quantity) => {
      const issue = issues.find((i) => i.id === id);
      if (!issue || quantity > issue.issuedQuantity - issue.returnedQuantity)
        throw new Error("Return exceeds the outstanding quantity.");
      issue.returnedQuantity += quantity;
      return crypto.randomUUID();
    },
    listSupportPlans: async () => structuredClone(plans),
    createSupportPlan: async (learnerId, goal, evidence, followUpOn) => {
      const id = crypto.randomUUID();
      plans.push({ id, learnerId, goal, evidence, followUpOn });
      return id;
    },
    listSupportSessions: async (id) => structuredClone(sessions.get(id) ?? []),
    recordSupportSession: async (id, sessionOn, observation, nextStep) => {
      const session = { id: crypto.randomUUID(), sessionOn, observation, nextStep };
      sessions.set(id, [...(sessions.get(id) ?? []), session]);
      return session.id;
    },
  };
}

import type { ReviewWorkflowRepository } from "../domain/ports/review-workflow-repository";
import type { ReviewPacket, ReviewHistory } from "../domain/review-workflow";
export function previewReviewRepository(): ReviewWorkflowRepository {
  const packets: ReviewPacket[] = [];
  const histories = new Map<string, ReviewHistory[]>();
  return {
    list: async () => structuredClone(packets),
    act: async (request) => {
      if (request.action !== "create" && request.action !== "save")
        throw new Error(
          "School review and canonical snapshots require the native app. Browser fixtures retain drafts only.",
        );
      if (!request.content || !request.sectionId)
        throw new Error("Choose a section and enter draft content.");
      let packet = packets.find((p) => p.id === request.id);
      if (request.id && (!packet || packet.revision !== request.expectedRevision))
        throw new Error("Draft changed. Reload before saving.");
      const content = structuredClone(request.content);
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(content)),
      );
      const contentHash = Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      if (packet) {
        packet.content = content;
        packet.contentHash = contentHash;
        packet.revision++;
        packet.updatedAt = new Date().toISOString();
      } else {
        packet = {
          id: crypto.randomUUID(),
          schoolId: "synthetic-school",
          ownerUserId: "teacher-ana",
          reviewerUserId: null,
          sectionId: request.sectionId,
          revision: 1,
          status: "draft",
          content,
          contentHash,
          parentPacketId: null,
          updatedAt: new Date().toISOString(),
        };
        packets.push(packet);
      }
      histories.set(packet.id, [
        ...(histories.get(packet.id) ?? []),
        {
          revision: packet.revision,
          actorUserId: "teacher-ana",
          action: request.action,
          reason: request.reason,
          content,
          contentHash,
          status: packet.status,
          reviewerUserId: null,
          recordedAt: packet.updatedAt,
        },
      ]);
      return structuredClone(packet);
    },
    history: async (id) => structuredClone(histories.get(id) ?? []),
    exportSample: async (id) => {
      const packet = packets.find((p) => p.id === id);
      if (!packet) throw new Error("Draft missing.");
      return JSON.stringify({ synthetic: true, packet });
    },
    importSample: async () => {
      throw new Error("Use the native app to validate imported sample packages.");
    },
  };
}

import type { SchoolOfferingsRepository } from "../domain/ports/school-offerings-repository";
import type { SchoolOffering } from "../domain/school-offerings";
export function previewOfferingsRepository(): SchoolOfferingsRepository {
  const items: SchoolOffering[] = [];
  return {
    list: async () => structuredClone(items),
    save: async (input) => {
      const id = crypto.randomUUID();
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(input)),
      );
      items.push({
        id,
        input: structuredClone(input),
        snapshotHash: Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join(
          "",
        ),
        createdAt: new Date().toISOString(),
      });
      return id;
    },
  };
}
