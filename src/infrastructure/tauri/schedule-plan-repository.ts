import type { SchedulePlanRepository } from '../../domain/ports/schedule-plan-repository';
import type { SchedulePlan, SchedulePlanInput, PublishedTeacherMeeting } from '../../domain/schedule-plan';
import { invoke } from './invoke';
export class TauriSchedulePlanRepository implements SchedulePlanRepository {
 list() { return invoke<SchedulePlan[]>('list_schedule_plans'); }
 save(input: SchedulePlanInput, id?: string, expectedRevision?: number) { return invoke<SchedulePlan>('save_schedule_plan', { input, id: id ?? null, expectedRevision: expectedRevision ?? null }); }
 generate(id: string, expectedRevision: number, maxNodes?: number) { return invoke<SchedulePlan>('generate_schedule_plan', { id, expectedRevision, maxNodes: maxNodes ?? null }); }
 publish(id: string, expectedRevision: number) { return invoke<SchedulePlan>('publish_schedule_plan', { id, expectedRevision }); }
 copy(id: string) { return invoke<SchedulePlan>('copy_schedule_plan', { id }); }
 listMine(date: string) { return invoke<PublishedTeacherMeeting[]>('list_my_published_schedule', { date }); }
}
