import { Memory, CreateMemoryInput, UpdateMemoryInput, MemoryStatus } from '../types/memory.types.js'

// State type from Motia step context
type State = {
  get<T>(namespace: string, key: string): Promise<T | null>
  set(namespace: string, key: string, value: any): Promise<void>
  delete(namespace: string, key: string): Promise<void>
  list(namespace: string): Promise<string[]>
}

/**
 * Generate a unique ID for memories
 */
function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Memory Service - Handles all memory-related business logic
 */
export const memoryService = {
  /**
   * Create a new memory
   */
  async create(input: CreateMemoryInput, state: State): Promise<Memory> {
    const id = generateId()
    const now = new Date().toISOString()

    const memory: Memory = {
      id,
      ...input,
      status: input.triggerType === 'date' ? 'scheduled' : 'active',
      createdAt: now,
      updatedAt: now,
    }

    await state.set('memories', id, memory)
    return memory
  },

  /**
   * Get a memory by ID
   */
  async getById(id: string, state: State): Promise<Memory | null> {
    return await state.get<Memory>('memories', id)
  },

  /**
   * Get all memories with optional filters
   */
  async getAll(state: State, status?: MemoryStatus, teamId?: string): Promise<Memory[]> {
    const allKeys = await state.list('memories')
    const memories: Memory[] = []

    for (const key of allKeys) {
      const memory = await state.get<Memory>('memories', key)
      if (memory) {
        if (status && memory.status !== status) continue
        if (teamId && memory.teamId !== teamId) continue
        memories.push(memory)
      }
    }

    return memories.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  },

  /**
   * Update a memory
   */
  async update(id: string, input: UpdateMemoryInput, state: State): Promise<Memory | null> {
    const existing = await state.get<Memory>('memories', id)

    if (!existing) {
      return null
    }

    const now = new Date().toISOString()
    const updated: Memory = {
      ...existing,
      ...input,
      updatedAt: now,
    }

    if (input.status === 'triggered' && existing.status !== 'triggered') {
      updated.triggeredAt = now
    }

    await state.set('memories', id, updated)
    return updated
  },

  /**
   * Delete a memory
   */
  async delete(id: string, state: State): Promise<Memory | null> {
    const existing = await state.get<Memory>('memories', id)

    if (!existing) {
      return null
    }

    await state.delete('memories', id)
    return existing
  },

  /**
   * Get memories scheduled before a certain date
   */
  async getScheduledBefore(date: Date, state: State): Promise<Memory[]> {
    const allMemories = await this.getAll(state, 'scheduled')

    return allMemories.filter((memory) => {
      if (!memory.triggerDate) return false
      return new Date(memory.triggerDate) <= date
    })
  },

  /**
   * Get statistics about memories
   */
  async getStats(state: State, teamId?: string): Promise<{
    total: number
    active: number
    scheduled: number
    triggered: number
    archived: number
    byType: Record<string, number>
  }> {
    const allMemories = await this.getAll(state, undefined, teamId)

    const byType: Record<string, number> = {
      future: 0,
      decision: 0,
      failure: 0,
      context: 0,
    }

    allMemories.forEach((m) => {
      byType[m.type] = (byType[m.type] || 0) + 1
    })

    return {
      total: allMemories.length,
      active: allMemories.filter((m) => m.status === 'active').length,
      scheduled: allMemories.filter((m) => m.status === 'scheduled').length,
      triggered: allMemories.filter((m) => m.status === 'triggered').length,
      archived: allMemories.filter((m) => m.status === 'archived').length,
      byType,
    }
  },
}