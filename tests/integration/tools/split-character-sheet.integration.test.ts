import { describe, it, expect, beforeEach } from 'vitest';
import sharp from 'sharp';
import { createTool } from '../../../backend/tools/registry.js';
import '../../../backend/tools/index.js';
import { getArtifactRepository } from '../../../backend/infrastructure/repositories.js';

describe('Tools / split_character_sheet', () => {
  const sessionId = 'split-character-sheet-test';

  beforeEach(async () => {
    const artifactRepo = getArtifactRepository();
    await artifactRepo.delete(sessionId, '.');
    await artifactRepo.write(sessionId, 'images/.gitkeep', '');
  });

  it('splits a 2x2 character sheet into four slot images', async () => {
    const sheetBuffer = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([
        { input: { create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 0, b: 0 } } }, top: 0, left: 0 },
        { input: { create: { width: 200, height: 200, channels: 3, background: { r: 0, g: 255, b: 0 } } }, top: 0, left: 200 },
        { input: { create: { width: 200, height: 200, channels: 3, background: { r: 0, g: 0, b: 255 } } }, top: 200, left: 0 },
        { input: { create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 255, b: 0 } } }, top: 200, left: 200 },
      ])
      .png()
      .toBuffer();

    const artifactRepo = getArtifactRepository();
    await artifactRepo.write(sessionId, 'images/character_sheet_4grid.png', sheetBuffer);

    const tool = await createTool(
      'split_character_sheet',
      { enable: true },
      {
        getDefaultSessionId: () => sessionId,
        requestApprovalViaHITL: async (_actionType, payload) => payload,
      }
    );

    if (!tool) {
      throw new Error('split_character_sheet tool was not registered');
    }

    const result = await tool.invoke({
      imagePath: 'images/character_sheet_4grid.png',
      sessionId,
    });

    expect(result).toMatchObject({
      imagePath: 'images/character_sheet_4grid.png',
      slotImages: {
        slot1: 'images/character_slot1.png',
        slot2: 'images/character_slot2.png',
        slot3: 'images/character_slot3.png',
        slot4: 'images/character_slot4.png',
      },
    });

    const slot1 = await sharp(artifactRepo.resolvePath(sessionId, 'images/character_slot1.png')).stats();
    const slot2 = await sharp(artifactRepo.resolvePath(sessionId, 'images/character_slot2.png')).stats();
    const slot3 = await sharp(artifactRepo.resolvePath(sessionId, 'images/character_slot3.png')).stats();
    const slot4 = await sharp(artifactRepo.resolvePath(sessionId, 'images/character_slot4.png')).stats();

    expect(slot1.channels[0]?.mean).toBeGreaterThan(200);
    expect(slot1.channels[1]?.mean).toBeLessThan(50);
    expect(slot2.channels[1]?.mean).toBeGreaterThan(200);
    expect(slot3.channels[2]?.mean).toBeGreaterThan(200);
    expect(slot4.channels[0]?.mean).toBeGreaterThan(200);
    expect(slot4.channels[1]?.mean).toBeGreaterThan(200);
  });
});