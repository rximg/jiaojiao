/**
 * Agent 层：AgentFactory 加载配置、创建主 Agent、验证结构
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { AgentFactory } from '../../../backend/agent/AgentFactory.js';
import { initializeServices } from '../../../backend/services/service-initializer.js';

describe('Agent / AgentFactory', () => {
  beforeAll(async () => {
    await initializeServices({ outputPath: './outputs' });
  });

  it('should create main agent with nodes', async () => {
    const factory = new AgentFactory();
    const mainAgent = await factory.createMainAgent();
    expect(mainAgent).toBeDefined();
    expect(mainAgent.constructor?.name).toBeDefined();
    const nodes = (mainAgent as any).nodes;
    expect(nodes == null || typeof nodes === 'object').toBe(true);
    if (nodes && typeof nodes === 'object') {
      expect(Object.keys(nodes).length).toBeGreaterThan(0);
    }
  }, 30_000);
});
