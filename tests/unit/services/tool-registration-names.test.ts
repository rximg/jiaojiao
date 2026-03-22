import { describe, expect, it } from 'vitest';
import '../../../backend/tools/index.js';
import { getRegisteredToolNames } from '../../../backend/tools/registry.js';

describe('tool registration names', () => {
  it('registers only the new public tool names', () => {
    const registeredNames = getRegisteredToolNames();

    expect(registeredNames).toContain('split_grid_image');
    expect(registeredNames).toContain('generate_audio');
    expect(registeredNames).toContain('annotate_image_with_numbers');

    expect(registeredNames).not.toContain('split_character_sheet');
    expect(registeredNames).not.toContain('synthesize_speech_single');
    expect(registeredNames).not.toContain('annotate_image_numbers');
  });
});