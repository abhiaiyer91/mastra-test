import { Mastra } from '@mastra/core';
import { musicAgent } from './agents/music';

export const mastra = new Mastra({
  agents: { musicAgent },
});