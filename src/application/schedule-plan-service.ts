import type { SchedulePlanRepository } from '../domain/ports/schedule-plan-repository';
import type { SchedulePlanInput } from '../domain/schedule-plan';
export class SchedulePlanApplicationService {
 constructor(private readonly repository: SchedulePlanRepository) {}
 list() { return this.repository.list(); }
 save(input: SchedulePlanInput, id?: string, expectedRevision?: number) { return this.repository.save(input, id, expectedRevision); }
 generate(id: string, expectedRevision: number, maxNodes?: number) { return this.repository.generate(id, expectedRevision, maxNodes); }
 publish(id: string, expectedRevision: number) { return this.repository.publish(id, expectedRevision); }
 copy(id: string) { return this.repository.copy(id); }
 listMine(date: string) { return this.repository.listMine(date); }
}
