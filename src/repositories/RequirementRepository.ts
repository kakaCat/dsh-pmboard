/**
 * RequirementRepository
 *
 * 需求仓储：需求记录的读写（内存实现用于测试与简单场景）。
 *
 * REQ-261008011118-defe BUG-1（DD-1）：原先还带「运行态 / checkpoint」三方法
 * （`updateRunState` / `readCheckpoint` / `clearCheckpoint`）——它们在**生产代码零调用方**，
 * 与 `CheckpointManager` 同一族死代码（run 进度改由 `advance.runId/lockAt/history` 表达）。
 * 故随死字段一起删除，本接口收敛为「取记录 / 存记录」两件事。
 */

import type { RequirementRecord } from '../client/types.js'

/**
 * 需求仓储接口
 */
export interface RequirementRepository {
  /**
   * 获取需求记录
   * 
   * @param reqId 需求ID
   * @returns 需求记录或 null
   */
  getRequirement(reqId: string): Promise<RequirementRecord | null>
  
  /**
   * 更新需求记录
   * 
   * @param requirement 需求记录
   */
  updateRequirement(requirement: RequirementRecord): Promise<void>
}

/**
 * 内存实现（用于测试和简单场景）
 */
export class InMemoryRequirementRepository implements RequirementRepository {
  private requirements = new Map<string, RequirementRecord>()
  
  async getRequirement(reqId: string): Promise<RequirementRecord | null> {
    return this.requirements.get(reqId) || null
  }
  
  async updateRequirement(requirement: RequirementRecord): Promise<void> {
    this.requirements.set(requirement.id, requirement)
  }
  
  // 测试辅助方法
  seed(requirement: RequirementRecord): void {
    this.requirements.set(requirement.id, requirement)
  }
  
  clear(): void {
    this.requirements.clear()
  }
}
