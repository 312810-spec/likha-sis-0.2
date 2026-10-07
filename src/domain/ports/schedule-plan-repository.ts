import type { SchedulePlan, SchedulePlanInput, PublishedTeacherMeeting } from '../schedule-plan';
export interface SchedulePlanRepository {
 list(): Promise<SchedulePlan[]>;
 save(input: SchedulePlanInput, id?: string, expectedRevision?: number): Promise<SchedulePlan>;
 generate(id: string, expectedRevision: number, maxNodes?: number): Promise<SchedulePlan>;
 publish(id: string, expectedRevision: number): Promise<SchedulePlan>;
 copy(id: string): Promise<SchedulePlan>;
 listMine(date: string): Promise<PublishedTeacherMeeting[]>;
}
