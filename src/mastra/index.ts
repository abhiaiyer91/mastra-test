import { Mastra, MastraStorageLibSql } from '@mastra/core';
import { LibSQLVector } from '@mastra/vector-libsql';
import { catOne, agentTwo } from './agents/agent';
import { logCatWorkflow } from './workflow';

const storage = new MastraStorageLibSql({
  config: {
    url: 'file:memory:'
  }
})

const vector = new LibSQLVector({
  connectionUrl: 'file:memory:',
})

export const mastra = new Mastra({
  agents: { catOne, agentTwo },
  workflows: { logCatWorkflow },
  storage,
  vectors: {
    libsql: vector
  }
});