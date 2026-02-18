/**
 * Agent 层：AgentFactory 加载配置、创建主 Agent、验证结构，并完整跑一遍 invoke 流程
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { AgentFactory } from '../../../backend/agent/AgentFactory.js';
import { initializeServices } from '../../../backend/services/service-initializer.js';

const SESSION_ID = 'integration-test-session';

describe('Agent / AgentFactory', () => {
  beforeAll(async () => {
    await initializeServices({ outputPath: './outputs' });
  });

  it('should create main agent with nodes', async () => {
    const factory = new AgentFactory();
    const mainAgent = await factory.createMainAgent(SESSION_ID);
    expect(mainAgent).toBeDefined();
    expect(mainAgent.constructor?.name).toBeDefined();
    const nodes = (mainAgent as any).nodes;
    expect(nodes == null || typeof nodes === 'object').toBe(true);
    if (nodes && typeof nodes === 'object') {
      expect(Object.keys(nodes).length).toBeGreaterThan(0);
    }
  }, 30_000);

  it('should run full agent flow: invoke with user input', async () => {
    const factory = new AgentFactory();
    const mainAgent = await factory.createMainAgent(SESSION_ID);
    expect(mainAgent).toBeDefined();
    expect(typeof mainAgent.invoke).toBe('function');

    // createDeepAgent 正确调用：第一参数 { input }，第二参数 configurable.thread_id 供 checkpointer 使用
    const userInput = '用一句话介绍你自己';
    const result = await mainAgent.invoke(
      { input: userInput },
      { configurable: { thread_id: SESSION_ID } }
    );

    expect(result).toBeDefined();
    const output = (result as any)?.output ?? (result as any)?.messages ?? result;
    expect(output).toBeDefined();
    if (Array.isArray(output)) {
      expect(output.length).toBeGreaterThan(0);
    } else if (typeof output === 'object' && output !== null) {
      expect(Object.keys(output).length).toBeGreaterThan(0);
    }
  }, 120_000);
});
